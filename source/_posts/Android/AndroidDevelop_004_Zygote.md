---
title: Android - Zygote 进程启动
date: 2021-08-01 21:02:19
tags:
categories: Android
copyright: true
password:
---

> Zygote 进程启动。

<!--more-->

## 1. 触发 Zygote 启动

### 1.1 触发 late-init

system/core/init.cpp

``` cpp
int SecondStageMain(int argc, char** argv) {
    ...
    // Don't mount filesystems or start core system services in charger mode.
    std::string bootmode = GetProperty("ro.bootmode", "");
    if (bootmode == "charger") {
        am.QueueEventTrigger("charger");
    } else {
        am.QueueEventTrigger("late-init");
    }
```

在 SecondsStageMain 中加入了 `late-init`的 trigger

system/core/rootdir/init.rc

``` cpp
# Mount filesystems and start core system services.
on late-init
    ...
    # Now we can start zygote for devices with file based encryption
    trigger zygote-start
```

### 1.2 触发 zygote-start

当 `late-init`触发时，会触发 `zygote-start`

``` cpp
# It is recommended to put unnecessary data/ initialization from post-fs-data
# to start-zygote in device's init.rc to unblock zygote start.
on zygote-start && property:ro.crypto.state=unencrypted
    # A/B update verifier that marks a successful boot.
    exec_start update_verifier_nonencrypted
    start statsd
    start netd
    start zygote
    start zygote_secondary

on zygote-start && property:ro.crypto.state=unsupported
    # A/B update verifier that marks a successful boot.
    exec_start update_verifier_nonencrypted
    start statsd
    start netd
    start zygote
    start zygote_secondary

on zygote-start && property:ro.crypto.state=encrypted && property:ro.crypto.type=file
    # A/B update verifier that marks a successful boot.
    exec_start update_verifier_nonencrypted
    start statsd
    start netd
    start zygote
    start zygote_secondary
```

### 1.3 执行 start zygote command

start zygote 就是启动 zygote 的 command，在 *system/core/init/action.cpp* 的 `AddCommand` 函数中指出要从 function_map_ 中 Find 对应 args 的执行函数

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

function_map_  在 [system/core/init/action.h]() 中定义，通过 set_function_map 函数赋值

``` cpp
    static void set_function_map(const BuiltinFunctionMap* function_map) {
        function_map_ = function_map;
    }
...
    static const BuiltinFunctionMap* function_map_;
...
```

set_function_map 函数在 init.cpp 中调用，传递的参数通过 GetBuiltinFunctionMap 获取

``` cpp
int SecondStageMain(int argc, char** argv) {
    ...
    const BuiltinFunctionMap& function_map = GetBuiltinFunctionMap();
    Action::set_function_map(&function_map);
```

