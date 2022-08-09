---
title: Android - Binder机制(4)-线程池启动
date: 2021-10-20 22:34:11
tags:
categories: Android
copyright: true
password:
---



> Binder 线程池启动分析；

<!--more-->

AOSP： [android-12.1.0_r4](https://android.googlesource.com/device/common/+/refs/tags/android-12.1.0_r4)，kernel：[android12-5.10](https://android.googlesource.com/kernel/common/+/refs/heads/android12-5.10)

# 1. zygoteInit()

不管是 fork system_server，还是 fork 普通 app，最后都会调用  Zygote.zygoteInit() 函数，我们来看一下：

``` java
// ZygoteInit.java
    public static Runnable zygoteInit(int targetSdkVersion, long[] disabledCompatChanges,
            String[] argv, ClassLoader classLoader) {
        if (RuntimeInit.DEBUG) {
            Slog.d(RuntimeInit.TAG, "RuntimeInit: Starting application from zygote");
        }

        Trace.traceBegin(Trace.TRACE_TAG_ACTIVITY_MANAGER, "ZygoteInit");
        RuntimeInit.redirectLogStreams();

        RuntimeInit.commonInit();
        ZygoteInit.nativeZygoteInit();
        return RuntimeInit.applicationInit(targetSdkVersion, disabledCompatChanges, argv,
                classLoader);
    }
    private static native void nativeZygoteInit();
```

调用了 nativeZygoteInit() 这个 native 方法，在 [SystemServer 启动流程 1.4 小节](https://rangerzhou.top/2021/11/01/Android/AndroidDevelop_010_SystemServer/#1-4-zygoteInit) 已经分析过，最终是调用 AppRuntime.onZygoteInit() 中，

``` cpp
// app_main.cpp
class AppRuntime : public AndroidRuntime
{
    virtual void onZygoteInit()
    {
        sp<ProcessState> proc = ProcessState::self(); // 打开驱动
        ALOGV("App process: starting thread pool.\n");
        proc->startThreadPool(); // 启动线程池
    }
```

ProcessState::self() 主要工作是打开 */dev/binder* 驱动，再使用 mmap() 对把内核空间和用户空间映射到同一块物理内存，最后把 binder 驱动的文件描述符赋值给 ProcessState 的 mDriverFD 变量，ProcessState.startThreadPool() 从函数名可以看出是要启动一个线程池；

# 2. startThreadPool()

``` cpp
// ProcessState.cpp
void ProcessState::startThreadPool()
{
    AutoMutex _l(mLock);
    if (!mThreadPoolStarted) {
        mThreadPoolStarted = true;
        spawnPooledThread(true);
    }
}
```

这里调用 spawnPooledThread() 函数，传入的参数 `mThreadPoolStarted = true`，这个参数代表此次创建的是主线程，以及通过此变量值保证每个 app 进程只允许启动一个 binder 线程池，也就是说每次 fork 新进程都会启动一个 binder 线程池，且只允许启动一个 binder 线程池；

# 3. spawnPooledThread()

``` cpp
// ProcessState.cpp
void ProcessState::spawnPooledThread(bool isMain)
{
    if (mThreadPoolStarted) {
        String8 name = makeBinderThreadName(); // binder 线程名
        ALOGV("Spawning new pooled thread, name=%s\n", name.string());
        sp<Thread> t = sp<PoolThread>::make(isMain);
        t->run(name.string());
    }
}
```

makeBinderThreadName() 创建了一个线程名称，格式是 `Binder:pid_X`，X 为整数，每个进程中都是从 1 开始递增，只有通过 spawnPooledThread() 创建的线程才符合这个格式，直接通过 joinThreadPool() 加入线程池的线程不符合这个命名规则，然后创建了一个 PoolThread 线程对象，并执行 run() 启动线程，PoolThread 名字看起来是线程池，其实继承自 Thread，只是创建一个线程；

# 4. PoolThread.threadLoop()

``` cpp
// ProcessState.cpp
class PoolThread : public Thread
{
public:
    explicit PoolThread(bool isMain)
        : mIsMain(isMain)
    {
    }

protected:
    virtual bool threadLoop()
    {
        IPCThreadState::self()->joinThreadPool(mIsMain);
        return false;
    }

    const bool mIsMain;
};
```

run() 方法最终会调用 threadLoop()，这里的 mIsMain 就是前面传入的 mThreadPoolStarted 值，为 true，接着进入 IPCThreadState.joinThreadPool()；

# 5. joinThreadPool()

``` cpp
// IPCThreadState.cpp
void IPCThreadState::joinThreadPool(bool isMain)
{
    LOG_THREADPOOL("**** THREAD %p (PID %d) IS JOINING THE THREAD POOL\n", (void*)pthread_self(), getpid());

    mOut.writeInt32(isMain ? BC_ENTER_LOOPER : BC_REGISTER_LOOPER);

    mIsLooper = true;
    status_t result;
    do {
        processPendingDerefs(); // 清除队列的引用
        // now get the next command to be processed, waiting if necessary
        result = getAndExecuteCommand();

        if (result < NO_ERROR && result != TIMED_OUT && result != -ECONNREFUSED && result != -EBADF) {
            LOG_ALWAYS_FATAL("getAndExecuteCommand(fd=%d) returned unexpected error %d, aborting",
                  mProcess->mDriverFD, result);
        }

        // Let this thread exit the thread pool if it is no longer
        // needed and it is not the main process thread.
        if(result == TIMED_OUT && !isMain) { // 非主线程出现 TIMED_OUT 则线程退出
            break;
        }
    } while (result != -ECONNREFUSED && result != -EBADF);

    LOG_THREADPOOL("**** THREAD %p (PID %d) IS LEAVING THE THREAD POOL err=%d\n",
        (void*)pthread_self(), getpid(), result);

    mOut.writeInt32(BC_EXIT_LOOPER); // 线程退出循环
    mIsLooper = false;
    talkWithDriver(false);
}
```

对于主线程，cmd 为 BC_ENTER_LOOPER，isMain 为 false 时 cmd 则为 BC_REGISTER_LOOPER，表示是由 Binder 驱动创建的线程；接下来调用 `getAndExecuteCommand() -> talkWithDriver() -> ioctl() -> binder_ioctl() -> binder_ioctl_write_read()`，先执行 binder_thread_write()：

# 6. binder_thread_write()

``` c
// binder.c
static int binder_thread_write(struct binder_proc *proc,
            struct binder_thread *thread,
            binder_uintptr_t binder_buffer, size_t size,
            binder_size_t *consumed)
{
        case BC_ENTER_LOOPER:
            binder_debug(BINDER_DEBUG_THREADS,
                     "%d:%d BC_ENTER_LOOPER\n",
                     proc->pid, thread->pid);
            if (thread->looper & BINDER_LOOPER_STATE_REGISTERED) { // 0x01
                thread->looper |= BINDER_LOOPER_STATE_INVALID; // 0x08
                binder_user_error("%d:%d ERROR: BC_ENTER_LOOPER called after BC_REGISTER_LOOPER\n",
                    proc->pid, thread->pid);
            }
            thread->looper |= BINDER_LOOPER_STATE_ENTERED; // 重设 looper 标志位
            break;
```

处理 BC_ENTER_LOOPER 命令，设置 `thread->looper |= BINDER_LOOPER_STATE_ENTERED`，继续执行 binder_thread_read()：

# 7. binder_thread_read()

``` c
// binder.c
static int binder_thread_read(struct binder_proc *proc,
                  struct binder_thread *thread,
                  binder_uintptr_t binder_buffer, size_t size,
                  binder_size_t *consumed, int non_block)
{
    wait_for_proc_work = binder_available_for_proc_work_ilocked(thread);
    if (wait_for_proc_work) {
        if (!(thread->looper & (BINDER_LOOPER_STATE_REGISTERED |
                    BINDER_LOOPER_STATE_ENTERED))) { // 0x01 | 0x02 = 0x03，0x10 & 0x03 = 0x00
            binder_user_error("%d:%d ERROR: Thread waiting for process work before calling BC_REGISTER_LOOPER or BC_ENTER_LOOPER (state %x)\n",
                proc->pid, thread->pid, thread->looper);
            wait_event_interruptible(binder_user_error_wait,
                         binder_stop_on_user_error < 2);
        }
        trace_android_vh_binder_restore_priority(NULL, current);
        binder_restore_priority(current, proc->default_priority);
    }
    // non_block == filp->f_flags & O_NONBLOCK，filp->f_flags 在 sm 打开 binder
    // 设备节点时(ProcessState.open_driver()) 传入的是 O_RDWR | OCLOEXEC，所以 non_block 为 false
    if (non_block) {
        if (!binder_has_work(thread, wait_for_proc_work))
            ret = -EAGAIN;
    } else {
        ret = binder_wait_for_work(thread, wait_for_proc_work); // 进程睡眠的地方
    }

static bool binder_available_for_proc_work_ilocked(struct binder_thread *thread)
{
    return !thread->transaction_stack &&
        binder_worklist_empty_ilocked(&thread->todo) &&
        (thread->looper & (BINDER_LOOPER_STATE_ENTERED |
                   BINDER_LOOPER_STATE_REGISTERED));
}
```

`wait_for_proc_work = binder_available_for_proc_work_ilocked()` 返回 true，进入 `binder_wait_for_work()`：

## 7.1 binder_wait_for_work()

``` c
// binder.c
static int binder_wait_for_work(struct binder_thread *thread,
                bool do_proc_work)
{
    DEFINE_WAIT(wait); // 建立并初始化一个等待队列项 wait
    struct binder_proc *proc = thread->proc;
    int ret = 0;
    freezer_do_not_count();
    binder_inner_proc_lock(proc);
    for (;;) { // 循环的作用是让线程被唤醒后再一次去检查一下condition是否满足
        // 将上面创建的 wait 队列的第一个元素添加到 thread->wait 等待队列的头部，并设置进程的状态为 TASK_INTERRUPTIBLE，此时进程还没有睡眠
        prepare_to_wait(&thread->wait, &wait, TASK_INTERRUPTIBLE);
        // 唤醒条件 condition,如果满足则跳出循环，否则一直循环等待
        if (binder_has_work_ilocked(thread, do_proc_work))
            break;
        // 如果是在等待处理本进程的todo队列的任务
        if (do_proc_work)
            // 把本线程的 waiting_thread_node 插入到所属进程的 waiting_threads 中
            list_add(&thread->waiting_thread_node,
                 &proc->waiting_threads);
        trace_android_vh_binder_wait_for_work(do_proc_work, thread, proc);
        binder_inner_proc_unlock(proc);
        schedule(); // 调用schedule()，让出cpu资源，开始休眠，进程真正睡眠的地方
        binder_inner_proc_lock(proc);
        list_del_init(&thread->waiting_thread_node);
        if (signal_pending(current)) {
            ret = -EINTR;
            break;
        }
    }
    // 会有一个和队列 wait 相关的线程来唤醒队列 wait 中的线程
    // 进程被唤醒后，就把自己从队列 wait 中移出来，重新恢复状态为 TASK_RUNNING
    finish_wait(&thread->wait, &wait); // 执行清理工作
    binder_inner_proc_unlock(proc);
    freezer_count();
    return ret;
}
```

首先建立并初始化一个等待队列项 wait，然后调用 `prepare_to_wait()` 把上面创建的 wait 队列的第一个元素添加到 thread->wait 等待队列的头部，并设置进程状态为 TASK_INTERRUPTIBLE，此时还没有进入睡眠等待，  接下来检查 `binder_has_work_ilocked()` 是否满足，这里如果不检查，可能条件已经满足，直接去睡眠的话可能再也没有人来唤醒它，如果满足，则跳出循环，如果不满足，则继续往下执行，并在后面的 `schedule()` 中真正进入睡眠，如果有另外一个和函数开头创建的 wait 相关的线程唤醒了这个睡眠的线程，则回到 for 循环再次调用 `binder_has_work_ilocked()` 检查是否满足条件，满足则跳出循环，并把上面加入的 wait 从 thread-wait 中移除；

## 7.2 binder_has_work_ilocked()

``` c
// binder.c
// binder_has_work_ilocked()
static bool binder_has_work_ilocked(struct binder_thread *thread,
                    bool do_proc_work)
{
    int ret = 0;
    trace_android_vh_binder_has_work_ilocked(thread, do_proc_work, &ret);
    if (ret)
        return true;
    return thread->process_todo ||
        thread->looper_need_return ||
        (do_proc_work &&
         !binder_worklist_empty_ilocked(&thread->proc->todo));
}
```

在学习 [Android - Binder 机制 (1)- 驱动 / JNI](http://rangerzhou.top/2021/10/01/Android/AndroidDevelop_005_Binder01-DriveAndJNI) 中的 `binder_ioctl()` 函数时得知应用程序创建 binder 线程池时，主线程第一次调用到 `binder_ioctl()` 获取 binder_thread 时配置了`looper_need_return = true`，所以 `binder_has_work_ilocked()` 返回 true，所以此时 `binder_wait_for_work()` 通过 break 跳出了 for 循环，也就没有阻塞，同时也跳过了 `list_add(&thread->waiting_thread_node, &proc->waiting_threads)` ，<font color=red>**所以 `proc->waiting_threads` 还为空**</font>（关系到后续是否创建 binder 线程），继续回到 binder_thread_read()，

``` c
// binder.c
static int binder_thread_read(...)
    ...
        ret = binder_wait_for_work(thread, wait_for_proc_work); // 进程睡眠的地方
    }
    while (1) {
        if (!binder_worklist_empty_ilocked(&thread->todo))
            list = &thread->todo; // 获取线程 todo 队列
        else if (!binder_worklist_empty_ilocked(&proc->todo) &&
               wait_for_proc_work)
            list = &proc->todo; // 获取进程 todo 队列
        else {
            binder_inner_proc_unlock(proc);
            /* no data added */
            // 若无数据且当前线程 looper_need_return 为false，则重试
            if (ptr - buffer == 4 && !thread->looper_need_return)
                goto retry;
            break;
        }
```

此时 `thread->todo` 和 `proc->todo` 都为空，所以进入最后的 else 分支，通过 break 跳出 while 循环，继续往下执行；

## 7.3 驱动发出 BR_SPAWN_LOOPER 命令

``` c
// binder.c
static int binder_thread_read(...)
done:
    *consumed = ptr - buffer;
    binder_inner_proc_lock(proc);
    if (proc->requested_threads == 0 &&
        list_empty(&thread->proc->waiting_threads) &&
        proc->requested_threads_started < proc->max_threads &&
        (thread->looper & (BINDER_LOOPER_STATE_REGISTERED |
         BINDER_LOOPER_STATE_ENTERED)) /* the user-space code fails to */
         /*spawn a new thread if we leave this out */) {
        proc->requested_threads++;
        binder_inner_proc_unlock(proc);
        binder_debug(BINDER_DEBUG_THREADS,
                 "%d:%d BR_SPAWN_LOOPER\n",
                 proc->pid, thread->pid);
        if (put_user(BR_SPAWN_LOOPER, (uint32_t __user *)buffer))
            return -EFAULT;
        binder_stat_br(proc, thread, BR_SPAWN_LOOPER);
    } else
        binder_inner_proc_unlock(proc);
    return 0;
}
```

- proc->requested_threaads == 0：binder 驱动每次请求进程创建 binder 线程时都会 `requested_threads++`，当进程响应这个请求后则会 `requested_threads--`，同时 `requested_threads_started++`（binder_thread_write 处理 BC_REGISTER_LOOPER 时）， <font color=red>**所以 `requested_threads` 表示当前进程没有正在请求创建 binder 线程**</font>；
- list_empty(&thread->proc->waiting_threads)：当前进程的等待线程数为空，即当前进程中没有空闲的 binder 线程；
- proc->requested_threads_started < proc->max_threads：当前进程已启动线程数量小于最大线程数（ProcessState 中默认配置 15）；
- thread->looper：当前处于 BINDER_LOOPER_STATE_REGISTERED 或者 BINDER_LOOPER_STATE_ENTERED状态；

如果同时满足上述条件时会向用户空间传递 BR_SPAWN_LOOPER 命令，**注意当有 binder 通信的时候，会唤醒服务端，当处理 BINDER_WORK_TRANSACTION 时会给 t 赋值，否则会在代码中 continue 重新循环，即只有 BR_TRANSACTION 和 BR_REPLY 时才能继续往下执行，最终会 break 跳出 binder_thread_read() 的 while 循环，进入 done 代码块；**

我们先来具体看一下当前的情况：

-   首先第一个条件，此时驱动并没有请求创建 binder 线程，所以 `requested_threads == 0` 成立；

-   第二个条件，在上面分析 `binder_wait_for_work()` 时得知，waiting_thread 链表并没有插入节点（break 跳出循环了），所以 list_empty 判断链表为空（头指针的 next 指向自己）成立；

-   第三个条件显然也成立，binder 驱动还没有发出过创建 binder 线程命令，所以此时 requested_threads_started 为 0，max_threads 为15，成立；

-   第四个条件，此时 looper 为 BINDER_LOOPER_STATE_ENTERED；

所以上述四个条件成立，向用户空间写入了 BR_SPAWN_LOOPER 命令，然后返回到 `binder_ioctl_write_read() -> binder_ioctl()`，记住在 `binder_ioctl()`的结尾处设置了 <font color=red>**`thread->looper_need_return = false;`**</font>，然后再回到用户空间 `IPCThreadState.talkWithDriver() -> getAndExecuteCommand()`；

# 8. getAndExecuteCommand()

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::getAndExecuteCommand()
{
    result = talkWithDriver();
    if (result >= NO_ERROR) {
        cmd = mIn.readInt32();
        result = executeCommand(cmd);
```

调用 executeCommand() ;

# 9. executeCommand

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::executeCommand(int32_t cmd)
{
    switch ((uint32_t)cmd) {
    case BR_SPAWN_LOOPER:
        mProcess->spawnPooledThread(false);
        break;
```

此处通过 `spawnPooledThread(false)` 创建 binder 非主线程，这里和前面 **第三小节** 分析一样，只不过参数变为了 false，代表 binder 非主线程，后续也是执行到 `joinThreadPool()` ，再通过 getAndExecuteCommand() 进入 binder 驱动，稍候分析；

那么 binder 主线程则在执行完 spawnPooledThread(false) 后回到 `joinThreadPool()` ，继续 do/while 循环，又一次 `getAndExecuteCommand() -> talkWithDriver()` ，只不过这次 `write_size = 0`，`read_size = 256`，进入 binder_thread_read()，只不过这次 `thread->looper_need_return = false`，导致 `binder_has_work_ilocked()` 返回 false，然后在 `binder_wait_for_work()` 的 schedule 处阻塞休眠了，**并且 `proc->waiting_threads` 链表添加了节点**；

接下来继续分析 binder 非主线程的创建；

# 10. binder 非主线程创建

`spawnPooledThread(false)` 创建 binder 非主线程后，进入 `joinThreadPool()`，因为是 binder 非主线程，向 mOut 写入了 `BC_REGISTER_LOOPER` 命令，然后 bwr.write_size > 0，bwr.read_size = 256，进入 binder_ioctl() 后流程和前面 **[7.2 小节]** 一样，先创建了 binder_thread，且 `looper_need_return=true`，然后进入 binder_thread_write()；

## 10.1 binder_thread_write()

``` c
// binder.c
static int binder_thread_write(...)
{
        case BC_REGISTER_LOOPER:
            binder_debug(BINDER_DEBUG_THREADS,
                     "%d:%d BC_REGISTER_LOOPER\n",
                     proc->pid, thread->pid);
            binder_inner_proc_lock(proc);
            if (thread->looper & BINDER_LOOPER_STATE_ENTERED) { // 该线程已经注册为 binder 主线程，不能重复注册
                thread->looper |= BINDER_LOOPER_STATE_INVALID;
                binder_user_error("%d:%d ERROR: BC_REGISTER_LOOPER called after BC_ENTER_LOOPER\n",
                    proc->pid, thread->pid);
            } else if (proc->requested_threads == 0) { // 没有请求创建新线程时不应该创建
                thread->looper |= BINDER_LOOPER_STATE_INVALID;
                binder_user_error("%d:%d ERROR: BC_REGISTER_LOOPER called without request\n",
                    proc->pid, thread->pid);
            } else {
                proc->requested_threads--;
                proc->requested_threads_started++;
            }
            thread->looper |= BINDER_LOOPER_STATE_REGISTERED; // 重设 looper 标志位
            binder_inner_proc_unlock(proc);
            trace_android_vh_binder_looper_state_registered(thread, proc);
            break;
```

处理 BC_REGISTER_LOOPER 命令，只是做了 `requested_threads--` 和 `requested_threads_started++`（**对应 7.3 小节**），并配置了 `thread->looper |= BINDER_LOOPER_STATE_REGISTERED`，然后继续执行 `binder_thread_read()`；

## 10.2 binder_thread_read()

这部分参考 **第 7 小节** ，只不过因为 `list_empty(&thread->proc->waiting_threads)` 不成立（**参考第 9 小节**），所以直接回到用户空间的 `joinThreadPool()` 中，并再次循环到 `getAndExecuteCommand()` 进入内核空间，然后同样在 `binder_wait_for_work()` 中睡眠阻塞，和 binder 主线程基本一样，不再分析；

# 11. Binder 通信数据结构

[kernel-android12-5.10/drivers/android/binder_internal.h](https://android.googlesource.com/kernel/common/+/refs/heads/android12-5.10/drivers/android/binder_internal.h)

[kernel-android12-5.10/drivers/android/binder_alloc.h](https://android.googlesource.com/kernel/common/+/refs/heads/android12-5.10/drivers/android/binder_alloc.h)

[kernel-android12-5.10/include/uapi/linux/android/binder.h](https://android.googlesource.com/kernel/common/+/refs/heads/android12-5.10/include/uapi/linux/android/binder.h)

## 11.1 Binder 进程描述 - binder_proc

``` c
// binder_internal.h
struct binder_proc {
	struct hlist_node proc_node; // 挂载在全局 binder_procs 链表中的节点
	struct rb_root threads; // 使用红黑树来保存使用 Binder 机制通信的进程的 Binder 线程池的线程 ID
	struct rb_root nodes; // 使用红黑树来保存使用 Binder 机制通信的进程内所有 Binder 实体对象 binder_node 的成员变量 ptr
	struct rb_root refs_by_desc; // 使用红黑树来保存使用 Binder 机制通信的进程内所有 Binder 引用对象 binder_ref 的成员变量 desc
	struct rb_root refs_by_node; // 使用红黑树来保存使用 Binder 机制通信的进程内所有 Binder 引用对象 binder_ref 的成员变量 node
	struct list_head waiting_threads;
	int pid; // 保存使用 Binder 机制通信的进程内的 pid
	struct task_struct *tsk; // 保存使用 Binder 机制通信的进程信息
	struct hlist_node deferred_work_node; // 挂载在全局延迟工作项链表 binder_deferred_list 中的节点
	int deferred_work; // 描述延迟工作项的具体类型
	int outstanding_txns;
	bool is_dead;
	bool is_frozen;
	bool sync_recv;
	bool async_recv;
	wait_queue_head_t freeze_wait;
	struct list_head todo; // 进程待处理工作项队列
	struct binder_stats stats; // 统计进程接收到的进程间通信请求次数
	struct list_head delivered_death; // 死亡通知队列
	int max_threads; // 保存 Binder 驱动程序最多可以主动请求进程注册的线程数量
	int requested_threads; // 记录正在请求注册的线程个数
	int requested_threads_started; // 记录响应请求注册的线程个数
	int tmp_ref;
	struct binder_priority default_priority; // 设置进程优先级
	struct dentry *debugfs_entry;
	struct binder_alloc alloc;
	struct binder_context *context;
	spinlock_t inner_lock;
	spinlock_t outer_lock;
	struct dentry *binderfs_entry;
	bool oneway_spam_detection_enabled;
};

```

## 11.2 Binder 线程描述 - binder_thread

``` c
// binder_internal.h
struct binder_thread {
       struct binder_proc *proc; // 线程所属的进程
       struct rb_node rb_node; // 挂载到宿主进程 binder_proc 的成员变量 threads 红黑树节点
       struct list_head waiting_thread_node;
       int pid; // binder 线程 pid
       int looper; // binder 线程运行状态
       bool looper_need_return;  
       struct binder_transaction *transaction_stack; // 需要线程处理的事务堆栈
       struct list_head todo; // binder 线程待处理队列
       bool process_todo;
       struct binder_error return_error; // write 失败后，返回的错误码
       struct binder_error reply_error;
       wait_queue_head_t wait; // Binder 线程会睡眠在 wait 描述的等待队列中
       struct binder_stats stats; // 统计该 Binder 线程接收到的进程间通信请求次数
       atomic_t tmp_ref;
       bool is_dead;
       struct task_struct *task;
};
```

## 11.3 Binder 实体对象 - binder_node

``` c
// binder_internal.h
struct binder_node {
	int debug_id; // 调试 id
	spinlock_t lock;
	struct binder_work work; // 描述一个待处理的工作项
	union {
		struct rb_node rb_node; // 挂载到宿主进程 binder_proc 的成员变量 nodes 红黑树的节点
		struct hlist_node dead_node; // 当宿主进程死亡，该 binder 实体对象将挂载到全局 binder_dead_nodes 链表中
	};
	struct binder_proc *proc; // 指向该 binder 线程的宿主进程
	struct hlist_head refs; // 保存所有引用该 binder 实体对象的 binder 引用对象
	int internal_strong_refs; // binder 实体对象的强引用计数
	int local_weak_refs; // binder 实体对象的弱引用计数
	int local_strong_refs;
	int tmp_refs;
	binder_uintptr_t ptr; // 指向用户空间 service 组件内部的引用计数对象 wekref_impl 的地址
	binder_uintptr_t cookie; // 保存用户空间的 service 组件地址
	struct {
		/*
		 * bitfield elements protected by
		 * proc inner_lock
		 */
		u8 has_strong_ref:1;
		u8 pending_strong_ref:1;
		u8 has_weak_ref:1;
		u8 pending_weak_ref:1;
	};
	struct {
		/*
		 * invariant after initialization
		 */
		u8 sched_policy:2;
		u8 inherit_rt:1;
		u8 accept_fds:1;
		u8 txn_security_ctx:1;
		u8 min_priority;
	};
	bool has_async_transaction;
	struct list_head async_todo; // 异步事务队列
};
```



## 11.4 Binder 引用对象 - binder_ref

``` c
// binder_internal.h
struct binder_ref {
	/* Lookups needed: */
	/*   node + proc => ref (transaction) */
	/*   desc + proc => ref (transaction, inc/dec ref) */
	/*   node => refs + procs (proc exit) */
	struct binder_ref_data data;
	struct rb_node rb_node_desc; // 挂载到宿主对象 binder_proc 的红黑树 refs_by_desc 中的节点
	struct rb_node rb_node_node; // 挂载到宿主对象 binder_proc 的红黑树 refs_by_node 中的节点
	struct hlist_node node_entry;
	struct binder_proc *proc; // Binder 引用对象的宿主进程 binder_proc
	struct binder_node *node; // Binder 引用对象所引用的 Binder 实体对象
	struct binder_ref_death *death;
};
```



## 11.5 内核缓冲区描述符 - binder_buffer

``` c
// binder_alloc.h
struct binder_buffer {
    // binder_proc 成员变量 buffers 链表中的节点
	struct list_head entry; /* free and allocated entries by address */
    // 根据该内核缓存区是否空闲来选择挂载到 binder_proc 的 free_buffers 和 allocated_buffers 红黑树上
	struct rb_node rb_node; /* free entry by size or allocated entry */
				/* by address */
	unsigned free:1; // 标识该缓冲区是否空闲
	unsigned clear_on_free:1;
	unsigned allow_user_free:1; // 标识内核缓冲区是否允许释放
	unsigned async_transaction:1; // 标识该内核缓冲区是否关联异步事务
	unsigned oneway_spam_suspect:1;
	unsigned debug_id:27;
	struct binder_transaction *transaction; // 描述该内核缓冲区所属的事务
	struct binder_node *target_node; // 描述该内核缓冲区所属的 Binder 实体对象
	size_t data_size; // 描述数据缓冲区的大小
	size_t offsets_size; // Binder 对象偏移数组的大小
	size_t extra_buffers_size;
	void __user *user_data;
	int    pid;
};
```



## 11.6 进程通信事务 - binder_transaction

``` c
// binder_internal.h
struct binder_transaction {
	int debug_id;
	struct binder_work work; // 设置事务类型
	struct binder_thread *from; // 描述发起事务的线程
	struct binder_transaction *from_parent; // 该事务所依赖的事务
	struct binder_proc *to_proc; // 负责处理该事务的进程
	struct binder_thread *to_thread; // 负责处理该事务的线程
	struct binder_transaction *to_parent; // 目标线程的下一个事务
	unsigned need_reply:1; // 区分同步或异步事务
	/* unsigned is_dead:1; */	/* not used at the moment */
	struct binder_buffer *buffer; // 指向为该事务分配的一块内核缓冲区
	unsigned int	code; // 进程通信代码
	unsigned int	flags; // 标志位，描述进程间通信行为的特征
	struct binder_priority	priority; // 发起事务的线程优先级
	struct binder_priority	saved_priority; // 保存处理该事务的线程原有优先级
	bool    set_priority_called;
	kuid_t	sender_euid; // 发起事务的 euid
	struct list_head fd_fixups;
	binder_uintptr_t security_ctx;
	/**
	 * @lock:  protects @from, @to_proc, and @to_thread
	 *
	 * @from, @to_proc, and @to_thread can be set to NULL
	 * during thread teardown
	 */
	spinlock_t lock;
	ANDROID_VENDOR_DATA(1);
	ANDROID_OEM_DATA_ARRAY(1, 2);
};
```



## 11.7 进程通信数据 - binder_transaction_data

``` c
// binder.h
struct binder_transaction_data {
	/* The first two are only used for bcTRANSACTION and brTRANSACTION,
	 * identifying the target and contents of the transaction.
	 */
	union { // 用来描述目标 Binder 实体对象或者目标 Binder 引用对象
		/* target descriptor of command transaction */
		__u32	handle;
		/* target descriptor of return transaction */
		binder_uintptr_t ptr;
	} target;
    // 目标 Binder 本地 Binder 对象 BBinder 的地址
	binder_uintptr_t	cookie;	/* target object cookie */
	__u32		code;		/* transaction command */ // 通信代码
	/* General information about the transaction. */
	__u32	        flags; // 通信标志位
	pid_t		sender_pid; // 源进程的 pid
	uid_t		sender_euid; // 源进程的 euid
	binder_size_t	data_size;	/* number of bytes of data */ // 数据缓存区大小
	binder_size_t	offsets_size;	/* number of bytes of offsets */ // 记录 Binder 实体对象偏移的数组大小
	/* If this transaction is inline, the data immediately
	 * follows here; otherwise, it ends with a pointer to
	 * the data buffer.
	 */
	union { //数据缓冲区
		struct {
			/* transaction data */
			binder_uintptr_t	buffer; // 真正保存通信数据的缓冲区
			/* offsets from buffer to flat_binder_object structs */
			binder_uintptr_t	offsets; // 记录 Binder 对象偏移的数组
		} ptr;
		__u8	buf[8];
	} data;
};
```



## 11.8 binder_write_read

``` c
// binder.h
struct binder_write_read {
	binder_size_t		write_size;	/* bytes to write */
	binder_size_t		write_consumed;	/* bytes consumed by driver */
	binder_uintptr_t	write_buffer;
	binder_size_t		read_size;	/* bytes to read */
	binder_size_t		read_consumed;	/* bytes consumed by driver */
	binder_uintptr_t	read_buffer;
};
```



# 12. Binder常见问题

[参考](https://vanelst.site/2020/08/07/binder-question/)



[ref](https://blog.csdn.net/yangwen123/article/details/9100599)

[Linux 内核 API](https://deepinout.com/linux-kernel-api)
