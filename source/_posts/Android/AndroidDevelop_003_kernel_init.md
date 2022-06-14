---
title: Android 底层开发 - init 进程启动
date: 2020-03-01 10:30:09
tags:
categories: Android
copyright: true
password:
---

>init 进程启动分为两部分，第一部分是在内核启动，主要完成创建和内核初始化工作；第二部分是在用户空间启动，主要完成 Android 系统的初始化工作。
>

<!--more-->

### 1. 内核空间

[kernel/msm/init/main.c](https://android.googlesource.com/kernel/msm/+/refs/tags/android-11.0.0_r0.25/init/main.c)

``` c
asmlinkage __visible void __init start_kernel(void)
{
    ...
	rest_init();
}
```

``` c
static noinline void __ref rest_init(void)
{
	...
	/*
	 * We need to spawn init first so that it obtains pid 1, however
	 * the init task will end up wanting to create kthreads, which, if
	 * we schedule it before we create kthreadd, will OOPS.
	 */
	pid = kernel_thread(kernel_init, NULL, CLONE_FS);
    ...
}
```

使用 kernel_thread 创建 init 进程，并回调执行 kernel_init 函数：

``` c
static int __ref kernel_init(void *unused)
{
	int ret;
	kernel_init_freeable();
	/* need to finish all async __init code before freeing the memory */
	async_synchronize_full();
	ftrace_free_init_mem();
	free_initmem();
	mark_readonly();
	system_state = SYSTEM_RUNNING;
	numa_default_policy();
	rcu_end_inkernel_boot();
	place_marker("M - DRIVER Kernel Boot Done");
	if (ramdisk_execute_command) {
		ret = run_init_process(ramdisk_execute_command);
		if (!ret)
			return 0;
		pr_err("Failed to execute %s (error %d)\n",
		       ramdisk_execute_command, ret);
	}
	/*
	 * We try each of these until one succeeds.
	 *
	 * The Bourne shell can be used instead of init if we are
	 * trying to recover a really broken machine.
	 */
	if (execute_command) {
		ret = run_init_process(execute_command);
		if (!ret)
			return 0;
		panic("Requested init %s failed (error %d).",
		      execute_command, ret);
	}
    // ramdisk_execute_command 和 execute_command 定义的程序没找到，则从如下目录寻找 init 进行启动
	if (!try_to_run_init_process("/sbin/init") ||
	    !try_to_run_init_process("/etc/init") ||
	    !try_to_run_init_process("/bin/init") ||
	    !try_to_run_init_process("/bin/sh")) // try_to_run_init_process 最终也是调用 run_init_process 函数
		return 0;
	panic("No working init found.  Try passing init= option to kernel. "
	      "See Linux Documentation/admin-guide/init.rst for guidance.");
}
```

ramdisk_execute_command 和 execute_command 的值是通过 bootloader 传递过来的参数设置的，ramdisk_execute_command 通过 `rdinit` 参数赋值，execute_command 通过 `init` 参数赋值，这两个参数会在 BoardConfig.mk 中的 BOARD_KERNEL_CMDLINE 中定义：

``` makefile
BOARD_KERNEL_CMDLINE += init=/init
```

ramdisk_execute_command 如果没有被赋值，kernel_init_freeable 函数会赋一个初始值 "/init"：

``` c
static noinline void __init kernel_init_freeable(void)
{
    ...
    if (!ramdisk_execute_command)
		ramdisk_execute_command = "/init";
    ...
}
```

找到 init 程序后，执行 run_init_process 函数

``` c
static int try_to_run_init_process(const char *init_filename)
{
	int ret;
	ret = run_init_process(init_filename);
	if (ret && ret != -ENOENT) {
		pr_err("Starting init: %s exists but couldn't execute it (error %d)\n",
		       init_filename, ret);
	}
	return ret;
}
```

``` c
static int run_init_process(const char *init_filename)
{
	argv_init[0] = init_filename;
	return do_execve(getname_kernel(init_filename),
		(const char __user *const __user *)argv_init,
		(const char __user *const __user *)envp_init);
}
```

do_execve 就是执行一个可执行文件。

内核空间的 init 主要工作是做一些 init 的初始化工作，去系统根目录寻找 ramdisk_execute_command 和 execute_command 定义的程序，如果找不到，就寻找 */sbin/init*, */etc/init*, */bin/init*, */bin/sh* 这四个程序进行启动，如果都找不到，则输出 panic 异常。

接下来进入用户空间，分析 Android 系统的 init 进程启动流程。

### 2. 用户空间

init 可执行文件的源码在 [system/core/init/](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/) 目录下

#### 2.1 init 进程入口

[system/core/init/main.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/main.cpp)

``` cpp
int main(int argc, char** argv) {
#if __has_feature(address_sanitizer)
    __asan_set_error_report_callback(AsanReportCallback);
#endif

    if (!strcmp(basename(argv[0]), "ueventd")) {
        // init 进程创建子进程 ueventd，负责设备节点的创建、权限设定等一系列工作
        return ueventd_main(argc, argv);
    }

    // 当传入的参数个数大于 1 时
    if (argc > 1) {
        // strcmp 是字符串比较函数，相等则返回 0
        if (!strcmp(argv[1], "subcontext")) {
            android::base::InitLogging(argv, &android::base::KernelLogger);
            const BuiltinFunctionMap& function_map = GetBuiltinFunctionMap();
            // 参数为 subcontext，初始化日志系统
            return SubcontextMain(argc, argv, &function_map);
        }

        if (!strcmp(argv[1], "selinux_setup")) {
            // 参数为 selinux_setup，启动 Selinux 安全策略
            return SetupSelinux(argv);
        }

        if (!strcmp(argv[1], "second_stage")) {
            // 参数为 second_stage，执行 init 进程第二阶段启动
            return SecondStageMain(argc, argv);
        }
    }

    // 默认执行 init 进程第一阶段启动
    return FirstStageMain(argc, argv);
}
```

init 进程创建子进程 ueventd ，将创建节点文件的任务交给 ueventd，由上面分析可知，通过 [kernel/msm/init/main.c](https://android.googlesource.com/kernel/msm/+/refs/tags/android-11.0.0_r0.25/init/main.c) 执行 init 程序，无参数，则进入第一阶段启动。

#### 2.2 FirstStageMain

[system/core/init/first_stage_init.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/first_stage_init.cpp)

[system/core/init/first_stage_init.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/first_stage_init.cpp)

```  c++
int FirstStageMain(int argc, char** argv) {
    if (REBOOT_BOOTLOADER_ON_PANIC) {
        // 处理 init crash 的情况，初始化重启系统的处理信号，将 SIGABRT,SIGBUS 等行为设置为 SA_RESTART，当监听到该信号时重启系统到 bootloader
        InstallRebootSignalHandlers();
    }

    boot_clock::time_point start_time = boot_clock::now(); // 记录启动时间

    std::vector<std::pair<std::string, int>> errors;
#define CHECKCALL(x) \
    if ((x) != 0) errors.emplace_back(#x " failed", errno);

    // Clear the umask.
    umask(0);

    CHECKCALL(clearenv());
    CHECKCALL(setenv("PATH", _PATH_DEFPATH, 1));
    // Get the basic filesystem setup we need put together in the initramdisk
    // on / and then we'll let the rc file figure out the rest.
    CHECKCALL(mount("tmpfs", "/dev", "tmpfs", MS_NOSUID, "mode=0755")); // 挂载 tmpfs 文件系统
    CHECKCALL(mkdir("/dev/pts", 0755)); // 创建目录
    CHECKCALL(mkdir("/dev/socket", 0755));
    CHECKCALL(mount("devpts", "/dev/pts", "devpts", 0, NULL)); // 挂载 devpts 文件系统
#define MAKE_STR(x) __STRING(x)
    CHECKCALL(mount("proc", "/proc", "proc", 0, "hidepid=2,gid=" MAKE_STR(AID_READPROC))); // 挂载 proc 文件系统
#undef MAKE_STR
    // Don't expose the raw commandline to unprivileged processes.
    CHECKCALL(chmod("/proc/cmdline", 0440));
    std::string cmdline;
    android::base::ReadFileToString("/proc/cmdline", &cmdline);
    gid_t groups[] = {AID_READPROC};
    CHECKCALL(setgroups(arraysize(groups), groups));
    CHECKCALL(mount("sysfs", "/sys", "sysfs", 0, NULL)); // 挂载 sysfs 文件系统
    CHECKCALL(mount("selinuxfs", "/sys/fs/selinux", "selinuxfs", 0, NULL));

    CHECKCALL(mknod("/dev/kmsg", S_IFCHR | 0600, makedev(1, 11))); // 提前创建 kmsg 设备节点文件，用于输出 log 信息

    if constexpr (WORLD_WRITABLE_KMSG) {
        CHECKCALL(mknod("/dev/kmsg_debug", S_IFCHR | 0622, makedev(1, 11)));
    }

    CHECKCALL(mknod("/dev/random", S_IFCHR | 0666, makedev(1, 8)));
    CHECKCALL(mknod("/dev/urandom", S_IFCHR | 0666, makedev(1, 9)));

    // This is needed for log wrapper, which gets called before ueventd runs.
    CHECKCALL(mknod("/dev/ptmx", S_IFCHR | 0666, makedev(5, 2)));
    CHECKCALL(mknod("/dev/null", S_IFCHR | 0666, makedev(1, 3)));

    // These below mounts are done in first stage init so that first stage mount can mount
    // subdirectories of /mnt/{vendor,product}/.  Other mounts, not required by first stage mount,
    // should be done in rc files.
    // Mount staging areas for devices managed by vold
    // See storage config details at http://source.android.com/devices/storage/
    CHECKCALL(mount("tmpfs", "/mnt", "tmpfs", MS_NOEXEC | MS_NOSUID | MS_NODEV,
                    "mode=0755,uid=0,gid=1000"));
    // /mnt/vendor is used to mount vendor-specific partitions that can not be
    // part of the vendor partition, e.g. because they are mounted read-write.
    CHECKCALL(mkdir("/mnt/vendor", 0755)); // 创建 vendor 目录
    // /mnt/product is used to mount product-specific partitions that can not be
    // part of the product partition, e.g. because they are mounted read-write.
    CHECKCALL(mkdir("/mnt/product", 0755)); // 创建 product 目录

    // /debug_ramdisk is used to preserve additional files from the debug ramdisk
    CHECKCALL(mount("tmpfs", "/debug_ramdisk", "tmpfs", MS_NOEXEC | MS_NOSUID | MS_NODEV,
                    "mode=0755,uid=0,gid=0"));
#undef CHECKCALL

    SetStdioToDevNull(argv); // 把标准输入、标准输出和标准错误重定向到空设备文件 "/dev/null"
    // Now that tmpfs is mounted on /dev and we have /dev/kmsg, we can actually
    // talk to the outside world...
    InitKernelLogging(argv); // 初始化 kernel log 系统

    ...

    LOG(INFO) << "init first stage started!";

    ...

    if (!DoFirstStageMount()) { // DoFirstStageMount：初始化特定设备并挂载
        LOG(FATAL) << "Failed to mount required partitions early ...";
    }

    ...
    // Android Verified Boot，AVB 主要用于防止系统文件本身被篡改，还包含了防止系统回滚的功能 
    SetInitAvbVersionInRecovery();

    const char* path = "/system/bin/init";
    const char* args[] = {path, "selinux_setup", nullptr};
    auto fd = open("/dev/kmsg", O_WRONLY | O_CLOEXEC);
    dup2(fd, STDOUT_FILENO);
    dup2(fd, STDERR_FILENO);
    close(fd);
    execv(path, const_cast<char**>(args));

    // execv() only returns if an error happened, in which case we
    // panic and never fall through this conditional.
    PLOG(FATAL) << "execv(\"" << path << "\") failed";

    return 1;
}
```

FirstStageMain() 主要工作：

- InstallRebootSignalHandlers()：处理 init crash 的情况，初始化重启系统的处理信号，将 SIGABRT, SIGBUS, SIGFPE, SIGILL, SIGSEGV, SIGSTKFLT, SIGSYS, SIGTRAP 等行为设置为 SA_RESTART，当监听到该信号时重启系统到 bootloader

- umask(0)：设置允许当前进程创建文件或者目录最大可操作的权限 0777

- CHECKALL()：检查创建/挂载相关节点，如 */dev/kmsg*、*/proc*、*/mnt/vendor* 等

  - mount 函数原型

    ``` c++
    /* source：将要挂上的文件系统，通常是一个设备名
     * target：文件系统所要挂载的目标目录。
     * filesystemtype：文件系统的类型，可以是"ext2"，"msdos"，"proc"，"ntfs"，"iso9660"
     * mountflags：指定文件系统的读写访问标志
     * data：文件系统特有的参数
     */
    int mount(const char *source, const char *target, const char *filesystemtype,
    unsigned long mountflags, const void *data);
    ```

    分别挂载了 `tmpfs, devpts, proc, sysfs, selinuxfs` 五类**文件系统**，

    - **tmpfs**：一种`虚拟内存文件系统`，它会将所有的文件存储在虚拟内存中，如果你将 tmpfs 文件系统卸载后，那么其下的所有的内容将不复存在。tmpfs 既可以使用 RAM，也可以使用交换分区，会根据你的实际需要而改变大小。tmpfs 的速度非常快，因为它是驻留在 RAM 中的，即使用了交换分区，性能仍然非常卓越。由于tmpfs是驻留在 RAM 的，因此它的内容是不持久的。断电后，tmpfs 的内容就消失了，这也是被称作 tmpfs 的根本原因。
    - **devpts**：是 linux 提供给管理员通过文件系统和内核进行沟通（读写）的一种`标准接口`，pts 是远程虚拟终端，devpts 即远程虚拟终端文件设备。通过 /dev/pts 可以了解目前远程虚拟终端的基本情况。
    - **proc**：proc 文件系统是一个非常重要的`虚拟文件系统`，只存在于内存当中不占用磁盘空间，它以文件系统的方式为访问系统内核数据的操作提供接口，用户和应用程序可以通过 proc 得到系统的信息，并可以改变内核的某些参数。
    - **sysfs**：也是一种`虚拟内存文件系统`，与 proc 类似，但除了和 proc 一样具有查看和设定内核参数的功能外，还有为 linux 统一设备模型作为管理之用，sysfs 导出内核数据的方式更统一，并且组织的更好，设计优于 proc。
    - **selinuxfs**：也是虚拟文件系统,通常挂载在/sys/fs/selinux目录下,用来存放SELinux安全策略文件。

- InitKernelLogging(argv)：初始化内核 log，位于节点 */dev/kmsg*，随后的日志格式化后写入到 */dev/kmsg 中

- execv(path, const_cast<char**>(args))：执行 `/system/bin/init selinux_setup` ，重新执行 init 程序，只不过带了个 `selinux_setup` 参数，重新回到 [system/core/init/main.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/main.cpp) 中：

  ``` c++
          if (!strcmp(argv[1], "selinux_setup")) {
              // 启动Selinux安全策略
              return SetupSelinux(argv);
          }
  ```

  execv 会停止执行当前的进程，以 path 指定的应用进程替换被停止执行的进程，进程 ID 没有改变。

#### 2.3 SetupSelinux

[system/core/init/selinux.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/selinux.cpp)

``` c++
int SetupSelinux(char** argv) {
    SetStdioToDevNull(argv);
    InitKernelLogging(argv);

    if (REBOOT_BOOTLOADER_ON_PANIC) {
        // 处理 init 进程 crash 的情况，重启到 BootLoader
        InstallRebootSignalHandlers();
    }

    boot_clock::time_point start_time = boot_clock::now();

    MountMissingSystemPartitions();

    // Set up SELinux, loading the SELinux policy.
    // 初始化 SELinux，加载 SELinux 策略，配置 log 输出
    SelinuxSetupKernelLogging();
    SelinuxInitialize();

    // We're in the kernel domain and want to transition to the init domain.  File systems that
    // store SELabels in their xattrs, such as ext4 do not need an explicit restorecon here,
    // but other file systems do.  In particular, this is needed for ramdisks such as the
    // recovery image for A/B devices.
    if (selinux_android_restorecon("/system/bin/init", 0) == -1) {
        PLOG(FATAL) << "restorecon failed of /system/bin/init failed";
    }

    setenv(kEnvSelinuxStartedAt, std::to_string(start_time.time_since_epoch().count()).c_str(), 1);

    // 启动 init 进程第二阶段
    const char* path = "/system/bin/init";
    const char* args[] = {path, "second_stage", nullptr};
    execv(path, const_cast<char**>(args));

    // execv() only returns if an error happened, in which case we
    // panic and never return from this function.
    PLOG(FATAL) << "execv(\"" << path << "\") failed";

    return 1;
}
```

SetupSelinux 主要工作是启动 Selinux 安全机制，初始化 Selinux，加载 Selinux 规则，配置 Selinux 日志输出，最后通过 execv 跳转 main.cpp 启动 init 进程第二阶段启动。

``` c++
        if (!strcmp(argv[1], "second_stage")) {
            // 执行第二阶段启动
            return SecondStageMain(argc, argv);
        }
```

#### 2.4 SecondStageMain

[system/core/init/init.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/init.cpp)

``` c++
int SecondStageMain(int argc, char** argv) {
    if (REBOOT_BOOTLOADER_ON_PANIC) {
        // 处理 init 进程 crash 的情况，重启到 BootLoader
        InstallRebootSignalHandlers();
    }
    ...
    InitKernelLogging(argv); // 初始化日志输出
    LOG(INFO) << "init second stage started!";
    ...
    PropertyInit(); // 1. 初始化属性系统，并从指定文件读取属性,
    ...
    // Now set up SELinux for second stage.
    SelinuxSetupKernelLogging(); // 配置第二阶段 Selinux
    SelabelInitialize();
    SelinuxRestoreContext(); // 恢复一些安全上下文
    ...
    InstallSignalFdHandler(&epoll); // 捕获子进程结束的信号，获取结束码，通过结束码把程序表中的子进程移除，防止成为僵尸进程的子进程占用程序表空间
    InstallInitNotifier(&epoll);
    StartPropertyService(&property_fd); // 2. 初始化并开启系统属性服务
    ...
    ActionManager& am = ActionManager::GetInstance();
    ServiceList& sm = ServiceList::GetInstance();

    LoadBootScripts(am, sm); // 3. 解析 init.rc 等文件，建立 rc 文件的 action 、service，启动其他进程
```

##### 2.4.1 PropertyInit

[system/core/init/property_service.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/property_service.cpp)

**PropertyInit**

``` cpp
void PropertyInit() {
    selinux_callback cb;
    cb.func_audit = PropertyAuditCallback;
    // selinux 控制属性的 set 和 get
    selinux_set_callback(SELINUX_CB_AUDIT, cb);

    mkdir("/dev/__properties__", S_IRWXU | S_IXGRP | S_IXOTH);
    CreateSerializedPropertyInfo(); // 从文件中加载属性值
    // 初始化 __system_property_area 属性内存区域，将 /dev/__properties__/property_info 设备文件映射到共享内存，此区域记录着所有的属性值
    if (__system_property_area_init()) { 
        LOG(FATAL) << "Failed to initialize property area";
    }
    if (!property_info_area.LoadDefaultPath()) {
        LOG(FATAL) << "Failed to load serialized property info file";
    }

    // If arguments are passed both on the command line and in DT,
    // properties set in DT always have priority over the command-line ones.
    // 读取设备树 /proc/device-tree/firmware/android/ 中的 name 和 compatible 节点内容，添加 ro.boot. 前缀后加入到 property 属性系统中
    ProcessKernelDt(); 
    // 读取 /pro/cmdline，将 androidboot. 开头的变量，添加 ro.boot. 前缀后加入到 property 属性系统中
    ProcessKernelCmdline();

    // Propagate the kernel variables to internal variables
    // used by init as well as the current required properties.
    ExportKernelBootProps(); // 处理一些特定的属性值，如果没有赋值，则将其赋值为 nuknown 或者 0

    // 初始化系统已有属性值
    PropertyLoadBootDefaults();
}
```



**CreateSerializedPropertyInfo**

```C++
void CreateSerializedPropertyInfo() {
    auto property_infos = std::vector<PropertyInfoEntry>();
    if (access("/system/etc/selinux/plat_property_contexts", R_OK) != -1) {
        if (!LoadPropertyInfoFromFile("/system/etc/selinux/plat_property_contexts",
                                      &property_infos)) {
            return;
        }
        // Don't check for failure here, so we always have a sane list of properties.
        // E.g. In case of recovery, the vendor partition will not have mounted and we
        // still need the system / platform properties to function.
        if (access("/system_ext/etc/selinux/system_ext_property_contexts", R_OK) != -1) {
            LoadPropertyInfoFromFile("/system_ext/etc/selinux/system_ext_property_contexts",
                                     &property_infos);
        }
        if (!LoadPropertyInfoFromFile("/vendor/etc/selinux/vendor_property_contexts",
                                      &property_infos)) {
            // Fallback to nonplat_* if vendor_* doesn't exist.
            LoadPropertyInfoFromFile("/vendor/etc/selinux/nonplat_property_contexts",
                                     &property_infos);
        }
        if (access("/product/etc/selinux/product_property_contexts", R_OK) != -1) {
            LoadPropertyInfoFromFile("/product/etc/selinux/product_property_contexts",
                                     &property_infos);
        }
        if (access("/odm/etc/selinux/odm_property_contexts", R_OK) != -1) {
            LoadPropertyInfoFromFile("/odm/etc/selinux/odm_property_contexts", &property_infos);
        }
    } else {
        if (!LoadPropertyInfoFromFile("/plat_property_contexts", &property_infos)) {
            return;
        }
        LoadPropertyInfoFromFile("/system_ext_property_contexts", &property_infos);
        if (!LoadPropertyInfoFromFile("/vendor_property_contexts", &property_infos)) {
            // Fallback to nonplat_* if vendor_* doesn't exist.
            LoadPropertyInfoFromFile("/nonplat_property_contexts", &property_infos);
        }
        LoadPropertyInfoFromFile("/product_property_contexts", &property_infos);
        LoadPropertyInfoFromFile("/odm_property_contexts", &property_infos);
    }

    ...
}
```

**CreateSerializedPropertyInfo**：作用是从 selinux 模块 prop 文件中（如 `/system/etc/selinux/plat_property_contexts`）读取 selinux 相关属性值，并将其存储到一个动态数组 property_infos 中，随后加载到共享内存中。

**PropertyLoadBootDefaults**

``` cpp
void PropertyLoadBootDefaults() {
    // TODO(b/117892318): merge prop.default and build.prop files into one
    // We read the properties and their values into a map, in order to always allow properties
    // loaded in the later property files to override the properties in loaded in the earlier
    // property files, regardless of if they are "ro." properties or not.
    std::map<std::string, std::string> properties;
    if (!load_properties_from_file("/system/etc/prop.default", nullptr, &properties)) {
        // Try recovery path
        if (!load_properties_from_file("/prop.default", nullptr, &properties)) {
            // Try legacy path
            load_properties_from_file("/default.prop", nullptr, &properties);
        }
    }
    load_properties_from_file("/system/build.prop", nullptr, &properties);
    load_properties_from_file("/system_ext/build.prop", nullptr, &properties);
    load_properties_from_file("/vendor/default.prop", nullptr, &properties);
    load_properties_from_file("/vendor/build.prop", nullptr, &properties);
    if (SelinuxGetVendorAndroidVersion() >= __ANDROID_API_Q__) {
        load_properties_from_file("/odm/etc/build.prop", nullptr, &properties);
    } else {
        load_properties_from_file("/odm/default.prop", nullptr, &properties);
        load_properties_from_file("/odm/build.prop", nullptr, &properties);
    }
    load_properties_from_file("/product/build.prop", nullptr, &properties);
    load_properties_from_file("/factory/factory.prop", "ro.*", &properties);
    ...
    for (const auto& [name, value] : properties) {
        std::string error;
        if (PropertySet(name, value, &error) != PROP_SUCCESS) {
            LOG(ERROR) << "Could not set '" << name << "' to '" << value
                       << "' while loading .prop files" << error;
        }
    }

    property_initialize_ro_product_props(); // 初始化 "ro.product." 为前缀的属性
    property_derive_build_fingerprint(); // 初始化一些编译相关的属性
}
```

**PropertyLoadBootDefaults**：加载系统已有属性值（*.prop 文件），并将其存储到 properties 中，再使用 PropertySet 方法添加到属性系统中。

##### 2.4.2 StartPropertyService

[system/core/init/property_service.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/property_service.cpp)

**StartPropertyService**

``` c++
void StartPropertyService(int* epoll_socket) {
    // 设置属性版本号
    InitPropertySet("ro.property_service.version", "2");

    int sockets[2]; // 接收代表两个套接口的数组，每个文件描述法代表一个套接口
    /* int socketpair(int domain, int type, int protocol, int sv[2]);
     * domin - 表示协议族，只能为 AF_LOCAL 或者 AF_UNIX
     * type - 表示协议
     * protocol - 表示类型，只能为0
     * sv[2] - 接收代表两个套接口的整数数组，每一个文件描述符代表一个套接口，并且与另一个并没有区别
     */
    if (socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sockets) != 0) {
        PLOG(FATAL) << "Failed to socketpair() between property_service and init";
    }
    *epoll_socket = from_init_socket = sockets[0];
    init_socket = sockets[1];
    StartSendingMessages();

    // 创建 socket，返回 socket id
    if (auto result = CreateSocket(PROP_SERVICE_NAME, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK,
                                   false, 0666, 0, 0, {});
        result.ok()) {
        property_set_fd = *result;
    } else {
        LOG(FATAL) << "start_property_service socket creation failed: " << result.error();
    }

    // 监听 socket 文件描述符 property_set_fd，设置最大并发数为 8
    listen(property_set_fd, 8);

    auto new_thread = std::thread{PropertyServiceThread};
    property_service_thread.swap(new_thread);
}
```

socketpair 建立一对连接的套接字，每一端都可进行读写，监听 property_set_fd 描述符

**PropertyServiceThread**

``` cpp
static void PropertyServiceThread() {
    Epoll epoll;
    if (auto result = epoll.Open(); !result.ok()) {
        LOG(FATAL) << result.error();
    }

    // 把 socket 文件描述符 property_set_fd 注册到 epoll，用 epoll 监听描述符，收到消息时通过 handle_property_set_fd 处理
    if (auto result = epoll.RegisterHandler(property_set_fd, handle_property_set_fd);
        !result.ok()) {
        LOG(FATAL) << result.error();
    }

    // 把 socket 文件描述符 init_socket 注册到 epoll，收到消息时通过 HandleInitSocket 处理
    if (auto result = epoll.RegisterHandler(init_socket, HandleInitSocket); !result.ok()) {
        LOG(FATAL) << result.error();
    }

    while (true) {
        auto pending_functions = epoll.Wait(std::nullopt);
        if (!pending_functions.ok()) {
            LOG(ERROR) << pending_functions.error();
        } else {
            for (const auto& function : *pending_functions) {
                (*function)();
            }
        }
    }
}
```

把文件描述符 prop_set_fd 添加到 epoll，用 epoll 监听描述符，收到消息后通过 handle_property_set_fd 来处理，把件描述符 init_socket 添加到 epoll，收到消息时通过 HandleInitSocket 处理。

epoll 是 Linux 内核的可扩展 I/O 事件通知机制，也就是他能高效的监听文件描述符，提高 CPU 的利用率。

**handle_property_set_fd**

``` cpp
static void handle_property_set_fd() {
    static constexpr uint32_t kDefaultSocketTimeout = 2000; /* ms */

    // 利用 property_set_fd 文件描述符接收 socket 传递的消息
    int s = accept4(property_set_fd, nullptr, nullptr, SOCK_CLOEXEC);
    if (s == -1) {
        return;
    }

    ucred cr;
    socklen_t cr_size = sizeof(cr);
    if (getsockopt(s, SOL_SOCKET, SO_PEERCRED, &cr, &cr_size) < 0) {
        close(s);
        PLOG(ERROR) << "sys_prop: unable to get SO_PEERCRED";
        return;
    }

    SocketConnection socket(s, cr); // 利用 proerty_set_fd 重构一个 socket 来读取发送来的消息
    uint32_t timeout_ms = kDefaultSocketTimeout;

    uint32_t cmd = 0;
    // 读取发来的消息
    if (!socket.RecvUint32(&cmd, &timeout_ms)) {
        PLOG(ERROR) << "sys_prop: error while reading command from the socket";
        socket.SendUint32(PROP_ERROR_READ_CMD);
        return;
    }

    // 处理不同的消息
    switch (cmd) {
    case PROP_MSG_SETPROP: {
        char prop_name[PROP_NAME_MAX];
        char prop_value[PROP_VALUE_MAX];

        if (!socket.RecvChars(prop_name, PROP_NAME_MAX, &timeout_ms) ||
            !socket.RecvChars(prop_value, PROP_VALUE_MAX, &timeout_ms)) {
          PLOG(ERROR) << "sys_prop(PROP_MSG_SETPROP): error while reading name/value from the socket";
          return;
        }
        ...
        std::string source_context;
        ...

        const auto& cr = socket.cred();
        std::string error;
        uint32_t result =
                HandlePropertySet(prop_name, prop_value, source_context, cr, nullptr, &error);
        ...

        break;
      }

    case PROP_MSG_SETPROP2: {
        std::string name;
        std::string value;
        if (!socket.RecvString(&name, &timeout_ms) ||
            !socket.RecvString(&value, &timeout_ms)) {
          PLOG(ERROR) << "sys_prop(PROP_MSG_SETPROP2): error while reading name/value from the socket";
          socket.SendUint32(PROP_ERROR_READ_DATA);
          return;
        }

        std::string source_context;
        ...

        const auto& cr = socket.cred();
        std::string error;
        uint32_t result = HandlePropertySet(name, value, source_context, cr, &socket, &error);
        ...
        break;
      }

    ...
}
```

主要工作就是 RecvChars 和 RecvString 读取消息，然后通过 HandlePropertySet 函数处理。

**HandlePropertySet**

``` cpp
// This returns one of the enum of PROP_SUCCESS or PROP_ERROR*.
uint32_t HandlePropertySet(const std::string& name, const std::string& value,
                           const std::string& source_context, const ucred& cr,
                           SocketConnection* socket, std::string* error) {
    // 检查是否符合 property 权限
    if (auto ret = CheckPermissions(name, value, source_context, cr, error); ret != PROP_SUCCESS) {
        return ret;
    }

    // 处理 "ctl." 开头的属性
    if (StartsWith(name, "ctl.")) {
        return SendControlMessage(name.c_str() + 4, value, cr.pid, socket, error);
    }

    // 处理 "sys.powerctl" 开头的属性
    // sys.powerctl is a special property that is used to make the device reboot.  We want to log
    // any process that sets this property to be able to accurately blame the cause of a shutdown.
    if (name == "sys.powerctl") {
        std::string cmdline_path = StringPrintf("proc/%d/cmdline", cr.pid);
        std::string process_cmdline;
        std::string process_log_string;
        if (ReadFileToString(cmdline_path, &process_cmdline)) {
            // Since cmdline is null deliminated, .c_str() conveniently gives us just the process
            // path.
            process_log_string = StringPrintf(" (%s)", process_cmdline.c_str());
        }
        LOG(INFO) << "Received sys.powerctl='" << value << "' from pid: " << cr.pid
                  << process_log_string;
        if (value == "reboot,userspace" && !is_userspace_reboot_supported().value_or(false)) {
            *error = "Userspace reboot is not supported by this device";
            return PROP_ERROR_INVALID_VALUE;
        }
    }

    ...
    // 其他属性处理
    return PropertySet(name, value, error);
}
```

`ctl.` 开头的属性和 `sys.powerctl` 属性单独处理，其他属性通过 PropertySet 函数处理，原属性表中有就更新，没有就新加，再通知 init 有属性发生改变。

**HandleInitSocket**

``` cpp
static void HandleInitSocket() {
    auto message = ReadMessage(init_socket);
    if (!message.ok()) {
        LOG(ERROR) << "Could not read message from init_dedicated_recv_socket: " << message.error();
        return;
    }

    auto init_message = InitMessage{};
    if (!init_message.ParseFromString(*message)) {
        LOG(ERROR) << "Could not parse message from init";
        return;
    }

    switch (init_message.msg_case()) {
        case InitMessage::kLoadPersistentProperties: {
            load_override_properties();
            // Read persistent properties after all default values have been loaded.
            auto persistent_properties = LoadPersistentProperties();
            for (const auto& persistent_property_record : persistent_properties.properties()) {
                InitPropertySet(persistent_property_record.name(),
                                persistent_property_record.value());
            }
            InitPropertySet("ro.persistent_properties.ready", "true");
            persistent_properties_loaded = true;
            break;
        }
        default:
            LOG(ERROR) << "Unknown message type from init: " << init_message.msg_case();
    }
}
```

HandleInitSocket 处理 persistent 属性。

##### 2.4.3 LoadBootScripts

经过第一阶段和第二阶段前半部分工作，init 已经建立了属性系统和 SELinux 系统，接下来需要解析 init.rc，init.rc 是 init 进程启动的配置脚本，这个脚本是用一种叫 [Android Init Language](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/README.md)（Android 初始化语言）的语言写的。

[system/core/init/init.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/init.cpp)

**LoadBootScripts**

``` cpp
static void LoadBootScripts(ActionManager& action_manager, ServiceList& service_list) {
    // 创建 parser 并将其放入 map 中
    Parser parser = CreateParser(action_manager, service_list);

    std::string bootscript = GetProperty("ro.boot.init_rc", "");
    if (bootscript.empty()) {
        // 如果 ro.boot.init_rc 属性没有定义，则解析 /system/etc/init/hw/init.rc 和
        // system, system_ext, product, odm, vender/etc/init 目录下的 .rc 文件
        parser.ParseConfig("/system/etc/init/hw/init.rc");
        if (!parser.ParseConfig("/system/etc/init")) {
            late_import_paths.emplace_back("/system/etc/init");
        }
        // late_import is available only in Q and earlier release. As we don't
        // have system_ext in those versions, skip late_import for system_ext.
        parser.ParseConfig("/system_ext/etc/init");
        if (!parser.ParseConfig("/product/etc/init")) {
            late_import_paths.emplace_back("/product/etc/init");
        }
        if (!parser.ParseConfig("/odm/etc/init")) {
            late_import_paths.emplace_back("/odm/etc/init");
        }
        if (!parser.ParseConfig("/vendor/etc/init")) {
            late_import_paths.emplace_back("/vendor/etc/init");
        }
    } else {
        parser.ParseConfig(bootscript);
    }
}
```

LoadBootScrepts 工作是创建 parser，然后根据是否设定属性 ro.boot.init_rc 来解析不同路径下的 init.rc

``` cpp
Parser CreateParser(ActionManager& action_manager, ServiceList& service_list) {
    Parser parser;

    parser.AddSectionParser("service", std::make_unique<ServiceParser>(
                                               &service_list, GetSubcontext(), std::nullopt));
    parser.AddSectionParser("on", std::make_unique<ActionParser>(&action_manager, GetSubcontext()));
    parser.AddSectionParser("import", std::make_unique<ImportParser>(&parser));

    return parser;
}
```

std::make_unique 相当于 new，返回一个 std::unique_ptr 智能指针，可以自动管理内存，持有对象的独有权，两个 unique_ptr 不能指向一个对象，不能进行复制操作只能进行移动操作。

[system/core/init/parser.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/parser.cpp)

``` cpp
void Parser::AddSectionParser(const std::string& name, std::unique_ptr<SectionParser> parser) {
    section_parsers_[name] = std::move(parser);
}
```

section_parsers_ 是一个map，在 [system/core/init/parser.h](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/parser.h) 头文件中定义：

``` cpp
std::map<std::string, std::unique_ptr<SectionParser>> section_parsers_;
```

[system/core/init/parser.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/parser.cpp)

**ParseConfig**

``` cpp
bool Parser::ParseConfig(const std::string& path) {
    if (is_dir(path.c_str())) {
        return ParseConfigDir(path);
    }
    return ParseConfigFile(path);
}
```

根据传入的 path 类型是目录还是文件，分布调用 ParseConfigDir 和 ParseConfigFile

**ParseConfigDir**，**ParseConfigFile**

``` cpp
bool Parser::ParseConfigFile(const std::string& path) {
    LOG(INFO) << "Parsing file " << path << "...";
    android::base::Timer t;
    auto config_contents = ReadFile(path); // 将数据读取到 config_contents
    if (!config_contents.ok()) {
        LOG(INFO) << "Unable to read config file '" << path << "': " << config_contents.error();
        return false;
    }

    ParseData(path, &config_contents.value()); // 解析数据

    LOG(VERBOSE) << "(Parsing " << path << " took " << t << ".)";
    return true;
}

bool Parser::ParseConfigDir(const std::string& path) {
    LOG(INFO) << "Parsing directory " << path << "...";
    std::unique_ptr<DIR, decltype(&closedir)> config_dir(opendir(path.c_str()), closedir);
    ...
    dirent* current_file;
    std::vector<std::string> files;
    ...
    for (const auto& file : files) {
        if (!ParseConfigFile(file)) {
            LOG(ERROR) << "could not import file '" << file << "'";
        }
    }
    return true;
}
```

若是目录，则遍历该目录下的所有文件，再对其调用 ParseConfigFile，ParseConfigFile 读取文件数据后，调用 ParseData

**ParseData**

``` cpp
void Parser::ParseData(const std::string& filename, std::string* data) {
    data->push_back('\n');  // TODO: fix tokenizer
    data->push_back('\0');

    // parse_state 是 system/core/init/tokenizer.h 中定义的结构体
    parse_state state;
    state.line = 0;
    state.ptr = data->data();
    state.nexttoken = 0;

    // SectionParser 是一个可以在 init 中解析给定 “section” 的接口，比如 ActionParser 
    SectionParser* section_parser = nullptr;
    int section_start_line = -1;
    std::vector<std::string> args;

    // If we encounter a bad section start, there is no valid parser object to parse the subsequent
    // sections, so we must suppress errors until the next valid section is found.
    bool bad_section_found = false;
    ...
    for (;;) {
        switch (next_token(&state)) {
            case T_EOF: // EOF: End Of File，即解析完成到末端了，
                end_section();

                for (const auto& [section_name, section_parser] : section_parsers_) {
                    section_parser->EndFile();
                }

                return;
            case T_NEWLINE: {
                state.line++;
                if (args.empty()) break;
                // If we have a line matching a prefix we recognize, call its callback and unset any
                // current section parsers.  This is meant for /sys/ and /dev/ line entries for
                // uevent.
                auto line_callback = std::find_if(
                    line_callbacks_.begin(), line_callbacks_.end(),
                    [&args](const auto& c) { return android::base::StartsWith(args[0], c.first); });
                if (line_callback != line_callbacks_.end()) {
                    end_section();
                    ...
                } else if (section_parsers_.count(args[0])) {
                    end_section();
                    section_parser = section_parsers_[args[0]].get();
                    section_start_line = state.line;
                    if (auto result =
                                section_parser->ParseSection(std::move(args), filename, state.line);
                        !result.ok()) {
                        ...
                    }
                } else if (section_parser) {
                    if (auto result = section_parser->ParseLineSection(std::move(args), state.line);
                        !result.ok()) {
                        ...
                    }
                } else if (!bad_section_found) {
                    ...
                }
                args.clear();
                break;
            }
            case T_TEXT:
                args.emplace_back(state.text);
                break;
        }
    }
}
```

parser_state 是一个结构体，定义在 *system/core/init/tokenizer.h* 中，

``` cpp
// system/core/init/tokenizer.h
struct parse_state
{
    char *ptr;
    char *text;
    int line;
    int nexttoken;
};
```

ParseData 的作用就是调用 next_token(&state) 遍历字符，将一行拆分成若干个单词，读到单词，执行 T_TEXT 代码段，把单词压入 args 中；读到 '\n'，执行 T_NEWLINE 代码段，在 section_parsers_ 中判断是否包含单词 args[0]（即on, service, import），如果包含，则调用相应解析器（ActionParser, ServiceParser, ImportParser）的 ParseSection 函数；如果不包含，则调用 ParseLineSection 函数；读到 0，表示这个 Section 读取结束，执行 T_EOF 代码段，调用 EndSection 函数。

ActionParser, ServiceParser, ImportParser 都是 SectionParser 的子类，SectionParser 有四个虚函数：

``` cpp
class SectionParser {
  public:
    virtual ~SectionParser() {}
    virtual Result<void> ParseSection(std::vector<std::string>&& args, const std::string& filename,
                                      int line) = 0;
    virtual Result<void> ParseLineSection(std::vector<std::string>&&, int) { return {}; };
    virtual Result<void> EndSection() { return {}; };
    virtual void EndFile(){};
};
```

[system/core/init/action_parser.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/action_parser.cpp)

###### 2.4.3.1 ActionParser

**ParseSection**

``` cpp
Result<void> ActionParser::ParseSection(std::vector<std::string>&& args,
                                        const std::string& filename, int line) {
    ...
    std::string event_trigger;
    std::map<std::string, std::string> property_triggers;

    if (auto result =
                ParseTriggers(triggers, action_subcontext, &event_trigger, &property_triggers); // 解析 traggers
        !result.ok()) {
        return Error() << "ParseTriggers() failed: " << result.error();
    }

    auto action = std::make_unique<Action>(false, action_subcontext, filename, line, event_trigger,
                                           property_triggers);

    action_ = std::move(action);
    return {};
}
```

调用 ParseTraggers 函数

**ParseTriggers**

``` cpp
Result<void> ParseTriggers(const std::vector<std::string>& args, Subcontext* subcontext,
                           std::string* event_trigger,
                           std::map<std::string, std::string>* property_triggers) {
    const static std::string prop_str("property:");
    for (std::size_t i = 0; i < args.size(); ++i) {
        ...
        if (!args[i].compare(0, prop_str.length(), prop_str)) {
            if (auto result = ParsePropertyTrigger(args[i], subcontext, property_triggers);
                !result.ok()) {
                return result;
            }
        } else {
            if (!event_trigger->empty()) {
                return Error() << "multiple event triggers are not allowed";
            }
            if (auto result = ValidateEventTrigger(args[i]); !result.ok()) {
                return result;
            }
            
            *event_trigger = args[i];
    ...
}
```

对 property tragger 调用 ParsePropertyTrigger 函数，ParsePropertyTrigger 作用是把 property 以 "=" 分割为 name-value，存入 property_triggers map 中；对于 event tragger，赋值给 event_trigger 字符串。

所以 ParseSection 主要工作是创建一个 Action 对象，将当前 Section 的 tragger 条件记录到这个对象中，分布把 event tragger 和 property tragger 赋值给 event_trigger 字符串和 property_triggers map，最后把这个 action move 给 action_parser.h 中定义的 `action_` 这个 vector 中。

**ParseLineSection**

``` cpp
Result<void> ActionParser::ParseLineSection(std::vector<std::string>&& args, int line) {
    return action_ ? action_->AddCommand(std::move(args), line) : Result<void>{};
}
```

[system/core/init/action.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/action.cpp)

**AddCommand**

``` cpp
Result<void> Action::AddCommand(std::vector<std::string>&& args, int line) {
    if (!function_map_) {
        return Error() << "no function map available";
    }

    auto map_result = function_map_->Find(args);
    if (!map_result.ok()) {
        return Error() << map_result.error();
    }

    commands_.emplace_back(map_result->function, map_result->run_in_subcontext, std::move(args),
                           line);
    return {};
}
```

AddCommand 函数就是查找对应的执行函数，把信息存入 `commands_` 这个 vector（定义在 action.h 中），而调用 AddCommand 函数的是 `action_`（定义在 action_parser.h中），即把信息存入 `action_`  对象。

[system/core/init/action_parser.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/action_parser.cpp)

**EndSection**

``` cpp
Result<void> ActionParser::EndSection() {
    if (action_ && action_->NumCommands() > 0) {
        action_manager_->AddAction(std::move(action_));
    }

    return {};
}
```

AddAction 函数作用是把前两步构造的 `action_` 存入 `action_manager_`的 `action_` vector 数组容器中。

**总结**

- **ParseSection**：当一个 Section 第一次遇到时，调用此方法；创建一个 Action 对象，将当前 Section 的 tragger 条件记录到这个对象中，再把这个 action move 给 [system/core/init/action_parser.h](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/action_parser.h) 中定义的 `action_` 这个 vector 中；
- **ParseLineSection**：在遇到下一个 Section 之前，在每个后续行上都会调用此函数；查找对应的执行函数，把信息也存入`action_`中；
- **EndSection**：当一个新的 Section 被发现或者在文件末尾时调用；把前两步构造的 `action_` 存入 `action_manager_`的 `action_` vector 数组容器中；
- **EndFile**：在文件末尾调用；空实现；

###### 2.4.3.2 ServiceParser

ServiceParser 处理和 ActionParser 差不多，区别在于 Action 将执行函数存起来等待 Trigger 触发时执行，Service 找到执行函数后是马上执行，不再详细分析。

###### 2.4.3.3 ImportParser

ImportParser 工作内容是在 ParseSection 函数中利用 ExpandProps 处理参数，将结果存入 `imports_` 数组中。

##### 2.4.4 QueueBuiltinAction

[system/core/init/init.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/init.cpp)

``` cpp
int SecondStageMain(int argc, char** argv) {
    am.QueueBuiltinAction(SetupCgroupsAction, "SetupCgroups");
    am.QueueBuiltinAction(SetKptrRestrictAction, "SetKptrRestrict");
    am.QueueBuiltinAction(TestPerfEventSelinuxAction, "TestPerfEventSelinux");
```

用于添加 Action，第二个参数是触发条件，第一个参数是 Action 触发后的执行命令；

##### 2.4.5 QueueEventTrigger

 \- exec("selinux_setup") --> main.cpp.main() --> selinux.cpp.SetupSelinux() - exec("second_stage") --> main.cpp.main() --> init.cpp.SecondStageMain() - LoadBootScripts() --> 

``` cpp
int SecondStageMain(int argc, char** argv) {
    am.QueueEventTrigger("early-init");
```

构造了一个 EventTrigger 对象，放到队列中存起来；

##### 2.4.6 触发

准备好各种队列、数组的数据后，开始触发事件

``` cpp
int SecondStageMain(int argc, char** argv) {
    ...
    while (true) {
        // By default, sleep until something happens.
        // epoll 系统轮询等待消息处理
        auto epoll_timeout = std::optional<std::chrono::milliseconds>{}; // epoll 的阻塞时间

        auto shutdown_command = shutdown_state.CheckShutdown();
        if (shutdown_command) {
            HandlePowerctlMessage(*shutdown_command);
        }

        if (!(prop_waiter_state.MightBeWaiting() || Service::is_exec_service_running())) {
            am.ExecuteOneCommand(); // 执行一个 command
        }
        if (!IsShuttingDown()) {
            auto next_process_action_time = HandleProcessActions();

            // If there's a process that needs restarting, wake up in time for that.
            // 如果有需要重新启动的进程，epoll_timeout 设置为重启等待时间
            if (next_process_action_time) {
                epoll_timeout = std::chrono::ceil<std::chrono::milliseconds>(
                        *next_process_action_time - boot_clock::now());
                if (*epoll_timeout < 0ms) epoll_timeout = 0ms;
            }
        }

        if (!(prop_waiter_state.MightBeWaiting() || Service::is_exec_service_running())) {
            // If there's more work to do, wake up again immediately.
            if (am.HasMoreCommands()) epoll_timeout = 0ms;
        }

        auto pending_functions = epoll.Wait(epoll_timeout);
        if (!pending_functions.ok()) {
            LOG(ERROR) << pending_functions.error();
        } else if (!pending_functions->empty()) {
            // We always reap children before responding to the other pending functions. This is to
            // prevent a race where other daemons see that a service has exited and ask init to
            // start it again via ctl.start before init has reaped it.
            ReapAnyOutstandingChildren();
            for (const auto& function : *pending_functions) {
                (*function)();
            }
        }
        if (!IsShuttingDown()) {
            HandleControlMessages();
            SetUsbController();
        }
    }
```

**ExecuteOneCommand**

[system/core/init/action_manager.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r25/init/action_manager.cpp)

``` cpp
void ActionManager::ExecuteOneCommand() {
    {
        auto lock = std::lock_guard{event_queue_lock_};
        // Loop through the event queue until we have an action to execute
        while (current_executing_actions_.empty() && !event_queue_.empty()) {
            for (const auto& action : actions_) {
                // 遍历 actions_，event_queue 是 trigger 队列，满足当前 trigger 条件的 action 添加到 current_executing_actions_
                if (std::visit([&action](const auto& event) { return action->CheckEvent(event); },
                               event_queue_.front())) {
                    current_executing_actions_.emplace(action.get());
                }
            }
            event_queue_.pop(); // 从 trigger 列表中移除一个 trigger
        }
    }

    if (current_executing_actions_.empty()) {
        return;
    }

    // 从满足 trigger 的 actions 中取出一个 action
    auto action = current_executing_actions_.front();

    if (current_command_ == 0) {
        std::string trigger_name = action->BuildTriggersString();
        LOG(INFO) << "processing action (" << trigger_name << ") from (" << action->filename()
                  << ":" << action->line() << ")";
    }

    // 执行取出 action 的第 current_command_ 个 command
    action->ExecuteOneCommand(current_command_);

    // If this was the last command in the current action, then remove
    // the action from the executing list.
    // If this action was oneshot, then also remove it from actions_.
    ++current_command_; //  current_command_ 加 1
    // 加 1 后 current_command 等于 action 的 command 条数，即上面执行的 current_command 是此 action 中的最后一条 command
    if (current_command_ == action->NumCommands()) {
        current_executing_actions_.pop(); // 移除 current_executing_actions_ 中的 action
        current_command_ = 0;
        // 如果 action 只执行一次，则把此 action 从 actions_ 中移除
        if (action->oneshot()) {
            auto eraser = [&action](std::unique_ptr<Action>& a) { return a.get() == action; };
            actions_.erase(std::remove_if(actions_.begin(), actions_.end(), eraser),
                           actions_.end());
        }
    }
}
```

triggers 包含 `early-init`, `init`, `late-init`, 在 `late-init` 中又 trigger 了很多，包含 `early-boot`, `boot` 等，接下来要分析的 Zygote 是在 `on late-init` section 中；