GetBuiltinFunctionMap 函数在 *[system/core/init/builtins.cpp](http://aospxref.com/android-11.0.0_r21/xref/system/core/init/builtins.h)* 中定义，可知 start 对应的是 do_start 函数

``` cpp
// Builtin-function-map start
const BuiltinFunctionMap& GetBuiltinFunctionMap() {
    constexpr std::size_t kMax = std::numeric_limits<std::size_t>::max();
    // clang-format off
    static const BuiltinFunctionMap builtin_functions = {
        {"bootchart",               {1,     1,    {false,  do_bootchart}}},
        ...
        {"update_linker_config",    {0,     0,    {false,  do_update_linker_config}}},
        {"readahead",               {1,     2,    {true,   do_readahead}}},
        {"remount_userdata",        {0,     0,    {false,  do_remount_userdata}}},
        {"restart",                 {1,     1,    {false,  do_restart}}},
        {"restorecon",              {1,     kMax, {true,   do_restorecon}}},
        {"restorecon_recursive",    {1,     kMax, {true,   do_restorecon_recursive}}},
        {"rm",                      {1,     1,    {true,   do_rm}}},
        {"rmdir",                   {1,     1,    {true,   do_rmdir}}},
        {"setprop",                 {2,     2,    {true,   do_setprop}}},
        {"setrlimit",               {3,     3,    {false,  do_setrlimit}}},
        {"start",                   {1,     1,    {false,  do_start}}},
        {"stop",                    {1,     1,    {false,  do_stop}}},
        ...
        {"write",                   {2,     2,    {true,   do_write}}},
    };
    // clang-format on
    return builtin_functions;
}
```

### 1.4 执行 do_start

[system/core/init/builtins.cpp]()

``` cpp
static Result<void> do_start(const BuiltinArguments& args) {
    Service* svc = ServiceList::GetInstance().FindService(args[1]);
    if (!svc) return Error() << "service " << args[1] << " not found";
    if (auto result = svc->Start(); !result.ok()) {
        return ErrorIgnoreEnoent() << "Could not start service: " << result.error();
    }
    return {};
}
```

do_start 作用是通过 FindService 函数根据名字从 ServiceList 中找出对应的 service，然后调用 Start() 函数；

### 1.5 Service::Start() 创建 zygote 进程

platform/system/core/init/service.cpp

``` cpp
Result<void> Service::Start() {
    ...
    LOG(INFO) << "starting service '" << name_ << "'...";
    ...
    pid_t pid = -1;
    // 这个标记当 service 定义了namespace 时会赋值为 CLONE_NEWPID|CLONE_NEWNS
    if (namespaces_.flags) {
        // 以 clone 方式在新的 namespace 创建子进程
        pid = clone(nullptr, nullptr, namespaces_.flags | SIGCHLD, nullptr);
    } else {
        pid = fork(); // 以 fork 方式创建子进程
    }

    if (pid == 0) {// pid == 0 表示创建子进程成功
        ...
        // ExpandArgsAndExecv 会调用 execv 执行系统调用，即执行配置的二进制文件，把参数传进去
        if (!ExpandArgsAndExecv(args_, sigstop_)) {
            PLOG(ERROR) << "cannot execv('" << args_[0]
                        << "'). See the 'Debugging init' section of init's README.md for tips";
        }

        _exit(127);
    }

    if (pid < 0) { // 子进程创建失败
        pid_ = 0;
        return ErrnoError() << "Failed to fork";
    }
    ...
}
```

Start 函数主要就是 fork 出一个新进程，然后执行 service 对应的二进制文件，并将参数传递进去；

### 1.6 init.${ro.zygote}.rc

从 init.zygote64_32.rc 中看出 zygote 对应的二进制文件是 */system/bin/app_process64*

/[system](http://aospxref.com/android-11.0.0_r21/xref/system/)/[core](http://aospxref.com/android-11.0.0_r21/xref/system/core/)/[rootdir](http://aospxref.com/android-11.0.0_r21/xref/system/core/rootdir/)/[init.zygote64_32.rc]()

``` cpp
// 进程名称是 zygote，运行的二进制文件在 /system/bin/app_process64
// 启动参数是 -Xzygote /system/bin --zygote --start-system-server --socket-name=zygote
service zygote /system/bin/app_process64 -Xzygote /system/bin --zygote --start-system-server --socket-name=zygote
    // zygote 所属的 class 为 main，同类的 service 还有比如 storaged，installd
    class main
    // 进程优先级最高（-20）
    priority -20
    // 启动服务前，将用户切换为 root 用户
    user root
    // 启动服务前，将用户组切换为 root 用户组
    group root readproc reserved_disk
    // 以 TCP 形式创建一个名叫 /dev/socket/zygote 的 socket
    // socket 类型，分为 stream-tcp、dgram-udp、seqpacket
    // socket 权限为 660，后面是 user 和 group
    socket zygote stream 660 root system
    socket usap_pool_primary stream 660 root system
    // onrestart 指当进程重启时执行后面的命令
    onrestart exec_background - system system -- /system/bin/vdc volume abort_fuse
    onrestart write /sys/power/state on
    onrestart restart audioserver
    onrestart restart cameraserver
    onrestart restart media
    onrestart restart netd
    onrestart restart wificond
    // 等价于 writepid /dev/cpuctl/top-app/tasks，即将进程的 PID 写入 dev/cpuctl/top-app/tasks
    // task_profiles 在 Android 12 及更高版本使用
    task_profiles ProcessCapacityHigh MaxPerformance

service zygote_secondary /system/bin/app_process32 -Xzygote /system/bin --zygote --socket-name=zygote_secondary --enable-lazy-preload
    class main
    priority -20
    user root
    group root readproc reserved_disk
    socket zygote_secondary stream 660 root system
    socket usap_pool_secondary stream 660 root system
    onrestart restart zygote
    task_profiles ProcessCapacityHigh MaxPerformance
```

app_process64 源码位置在 frameworks/base/cmds/app_process/app_main.cpp

## 2. app_main

[frameworks/base/cmds/app_process/app_main.cpp]()

app_main.main() 是 zygote 进程中执行的第一个方法，主要做的事情就是参数解析，根据参数决定启动 zygote 模式还是 application 模式；

### 2.1 初始化 AndroidRuntime

创建 AppRuntime 对象，AppRuntime 继承自 AndroidRuntime，AndriodRuntime 是 android 运行时环境

``` cpp
class AppRuntime : public AndroidRuntime
{
public:
    AppRuntime(char* argBlockStart, const size_t argBlockLength)
        : AndroidRuntime(argBlockStart, argBlockLength)
        , mClass(NULL)
    {
    }
}
...
// /system/bin/app_process64 -Xzygote /system/bin --zygote --start-system-server --socket-name=zygote
int main(int argc, char* const argv[])
{
    ...
    AppRuntime runtime(argv[0], computeArgBlockSize(argc, argv)); // 创建 AndroidRuntime
```

argc：是 argument count 的缩写，保存运行时传递给 main 函数的参数个数；

argv：是 argument vector 的缩写，保存运行时传递 main 函数的参数，类型是一个字符指针数组，每个元素是一个字符指针，指向一个命令行参数；

argv[0]：指向程序运行时的全路径名，即 `/system/bin/app_process64` ；

### 2.2 设置 zygote 启动模式

有两种启动模式，zygote 模式和 application 模式；

``` cpp
...
    while (i < argc) {
        const char* arg = argv[i++];
        if (strcmp(arg, "--zygote") == 0) {
            zygote = true;
            niceName = ZYGOTE_NICE_NAME;
        } else if (strcmp(arg, "--start-system-server") == 0) {
            startSystemServer = true;
        } else if (strcmp(arg, "--application") == 0) {
            application = true;
        } else if (strncmp(arg, "--nice-name=", 12) == 0) {
            niceName.setTo(arg + 12);
        } else if (strncmp(arg, "--", 2) != 0) {
            className.setTo(arg);
            break;
        } else {
            --i;
            break;
        }
    }
...
```

 --zygote : 以 zygote 模式启动

--start-system-server : 启动 system_server

--application : 以应用程序模式启动

--nice-name : 进程的名字

在此处根据传递进来的参数 `zygote == true` 设置 zygote 启动模式，并配置 `startSystemServer = true`

### 2.3 配置 runtime.start() 函数的 args

``` cpp
Vector<String8> args;
    if (!className.isEmpty()) {
        // We're not in zygote mode, the only argument we need to pass
        // to RuntimeInit is the application argument.
        //
        // The Remainder of args get passed to startup class main(). Make
        // copies of them before we overwrite them with the process name.
        args.add(application ? String8("application") : String8("tool"));
        ...
    } else {
        ...
        if (startSystemServer) {
            args.add(String8("start-system-server"));
        }
        ...
        String8 abiFlag("--abi-list=");
        abiFlag.append(prop);
        args.add(abiFlag);

        // In zygote mode, pass all remaining arguments to the zygote
        // main() method.
        for (; i < argc; ++i) {
            args.add(String8(argv[i]));
        }
    }
```

args 是后面调用的 runtime.start() 函数的参数；

### 2.4 调用 runtime.start 启动 Android 运行时

在 main 函数的最后，调用 `runtime.start()` 函数启动 android 运行时环境

``` cpp
...
    if (zygote) {
        runtime.start("com.android.internal.os.ZygoteInit", args, zygote);
    } else if (className) {
        runtime.start("com.android.internal.os.RuntimeInit", args, zygote);
    } else {
        fprintf(stderr, "Error: no class name or --zygote supplied.\n");
        app_usage();
        LOG_ALWAYS_FATAL("app_process: no class name or --zygote supplied.");
    }
```

## 3. 启动运行时-AndroidRuntime.start()

[frameworks/base/core/jni/AndroidRuntime.cpp]()

``` cpp
void AndroidRuntime::start(const char* className, const Vector<String8>& options, bool zygote)
{
    ...
    /* start the virtual machine */
    JniInvocation jni_invocation;
    jni_invocation.Init(NULL); // 初始化 JNI,加载 libart.so
    JNIEnv* env;
    if (startVm(&mJavaVM, &env, zygote, primary_zygote) != 0) { // 创建启动虚拟机
        return;
    }
    onVmCreated(env); // 虚拟机创建完成，函数对于 zygote 启动来说是空实现

    /*
     * Register android functions.
     */
    if (startReg(env) < 0) { // 注册 JNI
        ALOGE("Unable to register all android natives\n");
        return;
    }
    /*
     * We want to call main() with a String array with arguments in it.
     * At present we have two arguments, the class name and an option string.
     * Create an array to hold them.
     */
    jclass stringClass;
    jobjectArray strArray;
    jstring classNameStr;

    stringClass = env->FindClass("java/lang/String");
    assert(stringClass != NULL);
    strArray = env->NewObjectArray(options.size() + 1, stringClass, NULL);
    assert(strArray != NULL);
    classNameStr = env->NewStringUTF(className);
    assert(classNameStr != NULL);
    env->SetObjectArrayElement(strArray, 0, classNameStr);

    for (size_t i = 0; i < options.size(); ++i) {
        jstring optionsStr = env->NewStringUTF(options.itemAt(i).string());
        assert(optionsStr != NULL);
        env->SetObjectArrayElement(strArray, i + 1, optionsStr);
    }
    /*
     * Start VM.  This thread becomes the main thread of the VM, and will
     * not return until the VM exits.
     */
    // 将传递过来的 className 参数（com.android.internal.os.ZygoteInit）转换为 com/android/internal/os/ZygoteInit
    char* slashClassName = toSlashClassName(className != NULL ? className : "");
    jclass startClass = env->FindClass(slashClassName);
    if (startClass == NULL) {
        ALOGE("JavaVM unable to locate class '%s'\n", slashClassName);
        /* keep going */
    } else {
        jmethodID startMeth = env->GetStaticMethodID(startClass, "main",
            "([Ljava/lang/String;)V"); // 找到 startClass 的 main 方法
        if (startMeth == NULL) {
            ALOGE("JavaVM unable to find main() in '%s'\n", className);
            /* keep going */
        } else {
            env->CallStaticVoidMethod(startClass, startMeth, strArray); // 跳到 JAVA 世界
...
}
```

runtime.start 主要做了三件事：

- startVm()：加载 libart.so，创建启动虚拟机，此处不再赘述
- startReg：注册 JNI 方法
- CallStaticVoidMethod：使用 JNI 调用 ZygoteInit 的 main 函数，进入 java 世界

本文讲述 zygote 启动，startVm 和 startReg 就不再深入；

### 3.1  startVm()

加载 libart.so，创建启动虚拟机

### 3.2 startReg()

注册 JNI 方法

### 3.3 CallStaticVoidMethod 调用 ZygoteInit.main()

``` cpp
	char* slashClassName = toSlashClassName(className != NULL ? className : "");
    jclass startClass = env->FindClass(slashClassName); // 找到 ZygoteInit 类
    if (startClass == NULL) {
        ALOGE("JavaVM unable to locate class '%s'\n", slashClassName);
        /* keep going */
    } else {
        // 找到 ZygoteInit 类后继续找其中 main 方法对应的 MethodID
        jmethodID startMeth = env->GetStaticMethodID(startClass, "main",
            "([Ljava/lang/String;)V");
        if (startMeth == NULL) {
            ALOGE("JavaVM unable to find main() in '%s'\n", className);
            /* keep going */
        } else {
            env->CallStaticVoidMethod(startClass, startMeth, strArray);
```

- GetStaticMethodID：找到 startClass 的 main 方法，startClass 即前面 runtime.start 时传入的参数 `com.android.internal.os.ZygoteInit`，即找到 ZygoteInit 的 main 方法；
- CallStaticVoidMethod 调用 ZygoteInit 的 main 方法；

此处是从 native 进入到 java 的入口，所以需要使用 JNI

## 4. ZygoteInit

[frameworks/base/core/java/com/android/internal/os/ZygoteInit.java]()

``` java
    public static void main(String argv[]) {
        ZygoteServer zygoteServer = null;

        ...
            for (int i = 1; i < argv.length; i++) {
                if ("start-system-server".equals(argv[i])) {
                    startSystemServer = true;
            ...

            // In some configurations, we avoid preloading resources and classes eagerly.
            // In such cases, we will preload things prior to our first fork.
            if (!enableLazyPreload) {
                bootTimingsTraceLog.traceBegin("ZygotePreload");
                EventLog.writeEvent(LOG_BOOT_PROGRESS_PRELOAD_START,
                        SystemClock.uptimeMillis());
                preload(bootTimingsTraceLog); // 1.预加载资源
                EventLog.writeEvent(LOG_BOOT_PROGRESS_PRELOAD_END,
                        SystemClock.uptimeMillis());
                bootTimingsTraceLog.traceEnd(); // ZygotePreload
            }

            ...

            zygoteServer = new ZygoteServer(isPrimaryZygote); // 2. 创建 zygote 的 socket 服务

            if (startSystemServer) {
                // 3.fork 创建 system_server 进程
                Runnable r = forkSystemServer(abiList, zygoteSocketName, zygoteServer);
                ...
            }

            Log.i(TAG, "Accepting command socket connections");

            // The select loop returns early in the child process after a fork and
            // loops forever in the zygote.
            caller = zygoteServer.runSelectLoop(abiList); // 4.zygote 进入无限循环
        } catch (Throwable ex) {
            ...
    }
```

ZygoteInit 的 main 函数主要做了四件事：`preload()`, `new ZygoteServer()`, `forkSystemServer()`, `runSelectLoop()`。

### 4.1 preload()

``` java
    static void preload(TimingsTraceLog bootTimingsTraceLog) {
        ...
        beginPreload();
        ...
        preloadClasses(); // 预加载位于 /system/etc/preloaded-classes 文件中的类
        ...
        cacheNonBootClasspathClassLoaders();
        ...
        preloadResources(); // 预加载资源，包含 drawable 和 color 资源
        ...
        nativePreloadAppProcessHALs();
        ...
        maybePreloadGraphicsDriver();
        ...
        preloadSharedLibraries();
        preloadTextResources();
        ...
        endPreload();
        ...

        sPreloadComplete = true;
    }
```

preload() 工作是预加载一部分 framework 资源和常用的 java 类，以便后期 fork 应用进程时可以直接 copy 过去，加快了应用的启动速度；

### 4.2 new ZygoteServer()

创建 zygote 的 socket 服务用于在 runSelectLoop() 中与 AMS 通信；

为什么不用 binder 通讯呢，一是因为此时 binder 还没有初始化，二是因为 binder 是多线程通讯，fork 是写时拷贝（内容发生改变时才 copy），如果用 binder 通信 fork 容易发生死锁；

### 4.3 forkSystemServer()

fork 创建 system_server 进程，下一篇中详解；

### 4.4 runSelectLoop()

zygote 进入无限循环，等待 AMS 发来信息创建进程；

## 5. 总结

解析 init.${ro.zygote}.rc 中的参数，zygote 通过 app_process 启动，进入 app_main.cpp 的 main() 方法中：

- 初始化 AndroidRuntime
- 设置 zygote 启动模式
- 调用 runtime.start() 启动 Android 运行时
  - 创建虚拟机
  - 注册 JNI 方法
  - 使用 JNI 调用 ZygoteInit 的 main() 函数，进入 java 世界
    - preload 预加载framework 资源和常用 java 类
    - 创建 zygote 的 socket 服务用于在 runSelectLoop() 中与 AMS 通信
    - fork 创建 system_server 进程
    - zygote 进入无限循环，等待 AMS 发来信息创建进程

