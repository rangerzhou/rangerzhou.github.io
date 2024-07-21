---
title: Android - Binder机制(1)-驱动/JNI
date: 2021-10-01 12:36:10
tags:
categories: Android
copyright: true
password:
---

>
>
>Binder 驱动分析以及 JNI 注册。

<!--more-->

## 1. Binder 是什么？

- 机制：Binder 是一种进程间通信机制；
- 驱动：Binder 是一个虚拟物理设备驱动；
- 应用层：Binder 是一个能发起通信的 Binder.java 类；
- Framework/Native：Binder 连接了 Client、Server、ServiceManager 和 Binder 驱动程序，形成一套 C/S 的通信架构；

## 2. Binder 有什么优势？

Linux 进程间通信机制有：管道（匿名管道PIPE、命名管道FIFO）、信号、共享内存（无需拷贝，性能最好）、信号量（signal）、消息队列、socket（拷贝2次）；



|        | Binder                               | 共享内存                                 | Socket                                              |
| ------ | ------------------------------------ | ---------------------------------------- | --------------------------------------------------- |
| 性能   | 拷贝一次                             | 无需拷贝                                 | 拷贝两次                                            |
| 特点   | 基于C/S架构，易用性高，稳定性好      | 控制复杂，易用性差                       | 基于C/S架构，作为一款通用接口，其传输效率低，开销大 |
| 安全性 | 为每个APP分配UID，同时支持实名和匿名 | 依赖上层协议，访问接入点是开放的，不安全 | 依赖上层协议，访问接入点是开放的，不安全            |

### 2.1 传统 IPC 传输数据

