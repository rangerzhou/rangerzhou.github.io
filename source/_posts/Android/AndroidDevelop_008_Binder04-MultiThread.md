---
title: Android - Binder机制(4)-线程池启动
date: 2021-10-20 22:34:11
tags:
categories: Android
copyright: true
password: zr.
---



> Binder 线程池启动分析

<!--more-->

# 相关代码路径

| Layer | Path |
| ----- | ---- |
|       |      |
|       |      |

# zygoteInit()

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

# startThreadPool()

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

# spawnPooledThread()

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

# PoolThread.threadLoop()

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

# joinThreadPool()

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

# binder_thread_write()

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

# binder_thread_read()

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

binder_available_for_proc_work_ilocked() 返回 true，进入 binder_wait_for_work()：

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
        // 将 wait 添加到等待队列头中，并设置进程的状态为 TASK_INTERRUPTIBLE，此时进程还没有睡眠
        prepare_to_wait(&thread->wait, &wait, TASK_INTERRUPTIBLE);
        // 唤醒条件 condition,如果满足则跳出循环，否则一直循环等待
        if (binder_has_work_ilocked(thread, do_proc_work))
            break;
        // 如果是在等待处理本进程的todo队列的任务
        if (do_proc_work)
            // 把本线程的 waiting_thread_node 添加到所属进程的 waiting_threads 中
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

这里 binder_has_work_ilocked() 返回 false，所以 binder_wait_for_work() 不会 bread 跳出循环，继续往下执行到 schedule()，在此处休眠！继续往下看：

``` c
// binder.c
static int binder_thread_read(...)
{
    ...
    while (1) {
        struct binder_transaction *t = NULL;
        w = binder_dequeue_work_head_ilocked(list); // 从 todo 队列获取 binder_work 对象
        switch (w->type) { // 判断 binder_transaction() 时传入的 binder_work 的类型
        case BINDER_WORK_TRANSACTION: {
            binder_inner_proc_unlock(proc);
            t = container_of(w, struct binder_transaction, work); // 通过 w 获取 binder_transaction 事务
        } break;
        if (!t)
            continue;
        if (t->buffer->target_node) { // 是否存在目标节点
            struct binder_node *target_node = t->buffer->target_node;
            struct binder_priority node_prio;
            // 非常重要，把 Binder 实体的弱引用地址赋值给 trd->target.ptr，
            // trd 地址中存的是 binder_transaction_data
            trd->target.ptr = target_node->ptr;
            // 非常重要，Binder 实体的 cookie 赋值给 trd->target.cookie
            trd->cookie =  target_node->cookie;
            node_prio.sched_policy = target_node->sched_policy;
            node_prio.prio = target_node->min_priority;
            binder_transaction_priority(current, t, node_prio,
                            target_node->inherit_rt);
            cmd = BR_TRANSACTION; // 记录 BR_TRANSACTION，要传递到用户空间的
        } else {
            trd->target.ptr = 0;
            trd->cookie = 0;
            cmd = BR_REPLY;
        }
            ...
        break;
    }
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

当有 binder 通信的时候，会唤醒服务端，当处理 BINDER_WORK_TRANSACTION 时会给 t 赋值，否则会在代码中 continue 重新循环，即只有 BR_TRANSACTION 和 BR_REPLY 时才能继续往下执行，最终会 break 跳出 while 循环，进入 done 代码块分析，

- proc->requested_threaads == 0：当前进程没有请求创建 binder 线程；
- list_empty(&thread->proc->waiting_threads)：当前进程的等待线程数为空，即当前进程中没有空闲的 binder 线程；
- proc->requested_threads_started < proc->max_threads：当前进程已启动线程数量小于最大线程数（ProcessState 中默认配置 15）；
- thread->looper：当前处于 BINDER_LOOPER_STATE_REGISTERED 或者 BINDER_LOOPER_STATE_ENTERED状态；

当满足以上任一条件时会向用户空间传递 BR_SPAWN_LOOPER 命令，自此 binder_thread_read() 执行完毕，返回到 `talkWithDriver() -> getAndExecuteCommand() -> executeCommand()`

# executeCommand()

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::executeCommand(int32_t cmd)
{
    case BR_SPAWN_LOOPER:
        mProcess->spawnPooledThread(false);
        break;
```

又调用到 ProcessState.spawnPooledThread()，不过传递的参数为 false，代表非主线程：

# spawnPooledThread()

``` cpp
// ProcessState.cpp
void ProcessState::spawnPooledThread(bool isMain)
{
    if (mThreadPoolStarted) {
        String8 name = makeBinderThreadName();
        ALOGV("Spawning new pooled thread, name=%s\n", name.string());
        sp<Thread> t = sp<PoolThread>::make(isMain);
        t->run(name.string());
    }
}
```





