---
title: Android - idle/kthreadd 进程启动
date: 2021-06-15 14:31:01
tags:
categories: Android
copyright: true
password:
---

>Linux 内核启动主要有 3 个重要的进程，idle(pid=0) 进程，kthreadd(pid=2) 进程和 init(pid=1) 进程，idle 进程是系统初始化过程第一个进程，是 kthreadd 和 init 进程的父进程；init 进程是第一个用户进程；kthreadd 进程是内核管家，是所有内核线程的父进程。

<!--more-->

### 1. idle 启动

[kernel/msm/arch/arm64/kernel/head.S](https://android.googlesource.com/kernel/msm/+/refs/tags/android-11.0.0_r0.25/arch/arm64/kernel/head.S)

```assembly
add sp, sp, #16
mov    x29, #0
mov    x30, #0
b  start_kernel // 跳转 start_kernel 函数
```

b start_kernel，b 是跳转的意思，跳转到 start_kernel.h，对应的实现在 kernel/msm/init/main.c

[kernel/msm/init/main.c](https://android.googlesource.com/kernel/msm/+/refs/tags/android-11.0.0_r0.25/init/main.c)

```C
asmlinkage __visible void __init start_kernel(void)
{
...
    rest_init();
}
```

start_kernel 最后调用 rest_init 函数，rest_init 里启动了 init(pid = 1) 和 kthreadd(pid = 2) 进程

```c
static noinline void __ref rest_init(void)
{
   struct task_struct *tsk;
   int pid;
   // 启动RCU机制，这个与后面的rcu_read_lock和rcu_read_unlock是配套的，用于多核同步
   rcu_scheduler_starting();
   /*
    * We need to spawn init first so that it obtains pid 1, however
    * the init task will end up wanting to create kthreads, which, if
    * we schedule it before we create kthreadd, will OOPS.
    */
    // 以 kernel_thread 方式创建 init 进程，需等待 kthreadd 启动完毕后再继续执行
   pid = kernel_thread(kernel_init, NULL, CLONE_FS);
   /*
    * Pin init on the boot CPU. Task migration is not properly working
    * until sched_init_smp() has been run. It will set the allowed
    * CPUs for init to the non isolated CPUs.
    */
    // 打开 RCU 读取锁，在此期间无法进行进程切换
   rcu_read_lock();
   tsk = find_task_by_pid_ns(pid, &init_pid_ns);
   set_cpus_allowed_ptr(tsk, cpumask_of(smp_processor_id()));
   rcu_read_unlock();
   numa_default_policy(); // 设定 NUMA 系统的默认内存访问策略
   // 以 kernel_thread 方式创建 kthreadd 进程
   pid = kernel_thread(kthreadd, NULL, CLONE_FS | CLONE_FILES);
   rcu_read_lock();
   // 获取 kthreadd 的进程描述符，期间需要检索进程 pid 的使用链表，所以要加锁
   kthreadd_task = find_task_by_pid_ns(pid, &init_pid_ns);
   // 关闭 RCU 读取锁
   rcu_read_unlock();
   /*
    * Enable might_sleep() and smp_processor_id() checks.
    * They cannot be enabled earlier because with CONFIG_PRREMPT=y
    * kernel_thread() would trigger might_sleep() splats. With
    * CONFIG_PREEMPT_VOLUNTARY=y the init task might have scheduled
    * already, but it's stuck on the kthreadd_done completion.
    */
   system_state = SYSTEM_SCHEDULING;
   // 通知 kernel_init 进程 kthreadd 进程已创建完成，可以继续
   complete(&kthreadd_done);
   /*
    * The boot idle thread must execute schedule()
    * at least once to get things moving:
    */
   schedule_preempt_disabled();
   /* Call into cpu_idle with preempt disabled */
   cpu_startup_entry(CPUHP_ONLINE);
}
```

[kernel/msm/kernel/rcu/tree.c](https://android.googlesource.com/kernel/msm/+/refs/tags/android-11.0.0_r0.25/kernel/rcu/tree.c)

```c
void rcu_scheduler_starting(void)
{
       // WARN_ON 相当于警告，会打印出当前栈信息，不会重启，num_online_cpus 表示当前启动的 cpu 数
	WARN_ON(num_online_cpus() != 1);
       // nr_context_switches 进行进程切换的次数
	WARN_ON(nr_context_switches() > 0);
	rcu_test_sync_prims();
	rcu_scheduler_active = RCU_SCHEDULER_INIT;
	rcu_test_sync_prims(); // 启用 rcu 机制
}
```

[kernel/msm/kernel/fork.c](https://android.googlesource.com/kernel/msm/+/refs/tags/android-11.0.0_r0.25/kernel/fork.c)

```c
/*
 * Create a kernel thread.
 */
pid_t kernel_thread(int (*fn)(void *), void *arg, unsigned long flags)
{
	return _do_fork(flags|CLONE_VM|CLONE_UNTRACED, (unsigned long)fn,
		(unsigned long)arg, NULL, NULL, 0);
}
```

do_fork 函数用于创建进程，它首先调用 copy_process() 创建新进程，然后调用 wake_up_new_task() 将进程放入运行队列中并启动新进程，然后等待执行完成。

kernel_thread 的第一个参数是一个函数指针，会在创建进程后回调执行，第三个参数是创建进程的方式。

### 2. kthreadd 启动

kernel_thread 通过 _do_fork 创建进程，然后回调 kthreadd 函数：

[kernel/msm/kernel/kthread.c](https://android.googlesource.com/kernel/msm/+/refs/tags/android-11.0.0_r0.25/kernel/kthread.c)

```c
int kthreadd(void *unused)
{
   struct task_struct *tsk = current;
   /* Setup a clean context for our children to inherit. */
   set_task_comm(tsk, "kthreadd");
   ignore_signals(tsk);
   set_cpus_allowed_ptr(tsk, cpu_all_mask);
   set_mems_allowed(node_states[N_MEMORY]);
   current->flags |= PF_NOFREEZE;
   cgroup_init_kthreadd();
   for (;;) {
   // 将线程状态设置为 TASK_INTERRUPTIBLE, 如果当前没有要创建的线程则主动放弃 CPU 完成调度, 此进程变为阻塞态
      set_current_state(TASK_INTERRUPTIBLE);
      if (list_empty(&kthread_create_list))
         schedule(); // 没有内核线程需要创建，让出 CPU
     // kthread_create_list 不为空，则把线程状态设置为 TASK_RUNNING
      __set_current_state(TASK_RUNNING);
      spin_lock(&kthread_create_lock);
      while (!list_empty(&kthread_create_list)) {
         struct kthread_create_info *create;
         // 从 kthread_create_list 链表中取出线程创建信息
         create = list_entry(kthread_create_list.next,
                   struct kthread_create_info, list);
         list_del_init(&create->list);
         spin_unlock(&kthread_create_lock);
         create_kthread(create); // 创建线程
         spin_lock(&kthread_create_lock);
      }
      spin_unlock(&kthread_create_lock);
   }
   return 0;
}
```

kthreadd 函数的作用就是循环地从 kthread_create_list 链表中取出要创建的线程信息，然后执行 create_kthread 函数，直到 kthread_create_list 为空，让出 CPU，进入睡眠。

```c
static void create_kthread(struct kthread_create_info *create)
{
   int pid;
#ifdef CONFIG_NUMA
   current->pref_node_fork = create->node;
#endif
   /* We want our own signal handler (we take no signals by default). */
   pid = kernel_thread(kthread, create, CLONE_FS | CLONE_FILES | SIGCHLD);
   if (pid < 0) {
      /* If user was SIGKILLed, I release the structure. */
      struct completion *done = xchg(&create->done, NULL);
      if (!done) {
         kfree(create);
         return;
      }
      create->result = ERR_PTR(pid);
      complete(done);
   }
}
```

就是调用 kernel_thread 创建进程，然后调用 kthread 函数：

```c
static int kthread(void *_create)
{
   /* Copy data: it's on kthread's stack */
   struct kthread_create_info *create = _create;
   int (*threadfn)(void *data) = create->threadfn;
   void *data = create->data;
   struct completion *done;
   struct kthread *self;
   int ret;
   self = kmalloc(sizeof(*self), GFP_KERNEL);
   set_kthread_struct(self);
   /* If user was SIGKILLed, I release the structure. */
   done = xchg(&create->done, NULL);
   if (!done) {
      kfree(create);
      do_exit(-EINTR);
   }
   if (!self) {
      create->result = ERR_PTR(-ENOMEM);
      complete(done);
      do_exit(-ENOMEM);
   }
   self->flags = 0;
   self->data = data;
   init_completion(&self->exited);
   init_completion(&self->parked);
   current->vfork_done = &self->exited;
   /* OK, tell user we're spawned, wait for stop or wakeup */
   __set_current_state(TASK_UNINTERRUPTIBLE);
   create->result = current;
   complete(done); // 线程创建完成
   schedule(); // 让出 CPU
   ret = -EINTR;
   if (!test_bit(KTHREAD_SHOULD_STOP, &self->flags)) {
      cgroup_kthread_ready();
      __kthread_parkme(self);
      ret = threadfn(data);
   }
   do_exit(ret);
}
```

至此 kthreadd 进程启动完成，开始循环从 kthread_create_list 链表中读取需要创建的线程。

### 3. 内核启动线程的方式

有两种方法创建线程，分别是 kthread_create 和 kthread_run ，是两个宏定义，编译时会替换对应代码

[kernel/msm/include/linux/kthread.h](https://android.googlesource.com/kernel/msm/+/refs/tags/android-11.0.0_r0.25/include/linux/kthread.h)

``` c
/**
 * kthread_create - create a kthread on the current node
 * @threadfn: the function to run in the thread
 * @data: data pointer for @threadfn()
 * @namefmt: printf-style format string for the thread name
 * @arg...: arguments for @namefmt.
 *
 * This macro will create a kthread on the current node, leaving it in
 * the stopped state.  This is just a helper for kthread_create_on_node();
 * see the documentation there for more details.
 */
#define kthread_create(threadfn, data, namefmt, arg...) \
	kthread_create_on_node(threadfn, data, NUMA_NO_NODE, namefmt, ##arg)

/**
 * kthread_run - create and wake a thread.
 * @threadfn: the function to run until signal_pending(current).
 * @data: data ptr for @threadfn.
 * @namefmt: printf-style name for the thread.
 *
 * Description: Convenient wrapper for kthread_create() followed by
 * wake_up_process().  Returns the kthread or ERR_PTR(-ENOMEM).
 */
#define kthread_run(threadfn, data, namefmt, ...)			   \
({									   \
	struct task_struct *__k						   \
		= kthread_create(threadfn, data, namefmt, ## __VA_ARGS__); \
	if (!IS_ERR(__k))						   \
		wake_up_process(__k);					   \
	__k;								   \
})
```

最终都是调用 kthread_create_on_node 函数，区别是 kthread_run 创建后会在代码中手动唤醒新线程：

[kernel/msm/kernel/kthread.c](https://android.googlesource.com/kernel/msm/+/refs/tags/android-11.0.0_r0.25/kernel/kthread.c)

``` c
/**
 * kthread_create_on_node - create a kthread.
 * @threadfn: the function to run until signal_pending(current).
 * @data: data ptr for @threadfn.
 * @node: task and thread structures for the thread are allocated on this node
 * @namefmt: printf-style name for the thread.
 */
struct task_struct *kthread_create_on_node(int (*threadfn)(void *data),
					   void *data, int node,
					   const char namefmt[],
					   ...)
{
	struct task_struct *task;
	va_list args;
	va_start(args, namefmt);
	task = __kthread_create_on_node(threadfn, data, node, namefmt, args);
	va_end(args);
	return task;
}

struct task_struct *__kthread_create_on_node(int (*threadfn)(void *data),
						    void *data, int node,
						    const char namefmt[],
						    va_list args)
{
	DECLARE_COMPLETION_ONSTACK(done);
	struct task_struct *task;
	struct kthread_create_info *create = kmalloc(sizeof(*create),
						     GFP_KERNEL);
	if (!create)
		return ERR_PTR(-ENOMEM);
	create->threadfn = threadfn;
	create->data = data;
	create->node = node;
	create->done = &done;
	spin_lock(&kthread_create_lock);
	list_add_tail(&create->list, &kthread_create_list); // 把需要创建的线程添加到链表尾部
	spin_unlock(&kthread_create_lock);
	wake_up_process(kthreadd_task); // 唤醒 kthreadd 进程创建线程
	...
	return task;
}

```

kthread_create_on_node 作用就是把需要创建的线程添加到链表中，并唤醒 kthreadd 进程开始创建。

### 4. 总结

​		kthreadd 进程由 idle 通过 kernel_thread 创建，并始终运行在内核空间, 负责所有内核线程的调度和管理，所有的内核线程都是直接或者间接的以 kthreadd 为父进程。

    kthreadd 进程会执行一个 kthreadd 的函数，该函数的作用就是遍历 kthread_create_list 链表，从链表中取出需要创建的内核线程进行创建, 创建成功后会执行 kthread 函数。

    kthread 函数完成一些初始赋值后就让出 CPU，并没有执行新线程的工作函数，因此需要手动  wake up 被唤醒后，新线程才执行自己的真正工作函数。

    当我们调用 kthread_create 和 kthread_run 创建的内核线程会被加入到 kthread_create_list 链表，kthread_create 不会手动 wake up 新线程，kthread_run 创建完成后会手动 wake up 新线程。