[传统 IPC 机制](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//IPC_Triditional.png)

![TriditionalIPC](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//IPC_Triditional.png "传统IPC机制")

**数据传输流程**

- 发送数据
- **第一次 copy**：通过系统调用 copy_from_user() 将数据从用户空间 copy 到内核空间
- **第二次 copy**：通过系统调用 copy_to_user() 将数据从内核空间 copy 到用户空间
- 接收数据

### 2.2 Binder 传输数据

[IPC_Binder](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//IPC_Binder.png)

![IPC_Binder](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//IPC_Binder.png "Binder 进程间通信")

**数据传输流程**

- 发送数据
- 一次 copy：通过系统调用 copy_from_user() 将数据从用户空间 copy 到内核空间，因为内核和接收方通过 mmap() 函数有一块共享内存区域，所以接收方可以直接接收数据；
- 接收数据

## 3. Linux 基础知识

### 3.1 用户空间和内核空间

内存被操作系统划分成两块：**用户空间**和**内核空间**，用户空间是用户程序代码运行的地方，内核空间是内核代码运行的地方，内核空间是所有进程共享的。为了安全，它们是隔离的，即使用户的程序崩溃了，内核也不受影响；

[用户空间和内核空间](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//UserSpaceAndKernelSpace.png)

![UserSpaceAndKernelSpace](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//UserSpaceAndKernelSpace.png "用户空间和内核空间")

32位系统，即2^32，即总共可访问地址为4G。内核空间为1G，用户空间为3G，在用户态下运行时，内核的1GB是不可见的，但是当进程陷入到内核时是可以访问的；

64位系统，低位：0～47位才是有效的可变地址（寻址空间256T），高位：48～63位全补0或全补1。一般高位全补0对应的地址空间是用户空间。高位全补1对应的是内核空间；

### 3.2 mmap 内存映射

mmap 可以将一个文件或者其它对象映射进进程的用户空间，这种情况下，可以像使用自己进程的内存一样使用这段内存。Linux 系统的 mmap 函数原型是这样的：

``` cpp
void *mmap(void *addr,size_t length,int prot,int flags,int fd, off_t offset);
// 参数addr指向欲映射的内存起始地址，通常设为 NULL，代表让系统自动选定地址，映射成功后返回该地址。
// 参数length表示将文件中多大的部分映射到内存
// 参数prot指定映射区域的读写权限
// 参数flags指定映射时的特性，如是否允许其他进程映射这段内存
// 参数fd指定映射内存的文件描述符
// 参数offset指定映射位置的偏移量，一般为0
```

非 mmap 或者内存共享的 Linux IPC 机制常用的通信方式如下，数据发送进程的用户空间数据通过 copy_from_user，复制到内核空间，由于内核空间是所有进程共享，所以内核通过调用 copy_to_user 将数据写入到数据接收进程，通过两次拷贝的方式，完成了 IPC 的通信。

通过 mmap 或者内存共享的 Linux IPC 机制，直接将同一段内存映射到数据发送进程和数据接收进程的用户空间，这样数据发送进程只需要将数据拷贝到共享的内存区域，数据接收进程就可以直接使用数据了。

### 3.3 Linux 设备驱动

这里为什么要介绍 Linux 的设备驱动相关的知识呢？因为 Binder 的重要组成部分就是 Binder 驱动设备，为了更好的理解 Binder，我们需要知道什么是 Linux 的设备驱动。

Linux 的设备，主要包括字符设备（如键盘，鼠标，触摸屏等），块设备（硬盘，内存，U盘等）和网络接口（网卡，蓝牙等）等，都需要驱动程序才能和系统进行通信。这些驱动程序，都挂载在 dev 目录下，如硬盘的驱动挂载在 `dev/sda` 上，内存的驱动挂载在 `/dev/ram` 上。

块设备和字符设备的驱动程序一般都要实现 open、close、read 和 write 等系统调用函数，这些函数都属于系统 I/O 函数，我们就可以直接通过 open 或者 read 等 I/O 函数，读写设备的数据。而且 dev 目录下不仅仅是挂载真实的物理设备驱动，还可以挂载**虚拟设备**的驱动。虚拟设备的设计主要用来实现系统的功能，虽然虚拟设备没有具体的物理设备，但是我们依然需要在驱动程序中实现 I/O 函数，只不过虚拟设备驱动的 I/O 函数不是对物理设备的操作，而是功能逻辑操作。网桥就是 Linux 的一个虚拟设备，Binder 也是一个挂载在 `dev/binder` 下的虚拟设备。

## 4. Binder 架构设计

[Binder 驱动](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//binder_arch.png)

![binder_driver](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//binder_arch.png "Binder 驱动")

Binder主要由这几部分组成：

- Binder 驱动设备
- Client 端，数据发送端
- Server 端，数据接收端
- ServiceManager

### 4.1 Binder 驱动设备

Binder 驱动设备是真正分配内存空间用来存放通信数据的部分，在 Binder 的架构中，Clinet 端发送的数据拷贝到 Binder 驱动设备分配的内存空间中，Server 会通过 mmap 将 Binder 驱动设备中分配的内存映射到自己进程的用户空间中，映射完成后，Server 在用户空间就可以直接读取 Binder 驱动中存放数据的这段内存了。

### 4.2 Client 端

Client 端是数据发送方，它会通过 I/O 函数，ioctl 陷入内核，通知 binder 驱动将 client 端的数据通过 copy_from_user 函数拷贝过来，并存放在 binder 驱动的内存中。

### 4.3 Server 端

Server 端是数据接收方，它接收数据的方式是映射 Binder 驱动中存放 Clinet 端数据的内存到自己的用户空间，这样就可以直接使用这段内存了。

### 4.4 ServiceManager

ServiceManager 是专门用来管理 Server 端的，Client 端想要和 Server 通信，必须知道 Server 的映射的内存地址，这样才能往这段内存中拷贝数据，但是我们不可能知道所有 Server 端的地址，所以这个时候，我们只需要知道 ServiceManager 的地址，在 ServiceManager 中寻找其他 Server 的地址就可以了，所以 ServiceManager 有点类似 DNS 服务器。

## 5. Binder 驱动设备

Binder 是一个驱动，是一个 misc 设备，没有具体的硬件，本质就是一块内存，对于 Linux 来说，驱动就是一个文件（对于 Linux 一切皆文件），mmap() 函数即是把虚拟内存和物理内存（文件也是物理内存）联系起来，所以可以通过 mmap() 函数把虚拟内存和 binder 驱动联系起来。

[Binder 驱动设备](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//binder_driver.png)

![binder_driver](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022//binder_driver.png "Binder 驱动")

### 5.1 binder_init()

[kernel/drivers/staging/android/binder.c](http://androidxref.com/kernel_3.18/xref/drivers/staging/android/binder.c)

binder 驱动和所有其他的设备驱动一样，Binder 驱动也是随着 Linux 的内核启动而一起启动的。在内核启动的过程中，只要位于 deriver 目录下的驱动程序在代码中按照规定的方式添加了初始化函数，这个驱动程序就会被内核自动加载，那么这个规定的方式是怎么样的呢？它的方式定义在 [/include/linux/init.h](http://androidxref.com/kernel_3.18/xref/include/linux/init.h) 文件中。

``` cpp
...
#define rootfs_initcall(fn)		__define_initcall(fn, rootfs)
#define device_initcall(fn)		__define_initcall(fn, 6)
#define device_initcall_sync(fn)	__define_initcall(fn, 6s)
#define late_initcall(fn)		__define_initcall(fn, 7)
#define late_initcall_sync(fn)		__define_initcall(fn, 7s)
...
```

可以看到，里面有很多 xxx_initcall 的宏定义函数，如 core_initcall，device_initcall 等，这些宏定义都按照了优先级的顺序定义的，想要内核在启动的时候，能够启动驱动程序，只需要在驱动程序的代码里面加上 xxx_initcall 的宏定义方法，就能按照优先级被内核动态加载。

我们看看 Binder 驱动的源码，它位于 `/drivers/staging/` 目录下，我们知道 Linux 的 drivers 目录就是专门用来存放系统驱动程序的目录，它的源码里就可以看到 **device_initcall ** 这行代码，device_initcall 是最常用的一个 initcall 函数，于是内核在启动的过程中，就会自动的去加载 binder.c 驱动程序中的 binder_init 初始化函数。

入口函数是 device_initcall，调用到 binder_init()

``` c
static int __init binder_init(void)
{
	int ret;
	char *device_name, *device_names;
	struct binder_device *device;
	struct hlist_node *tmp;
	// 创建名为 binder 的单线程的工作队列
	binder_deferred_workqueue = create_singlethread_workqueue("binder");
	if (!binder_deferred_workqueue)
		return -ENOMEM;

	binder_debugfs_dir_entry_root = debugfs_create_dir("binder", NULL);
	if (binder_debugfs_dir_entry_root)
		binder_debugfs_dir_entry_proc = debugfs_create_dir("proc",
						 binder_debugfs_dir_entry_root);

	...
	/*
	 * Copy the module_parameter string, because we don't want to
	 * tokenize it in-place.
	 */
	device_names = kzalloc(strlen(binder_devices_param) + 1, GFP_KERNEL);
	if (!device_names) {
		ret = -ENOMEM;
		goto err_alloc_device_names_failed;
	}
    // 从 kernel/drivers/staging/android/Kconfig 文件中读取 ANDROID_BINDER_DEVICE 信息（"binder"）给到 device_name
	strcpy(device_names, binder_devices_param);

	while ((device_name = strsep(&device_names, ","))) {
		ret = init_binder_device(device_name); // 初始化 binder
		if (ret)
			goto err_init_binder_device_failed;
	}

	return ret;
	...
}

device_initcall(binder_init); // 设备驱动入口函数
```

**init_binder_device**

``` c
static int __init init_binder_device(const char *name)
{
	int ret;
	struct binder_device *binder_device;

	binder_device = kzalloc(sizeof(*binder_device), GFP_KERNEL); // 为 binder 设备分配内存(虚拟内存)
	if (!binder_device)
		return -ENOMEM;

	// 初始化设备
	binder_device->miscdev.fops = &binder_fops; // 设备的文件操作结构，这是 file_operations 结构
	binder_device->miscdev.minor = MISC_DYNAMIC_MINOR; // 次设备号 动态分配
	binder_device->miscdev.name = name; // 设备名, "binder"

	binder_device->context.binder_context_mgr_uid = INVALID_UID;
	binder_device->context.name = name;

	ret = misc_register(&binder_device->miscdev); // 注册 binder 为 misc 设备驱动
	if (ret < 0) {
		kfree(binder_device);
		return ret;
	}
	// 将 hlist 节点添加到 binder_devices 为表头的设备链表
	hlist_add_head(&binder_device->hlist, &binder_devices);

	return ret;
}
```

在前面讲 Linux 设备时，提到过 Linux 设备主要有字符设备，块设备等，杂项设备也属于 Linux 的一种设备类型，它是嵌入设系统用的比较多的一种设备。

**binder_fops**

``` c
static const struct file_operations binder_fops = {
	.owner = THIS_MODULE,
	.poll = binder_poll,
	.unlocked_ioctl = binder_ioctl,
	.compat_ioctl = binder_ioctl,
	.mmap = binder_mmap,
	.open = binder_open,
	.flush = binder_flush,
	.release = binder_release,
};
```

miscdev 定义了当前的驱动名为 binder，并指定了 open，mmap，unlocked_ioctl，compat_ioctl 等 I/O 函数的实现函数。

binder_foops 是代码从 native 层调到 kernel 层的函数对应关系，比如 native 层调用 mmap() 函数，kernel 层对应的函数就是 binder_mmap()；

应用程序在调用 `ioctl` 进行设备控制时，最后会调用到设备注册 `struct file_operations` 结构体对象时的 `unlocked_ioctl` 或者 `compat_ioctl` 两个钩子上，具体是调用哪个钩子判断标准如下：

- `compat_ioctl` : 32位的应用运行在64位的内核上，这个钩子被调用。
- `unlocked_ioctl`: 64位的应用运行在64位的内核或者32位的应用运行在32位的内核上，则调用这个钩子。
  Binder 做为 Android 中进程间高效通信的核心组件，其底层是以 misc 设备驱动的形式实现的，但它本身并没有实现 `read`,`write` 操作，所有的控制都是通过 `ioctl` 操作来实现。在 Binder 驱动的 `struct file_operations` 定义中可见，它的 `compat_ioctl` 和 `unlocked_ioctl` 两个钩子的的实现都是对应到 `binder_ioctl` 上的。

**binder_device**

``` c
struct binder_device {
	struct hlist_node hlist;
	struct miscdevice miscdev;
	struct binder_context context;
};
```

### 5.2 binder_open()

``` c
static int binder_open(struct inode *nodp, struct file *filp)
{
	struct binder_proc *proc;
	struct binder_device *binder_dev;

	binder_debug(BINDER_DEBUG_OPEN_CLOSE, "binder_open: %d:%d\n",
		     current->group_leader->pid, current->pid);

	proc = kzalloc(sizeof(*proc), GFP_KERNEL); // 为 binder_proc 结构体在 kernel 分配内存空间
	if (proc == NULL)
		return -ENOMEM;
	get_task_struct(current); // 将当前进程(调用 binder_open 的进程)的 task 保存到 binder 进程的 tsk
	proc->tsk = current;
	INIT_LIST_HEAD(&proc->todo); // 初始化 todo 列表（目标任务）
	init_waitqueue_head(&proc->wait); // 初始化 wait 队列（当前进程处理的任务）
	proc->default_priority = task_nice(current); // 将当前进程的 nice 值转换为进程优先级
	binder_dev = container_of(filp->private_data, struct binder_device,
				  miscdev);
	proc->context = &binder_dev->context;

	binder_lock(__func__); // 同步锁，因为 binder 支持多线程访问

	binder_stats_created(BINDER_STAT_PROC); // binder_proc 对象创建数加1
	hlist_add_head(&proc->proc_node, &binder_procs); // 将 proc_node 节点添加到 binder_procs 的队列头部
	proc->pid = current->group_leader->pid; // 进程 pid
	INIT_LIST_HEAD(&proc->delivered_death);  // 初始化已分发的死亡通知列表
	filp->private_data = proc; // 将 binder_proc 与 filp 关联起来，这样下次通过 filp 就能找到这个 proc 了

	binder_unlock(__func__); // 释放同步锁
	...
	return 0;
}
```

**binder_proc**

``` c
struct binder_proc {
    struct hlist_node proc_node; // 进程节点
    struct rb_root threads; // binder_thread红黑树的根节点
    struct rb_root nodes; // binder_node红黑树的根节点
    struct rb_root refs_by_desc; // binder_ref红黑树的根节点(以 handle为 key)
    struct rb_root refs_by_node; // binder_ref红黑树的根节点（以 ptr为 key）
    int pid; // 相应进程 id
    struct vm_area_struct *vma; // 指向进程虚拟地址空间的指针
    struct mm_struct *vma_vm_mm; // 相应进程的内存结构体
    struct task_struct *tsk; // 相应进程的 task结构体
    struct files_struct *files; // 相应进程的文件结构体
    struct hlist_node deferred_work_node;
    int deferred_work;
    void *buffer; // 内核空间的起始地址
    ptrdiff_t user_buffer_offset; // 内核空间与用户空间的地址偏移量
    struct list_head buffers; // 所有的 buffer
    struct rb_root free_buffers; // 空闲的 buffer
    struct rb_root allocated_buffers; // 已分配的 buffer
    size_t free_async_space; // 异步的可用空闲空间大小
    struct page **pages; // 指向物理内存页指针的指针
    size_t buffer_size; // 映射的内核空间大小
    uint32_t buffer_free; // 可用内存总大小
    struct list_head todo; // 进程将要做的事
    wait_queue_head_t wait; // 等待队列
    struct binder_stats stats; // binder统计信息
    struct list_head delivered_death; // 已分发的死亡通知
    int max_threads; // 最大线程数
    int requested_threads; // 请求的线程数
    int requested_threads_started; // 已启动的请求线程数
    int ready_threads; // 准备就绪的线程个数
    long default_priority; // 默认优先级
    struct dentry *debugfs_entry; struct binder_context *context;
};
```

### 5.3 binder_mmap()

``` c
static int binder_mmap(struct file *filp, struct vm_area_struct *vma)
{
	int ret;
	struct vm_struct *area; // 内核的虚拟内存，vma 是进程的虚拟内存
	struct binder_proc *proc = filp->private_data;
	const char *failure_string;
	struct binder_buffer *buffer;

	if (proc->tsk != current)
		return -EINVAL;

	// 保证映射内存大小不超过 4M（是驱动定的，实际上应用层定的是 1M-8K）
	if ((vma->vm_end - vma->vm_start) > SZ_4M)
		vma->vm_end = vma->vm_start + SZ_4M;
	...
	mutex_lock(&binder_mmap_lock); // 同步锁，保证一次只有一个进程分配内存，保证多进程间的并发访问
	// 是否已经做过映射，执行过则进入 if，goto 跳转，释放同步锁后结束 binder_mmap 方法
    if (proc->buffer) {
		ret = -EBUSY;
		failure_string = "already mapped";
		goto err_already_mapped;
	}

	// 采用 VM_IOREMAP方式，分配一个连续的内核虚拟内存，与进程虚拟内存大小一致
	area = get_vm_area(vma->vm_end - vma->vm_start, VM_IOREMAP);
	if (area == NULL) { // 内存分配不成功直接报错
		ret = -ENOMEM;
		failure_string = "get_vm_area";
		goto err_get_vm_area_failed;
	}
	proc->buffer = area->addr; // 将 proc 中的 buffer 指针指向这块内核的虚拟内存
	// 计算出用户空间和内核空间的地址偏移量。地址偏移量 = 用户虚拟内存地址 - 内核虚拟内存地址
	proc->user_buffer_offset = vma->vm_start - (uintptr_t)proc->buffer;
	mutex_unlock(&binder_mmap_lock); // 释放锁
	...
	// 分配物理页的指针数组，数组大小为 vma 的等效 page 个数
	proc->pages = kzalloc(sizeof(proc->pages[0]) * ((vma->vm_end - vma->vm_start) / PAGE_SIZE), GFP_KERNEL);
	if (proc->pages == NULL) {
		ret = -ENOMEM;
		failure_string = "alloc page array";
		goto err_alloc_pages_failed;
	}
	proc->buffer_size = vma->vm_end - vma->vm_start;

	vma->vm_ops = &binder_vm_ops;
	vma->vm_private_data = proc;

	// 分配物理页面，同时映射到内核空间和进程空间，先分配 1 个物理页
	if (binder_update_page_range(proc, 1, proc->buffer, proc->buffer + PAGE_SIZE, vma)) {
		ret = -ENOMEM;
		failure_string = "alloc small buf";
		goto err_alloc_small_buf_failed;
	}
	buffer = proc->buffer;
	INIT_LIST_HEAD(&proc->buffers);
	list_add(&buffer->entry, &proc->buffers); // 将 buffer 连入 buffers 链表中
	// 上面 binder_update_page_range 已经分配内存了，此处表示此内存可用
    buffer->free = 1;
	binder_insert_free_buffer(proc, buffer); // 将 buffer 插入 proc->free_buffers 链表中
	proc->free_async_space = proc->buffer_size / 2; // 异步的可用空闲空间大小
	barrier();
	proc->files = get_files_struct(current);
	proc->vma = vma;
	proc->vma_vm_mm = vma->vm_mm;

	...
	return ret;
}
```

- struct vm_area_struct *vma： 表示用户空间的一段虚拟内存区域；
- struct vm_struct *area：表示内核空间的一段连续的虚拟内存区域；

新版本内核代码 4.19 已经不再此处映射了：https://zhuanlan.zhihu.com/p/159189816

**binder_update_page_range**

``` c
static int binder_update_page_range(struct binder_proc *proc, int allocate,
				    void *start, void *end,
				    struct vm_area_struct *vma)
{
	void *page_addr;
	unsigned long user_page_addr;
	struct page **page;
	struct mm_struct *mm;
	...
	// allocate 为 1，代表分配内存过程；如果为 0 则代表释放内存过程
	if (allocate == 0)
		goto free_range;
	...
	for (page_addr = start; page_addr < end; page_addr += PAGE_SIZE) {
		int ret;

		page = &proc->pages[(page_addr - proc->buffer) / PAGE_SIZE];

		BUG_ON(*page);
        // 分配一个 page(4K) 的物理内存
		*page = alloc_page(GFP_KERNEL | __GFP_HIGHMEM | __GFP_ZERO);
		if (*page == NULL) {
			pr_err("%d: binder_alloc_buf failed for page at %p\n",
				proc->pid, page_addr);
			goto err_alloc_page_failed;
		}
		// 把内核空间的虚拟内存映射到上面分配的 4K 物理内存
		ret = map_kernel_range_noflush((unsigned long)page_addr,
					PAGE_SIZE, PAGE_KERNEL, page);
		...
		user_page_addr =
			(uintptr_t)page_addr + proc->user_buffer_offset;
		// 把用户空间的虚拟内存映射到上面分配的 4K 物理内存
		ret = vm_insert_page(vma, user_page_addr, page[0]);
	...
}
```

### 5.4 binder_ioctl

``` c
static long binder_ioctl(struct file *filp, unsigned int cmd, unsigned long arg)
{
	int ret;
	struct binder_proc *proc = filp->private_data;
	struct binder_thread *thread;
	unsigned int size = _IOC_SIZE(cmd);
	void __user *ubuf = (void __user *)arg;
	...
    // 进入休眠状态，直到中断唤醒
	ret = wait_event_interruptible(binder_user_error_wait, binder_stop_on_user_error < 2); 
	if (ret)
		goto err_unlocked;

	// 根据当前进程的 pid，从 binder_proc 中查找 binder_thread, 
	// 如果当前线程已经加入到 proc 的线程队列则直接返回，如果不存在则创建 binder_thread，并将当前线程添加到当前的 proc
	thread = binder_get_thread(proc);
	if (thread == NULL) {
		ret = -ENOMEM;
		goto err;
	}

	// 进行 binder 的读写操作
	switch (cmd) {
    // BINDER_WRITE_READ 这个用的比较多，比较重要
	case BINDER_WRITE_READ:
		ret = binder_ioctl_write_read(filp, cmd, arg, thread);
		if (ret)
			goto err;
		break;
    case BINDER_SET_MAX_THREADS: {
        int max_threads;
        if (copy_from_user(&max_threads, ubuf,
                   sizeof(max_threads))) {
            ret = -EINVAL;
            goto err;
        }
        binder_inner_proc_lock(proc);
        proc->max_threads = max_threads;
        binder_inner_proc_unlock(proc);
        break;
    }
    case BINDER_SET_CONTEXT_MGR_EXT: {
        struct flat_binder_object fbo;
        if (copy_from_user(&fbo, ubuf, sizeof(fbo))) {
            ret = -EINVAL;
            goto err;
        }
        ret = binder_ioctl_set_ctx_mgr(filp, &fbo);
        if (ret)
            goto err;
        break;
    }
    case BINDER_SET_CONTEXT_MGR:
        ret = binder_ioctl_set_ctx_mgr(filp, NULL);
        if (ret)
            goto err;
        break;
	case BINDER_THREAD_EXIT:
		binder_debug(BINDER_DEBUG_THREADS, "%d:%d exit\n",
			     proc->pid, thread->pid);
		binder_free_thread(proc, thread);
		thread = NULL;
		break;
    case BINDER_VERSION: {
        struct binder_version __user *ver = ubuf;
        if (size != sizeof(struct binder_version)) {
            ret = -EINVAL;
            goto err;
        }
        if (put_user(BINDER_CURRENT_PROTOCOL_VERSION,
                 &ver->protocol_version)) {
            ret = -EINVAL;
            goto err;
        }
        break;
    }...
	default:
		ret = -EINVAL;
		goto err;
	}
err:
    if (thread)
        thread->looper_need_return = false; // 注意此处又把 looper_need_return 设置为了 true
	...
}
```

- __user：`__user` 是一个宏，它告诉编译器不应该解除这个指针的引用（因为在当前地址空间中它是没有意义的），`(void __user *)arg` 表示 `arg` 是一个用户空间地址，不能直接进行拷贝，必须使用 `copy_from_user/copy_to_user` 等函数拷贝；
- wait_event_interruptible：也是一个宏，它是用来挂起进程直到满足判断条件的，`binder_stop_on_user_error` 是一个全局变量，它的初始值为 0，`binder_user_error_wait` 是一个等待队列，在正常情况下，`binder_stop_on_user_error < 2` 这个条件是成立的，所以不会进入挂起状态，而当`binder` 因为错误而停止后，调用 `binder_ioctl`，则会挂起进程，直到其他进程通过 `wake_up_interruptible` 来唤醒 `binder_user_error_wait` 队列，并且满足 `binder_stop_on_user_error < 2` 这个条件，`binder_ioctl` 才会继续往后运行；

`接着来看一下 binder_get_thread()`；

#### binder_get_thread()

``` c
// binder.c
static struct binder_thread *binder_get_thread(struct binder_proc *proc)
{
    struct binder_thread *thread;
    struct binder_thread *new_thread;
    binder_inner_proc_lock(proc);
    thread = binder_get_thread_ilocked(proc, NULL);
    binder_inner_proc_unlock(proc);
    if (!thread) {
        new_thread = kzalloc(sizeof(*thread), GFP_KERNEL);
        if (new_thread == NULL)
            return NULL;
        binder_inner_proc_lock(proc);
        thread = binder_get_thread_ilocked(proc, new_thread);
        binder_inner_proc_unlock(proc);
        if (thread != new_thread)
            kfree(new_thread);
    }
    return thread;
}
```

先调用 `binder_get_thread_ilocked()` 获取线程，如果获取不到，则通过 `kzalloc()` 分配内存并把所分配内存对象的引用传递给 new_thread，然后再次通过`binder_get_thread_ilocked(proc, new_thread)`来获取 thread，

``` c
// binder.c
static struct binder_thread *binder_get_thread_ilocked(
        struct binder_proc *proc, struct binder_thread *new_thread)
{
    struct binder_thread *thread = NULL;
    struct rb_node *parent = NULL;
    struct rb_node **p = &proc->threads.rb_node;
    while (*p) {
        parent = *p;
        thread = rb_entry(parent, struct binder_thread, rb_node);
        if (current->pid < thread->pid)
            p = &(*p)->rb_left;
        else if (current->pid > thread->pid)
            p = &(*p)->rb_right;
        else
            return thread;
    }
    if (!new_thread)
        return NULL;
    thread = new_thread;
    binder_stats_created(BINDER_STAT_THREAD);
    thread->proc = proc;
    thread->pid = current->pid;
    get_task_struct(current);
    thread->task = current;
    atomic_set(&thread->tmp_ref, 0);
    init_waitqueue_head(&thread->wait);
    INIT_LIST_HEAD(&thread->todo);
    rb_link_node(&thread->rb_node, parent, p);
    rb_insert_color(&thread->rb_node, &proc->threads);
    thread->looper_need_return = true; // 此处配置了 looper_need_return 为 true
    thread->return_error.work.type = BINDER_WORK_RETURN_ERROR;
    thread->return_error.cmd = BR_OK;
    thread->reply_error.work.type = BINDER_WORK_RETURN_ERROR;
    thread->reply_error.cmd = BR_OK;
    INIT_LIST_HEAD(&new_thread->waiting_thread_node); // 初始化链表（next/prev 指针都指向自己）
    return thread;
}
```

可以看到函数先是根据 proc 获取对应红黑树上的节点，如果获取不到则返回 thread（为 NULL），分配内存后再次进入此函数，执行 `while()` 循环后面的代码，把 new_thread 传递给 thread，并初始化了一些参数，<font color=red>**注意此处 `looper_need_return = true`**</font>，这个参数在 `binder_thread_read()`判断是否休眠时会用到，不过<font color=red>**在 `binder_ioctl()` 的结尾处又把 looper_need_return 配置为了 false**</font>，所以应用程序在刚启动创建 binder 线程池时，先启动了一个 binder 主线程，在主线程第一次调用 binder_ioctl 时是不会阻塞在 binder_thread_read() 的，另外也初始化了 todo 和 waiting_thread_node 这两个链表；

继续回到 `binder_ioctl()` 函数中，BINDER_WRITE_READ 这个 case 比较重要，因为应用程序是通过 `ioctl(mDriverFD, BINDER_WRITE_READ, &bwr)` 这样调用，然后就调用到了 binder_ioctl 的 BINDER_WRITE_READ 这个 case；

``` c
static int binder_ioctl_write_read(struct file *filp,
				unsigned int cmd, unsigned long arg,
				struct binder_thread *thread)
{
	int ret = 0;
	struct binder_proc *proc = filp->private_data;
	unsigned int size = _IOC_SIZE(cmd);
	void __user *ubuf = (void __user *)arg;
	struct binder_write_read bwr;
	...
	// 把用户空间数据 ubuf 拷贝到 bwr(此次拷贝的是数据头，而非有效数据)
    // 这里的 copy_from_user() 方法并没有拷贝要传输的数据，而仅是拷贝了持有传输数据内存地址的 bwr https://www.bilibili.com/read/cv7592830/
	if (copy_from_user(&bwr, ubuf, sizeof(bwr))) {
		ret = -EFAULT;
		goto out;
	}
	...
	// 当写缓存中有数据，则执行 binder 写操作
	if (bwr.write_size > 0) {
		ret = binder_thread_write(proc, thread,
					  bwr.write_buffer,
					  bwr.write_size,
					  &bwr.write_consumed);
		trace_binder_write_done(ret);
		if (ret < 0) {
			bwr.read_consumed = 0;
			if (copy_to_user(ubuf, &bwr, sizeof(bwr)))
				ret = -EFAULT;
			goto out;
		}
	}
	// 当读缓存中有数据，则执行 binder 读操作
	if (bwr.read_size > 0) {
		ret = binder_thread_read(proc, thread, bwr.read_buffer,
					 bwr.read_size,
					 &bwr.read_consumed,
					 filp->f_flags & O_NONBLOCK);
		trace_binder_read_done(ret);
		// 进程 todo 队列不为空,则唤醒该队列中的线程
		if (!list_empty(&proc->todo))
			wake_up_interruptible(&proc->wait);
		if (ret < 0) {
			if (copy_to_user(ubuf, &bwr, sizeof(bwr)))
				ret = -EFAULT;
			goto out;
		}
	}
	...
    // 把内核空间数据 bwr 拷贝到 ubuf
    if (copy_to_user(ubuf, &bwr, sizeof(bwr))) {
		ret = -EFAULT;
		goto out;
	}
}
```

此处的 copy_from_user 拷贝的并不是真正的有效数据，而是数据头，真正的有效数据是在其他地方拷贝的；

binder_ioctl_write_read 流程

- 首先把用户空间的数据拷贝到内核空间 bwr
- 其次当 bwr 写缓存中有数据，则执行 binder 写操作。如果写失败，则再将 bwr 数据写回用户空间，并退出
- 再次当 bwr 读缓存中有数据，则执行 binder 读缓存；当读失败，再将 bwr 数据写回用户空间，并退出
- 最后把内核数据拷贝到用户空间

### 5.5 总结

**binder_init()** 主要工作：

- kzalloc：分配内存；
- 初始化设备；
- hlist_add_head：将 binder_device 的 hlist 节点添加到 binder_devices 为表头的设备链表；

**binder_open()** 主要工作：

- 为调用 binder_open 的进程创建一个 binder_proc 结构体对象 proc；
- 将当前进程信息（调用 binder_open 的进程）保存到 proc；
- 把 proc 的 proc_node 添加到 binder_procs 链表中；
- filp->private_data = proc：把 proc 和 filp 关联，以便下次通过 filp 找到 proc；

**binder_mmap()** 主要工作：

- 根据用户空间的虚拟内存大小，分配一块内核的虚拟内存；
- 分配一块物理内存（4K，之所以这么小是因为现在还没有通信，等到真正通信的时候再增加，以免浪费内存）；
- 把分配的物理内存分别映射到内核空间虚拟内存和用户空间虚拟内存；

**binder_ioctl()** 主要工作：

- binder_ioctl() 函数负责在两个进程间收发 IPC 数据和 IPC reply 数据；

## 6. binder JNI 注册

[frameworks/base/cmds/app_process/app_main.cpp]()

**app_main.main()**

``` cpp
int main(int argc, char* const argv[])
{
    ...
    if (zygote) {
        runtime.start("com.android.internal.os.ZygoteInit", args, zygote);
    } else if (className) {
        runtime.start("com.android.internal.os.RuntimeInit", args, zygote);
    }
```

[frameworks/base/core/jni/AndroidRuntime.cpp]()

**AndroidRuntime.start()**

``` cpp
void AndroidRuntime::start(const char* className, const Vector<String8>& options, bool zygote)
{
    ...
    /*
     * Register android functions.
     */
    if (startReg(env) < 0) {
        ALOGE("Unable to register all android natives\n");
        return;
    }
```

**AndroidRuntime.startReg()**

``` cpp
/*static*/ int AndroidRuntime::startReg(JNIEnv* env)
{
    ...
    if (register_jni_procs(gRegJNI, NELEM(gRegJNI), env) < 0) {
        env->PopLocalFrame(NULL);
        return -1;
    }
    ...
```

**AndroidRuntime.register_jni_procs()**

``` cpp
static int register_jni_procs(const RegJNIRec array[], size_t count, JNIEnv* env)
{
    for (size_t i = 0; i < count; i++) {
        if (array[i].mProc(env) < 0) {
		   ...
            return -1;
        }
    }
    return 0;
}

static const RegJNIRec gRegJNI[] = {
        ...
        REG_JNI(register_android_os_SystemProperties),
        REG_JNI(register_android_os_Binder),
```

[frameworks/base/core/jni/android_util_Binder.cpp]()

**android_util_Binder.register_android_os_Binder()**

``` cpp
int register_android_os_Binder(JNIEnv* env)
{
    if (int_register_android_os_Binder(env) < 0)
        return -1;
    if (int_register_android_os_BinderInternal(env) < 0)
        return -1;
    if (int_register_android_os_BinderProxy(env) < 0)
        return -1;
...
```

**android_util_Binder.int_register_android_os_Binder()**

``` cpp
static const JNINativeMethod gBinderMethods[] = {
    { "getCallingPid", "()I", (void*)android_os_Binder_getCallingPid },
    { "getCallingUid", "()I", (void*)android_os_Binder_getCallingUid },
    ...
    { "getExtension", "()Landroid/os/IBinder;", (void*)android_os_Binder_getExtension },
    { "setExtension", "(Landroid/os/IBinder;)V", (void*)android_os_Binder_setExtension },
};
const char* const kBinderPathName = "android/os/Binder";
static int int_register_android_os_Binder(JNIEnv* env)
{
    // 查找文件 kBinderPathName = "android/os/Binder"，返回对应 Class 对象
    jclass clazz = FindClassOrDie(env, kBinderPathName);

    // 通过 gBinderOffsets 结构体，保存 Java 层 Binder 类的信息，为 native 层访问 Java 层提供通道
    gBinderOffsets.mClass = MakeGlobalRefOrDie(env, clazz);
    gBinderOffsets.mExecTransact = GetMethodIDOrDie(env, clazz, "execTransact", "(IJJI)Z");
    gBinderOffsets.mGetInterfaceDescriptor = GetMethodIDOrDie(env, clazz, "getInterfaceDescriptor",
        "()Ljava/lang/String;");
    gBinderOffsets.mObject = GetFieldIDOrDie(env, clazz, "mObject", "J");

    // 通过 RegisterMethodsOrDie，将为 gBinderMethods 数组完成映射关系，从而为 Java 层访问 JNI 层提供通道
    return RegisterMethodsOrDie(
        env, kBinderPathName,
        gBinderMethods, NELEM(gBinderMethods));
}
```

int_register_android_os_Binder 的作用就是让 Java 层和 native 层能够互相调用；

## 7. Binder 常见对象区别

初见 BinderProxy、BpBinder、binder_ref、binder_node、BBinder、Binder 简直一脸懵逼，头都 TMD 绕晕了，有什么区别呢？

| 概念                           | 作用                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| BpBinder —— Binder 代理对象    | 在用户空间创建，且执行在 Client 进程中，会被 Client 进程中的其他对象引用，另外会**引用 Binder 驱动程序中的 Binder 引用对象** |
| binder_ref —— Binder 引用对象  | 在 Binder 驱动程序中创建，**被 Binder 代理对象引用**         |
| binder_node —— Binder 实体对象 | 在 Binder 驱动程序中创建，**被 Binder 引用对象所引用**       |
| BBinder —— Binder 本地对象     | 在用户空间创建，且执行在 Server 进程中，**会被 Server 进程中其他对象引用，还会被 Binder 实体对象引用** |

Binder 实体（binder_node）：是各个 Server 以及 ServiceManager 在内核中的存在形式。实际上是内核中 binder_node 结构体的对象 ，它的作用是在内核中保存 Server 和 ServiceManager 的信息(例如，Binder 实体中保存了 Server 对象在用户空间的地址)。简言之，Binder 实体是 Server 在 Binder 驱动中的存在形式，内核通过 Binder 实体可以找到用户空间的 Server 对象。  

Binder 引用/代理（binder_ref）：所谓 Binder 引用，实际上是内核中 binder_ref 结构体的对象，它的作用是在表示`Binder 实体`的引用。换句话说，每一个 Binder 引用都是某一个 Binder 实体的引用，通过 Binder 引用可以在内核中找到它对应的Binder实体。

Binder 实体和 Binder 引用都是内核（Binder 驱动）中的数据结构。每一个 Server 在内核中就表现为一个 Binder 实体，在每一个 Client 中则表现为一个 Binder 引用。这样，每个 Binder 引用都对应一个 Binder 实体，而每个 Binder 实体则可以多个 Binder 引用。

引用关系：BpBinder ——> binder_ref ——> binder_node ——> BBinder

## 8. Binder 相关的类

[Binder_涉及类](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Binder_涉及类.png)

![Binder_涉及类](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Binder_涉及类.png "Binder 涉及类")



## 9. Binder 类图

[Binder_类图](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Binder_类图.png)

![Binder_类图](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Binder_类图.png "Binder 类图")

- Binder(Java) 对象持有的 mObject 是 JavaBBinderHolder 的引用；
- JavaBBinderHolder 对象持有一个 mBinder 弱引用，promote 为强引用后指向 JavaBBinder 对象；
- JavaBBinder 对象持有的 mObject 是 Binder 对象的 GlobalRef（将 Binder 对象加入到 art::globals_ 列表中，这样 Binder 对象在每次 GC 时都会被标记为 GC Root，也便无法被回收，只有当 JavaBBinder 对象销毁时，Binder 对象才能从 art::globals_ 中清除，才能被销毁）；



补充待整理：

BinderProxy 就是 BpBinder，"BpBinder" 中的 "p" 即 Proxy，只不过 BpBinder 是 Native 层的，BinderProxy 是 Java 层的。BinderProxy 和 BpBinder 分别继承自 Java 层和 Native 层的 IBinder 接口，即 IBinder.h 和 IBinder.java，它们可以看作同一个接口，都定义了 transact 等方法。



Ref: [深入理解Android进程间通信机制](https://blog.csdn.net/tyuiof/article/details/108290327)
