---
title: Android - system_server 进程启动
date: 2021-11-01 19:14:33
tags:
categories: Android
copyright: true
password:
---

> SystemServer 进程启动流程。

<!--more-->

# 1. zygote forkSystemServer

## 1.1 ZygoteInit.main()

[frameworks/base/core/java/com/android/internal/os/ZygoteInit.java]()

``` java
// ZygoteInit.java
public static void main(String argv[]) {
        ZygoteServer zygoteServer = null;
...
        try {
...
            if (startSystemServer) {
                Runnable r = forkSystemServer(abiList, zygoteSocketName, zygoteServer);

                // {@code r == null} in the parent (zygote) process, and {@code r != null} in the
                // child (system_server) process.
                if (r != null) {
                    r.run();
                    return;
                }
            }
```

forkSystemServer 在 fork system_server 进程后，如果是父进程（Zygote 进程），则返回 null，如果是 system_server 进程，则返回一个 Runnable

## 1.2 forkSystemServer()

[frameworks/base/core/java/com/android/internal/os/ZygoteInit.java]()

``` java
// ZygoteInit.java
	private static Runnable forkSystemServer(String abiList, String socketName,
            ZygoteServer zygoteServer) {
        ...
        /* Hardcoded command line to start the system server */
        String args[] = {
                "--setuid=1000",
                "--setgid=1000",
                "--setgroups=1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1018,1021,1023,"
                        + "1024,1032,1065,3001,3002,3003,3006,3007,3009,3010,3011",
                "--capabilities=" + capabilities + "," + capabilities,
                "--nice-name=system_server",
                "--runtime-args",
                "--target-sdk-version=" + VMRuntime.SDK_VERSION_CUR_DEVELOPMENT,
                "com.android.server.SystemServer",
        };
        ZygoteArguments parsedArgs = null;

        int pid;

        try {
            parsedArgs = new ZygoteArguments(args);
            ...
            /* Request to fork the system server process */
            pid = Zygote.forkSystemServer(
                    parsedArgs.mUid, parsedArgs.mGid,
                    parsedArgs.mGids,
                    parsedArgs.mRuntimeFlags,
                    null,
                    parsedArgs.mPermittedCapabilities,
                    parsedArgs.mEffectiveCapabilities);
        } catch (IllegalArgumentException ex) {
            throw new RuntimeException(ex);
        }

        /* For child process */
        if (pid == 0) {
            if (hasSecondZygote(abiList)) {
                waitForSecondaryZygote(socketName);
            }

            zygoteServer.closeServerSocket();
            return handleSystemServerProcess(parsedArgs); // 子进程中，返回一个 runnable
        }

        return null; // pid 不等于 0，说明是父进程，返回 null
```

- 通过 `ZygoteArguments` 对 args[] 数组参数进行解析；
- 通过 `Zygote.forkSystemServer()` 来 fork `system_server`进程，在 `system_server` 进程（返回的 pid == 0）中调用 `handleSystemServerProcess` 得到一个 runnable；

## 1.3 handleSystemServerProcess()

[frameworks/base/core/java/com/android/internal/os/ZygoteInit.java]()

``` java
// ZygoteInit.java
	private static Runnable handleSystemServerProcess(ZygoteArguments parsedArgs) {
        ...
            // 把剩余参数传递给 SystemServer
            return ZygoteInit.zygoteInit(parsedArgs.mTargetSdkVersion,
                    parsedArgs.mDisabledCompatChanges,
                    parsedArgs.mRemainingArgs, cl);
        }
```

把第二步 `ZygoteArguments` 解析后的 `mRemainingArgs` 再传到 `ZygoteInit.zygoteInit()` 函数中；

## 1.4 zygoteInit()

[frameworks/base/core/java/com/android/internal/os/ZygoteInit.java]()

``` java
// ZygoteInit.java
	public static final Runnable zygoteInit(int targetSdkVersion, long[] disabledCompatChanges,
            String[] argv, ClassLoader classLoader) {
        ...
        RuntimeInit.commonInit(); // 初始化运行环境
        ZygoteInit.nativeZygoteInit(); // 启动 Binder，方法在 AndroidRuntime.cpp 中注册
        return RuntimeInit.applicationInit(targetSdkVersion, disabledCompatChanges, argv,
                classLoader);
    }
```

因为 app_main() 中 runtime.start() 的 runtime 是 AndroidRuntime 的子类 AppRuntime，runtime.start() -> ZygoteInit.main() -> forkSystemserver() -> 子进程 handleSystemServerProcess() -> zygoteInit()，com_android_internal_os_ZygoteInit_nativeZygoteInit 调用 AndroidRuntime.h.onZygoteInit()，AppRuntime 覆盖了父类 AndroidRuntime.onZygoteInit()，所以最后执行 AppRuntime.onZygoteInit()

``` cpp
// AndroidRuntime.cpp
static void com_android_internal_os_ZygoteInit_nativeZygoteInit(JNIEnv* env, jobject clazz)
{
    gCurRuntime->onZygoteInit();
}
// AndroidRuntime.h
    virtual void onZygoteInit() { }
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

所以最终 system_server 打开驱动，进行 mmap() 映射，启动 binder 线程池。

## 1.5 applicationInit()

[frameworks/base/core/java/com/android/internal/os/RuntimeInit.java]()

``` cpp
    protected static Runnable applicationInit(int targetSdkVersion, long[] disabledCompatChanges,
            String[] argv, ClassLoader classLoader) {
        // If the application calls System.exit(), terminate the process
        // immediately without running any shutdown hooks.  It is not possible to
        // shutdown an Android application gracefully.  Among other things, the
        // Android runtime shutdown hooks close the Binder driver, which can cause
        // leftover running threads to crash before the process actually exits.
        nativeSetExitWithoutCleanup(true);

        VMRuntime.getRuntime().setTargetSdkVersion(targetSdkVersion);
        VMRuntime.getRuntime().setDisabledCompatChanges(disabledCompatChanges);

        final Arguments args = new Arguments(argv);

        // The end of of the RuntimeInit event (see #zygoteInit).
        Trace.traceEnd(Trace.TRACE_TAG_ACTIVITY_MANAGER);

        // Remaining arguments are passed to the start class's static main
        return findStaticMain(args.startClass, args.startArgs, classLoader);
    }
```

- 通过 `Arguments()` 对第三步传入的 `parsedArgs.mRemainingArgs` 解析，得到 args.startClass，即`com.android.server.SystemServer` ；
- 调用 `findStaticMain()` 函数；

## 1.6 findStaticMain()

``` java
    protected static Runnable findStaticMain(String className, String[] argv,
            ClassLoader classLoader) {
        Class<?> cl;

        try {
            cl = Class.forName(className, true, classLoader);
        ...
        Method m;
        try {
            m = cl.getMethod("main", new Class[] { String[].class });
        ...
        return new MethodAndArgsCaller(m, argv);
    }
```

`findStaticMain()` 主要工作是通过反射机制找到对应 className(SystemServer) 的 main 方法，但是并未执行；

## 1.7 MethodAndArgsCaller()

``` java
    static class MethodAndArgsCaller implements Runnable {
        /** method to call */
        private final Method mMethod;

        /** argument array */
        private final String[] mArgs;

        public MethodAndArgsCaller(Method method, String[] args) {
            mMethod = method;
            mArgs = args;
        }

        public void run() {
            try {
                mMethod.invoke(null, new Object[] { mArgs });
            ...
```

SystemServer 的 main 方法在 `MethodAndArgsCaller` 的 `run()` 中被 invoke ，在上一步中的 `findStaticMain` 函数返回了一个 `MethodAndArgsCaller` 对象，即是一个 runnable，`ZygoteInit.main()` 中的 `r.run()` 即调用了 `MethodAndArgsCaller.run()`，invoke 启动 SystemServer.java 的 main 函数；

## 1.9 总结

`ZygoteInit.forkSystemServer()` 函数的作用就是 fork 出 `system_server` 进程，并在 `system_server` 进程中获取一个找到 *frameworks/base/services/java/com/android/server/SystemServer.java* main 方法的 runnable，然后通过 r.run() 去执行 *SystemServer.java* 的 main 方法，启动 android 系统中大量的服务。



# 2. SystemServer 启动

## 2.1 SystemServer.main()

``` java
// SystemServer.java
    private static final int sMaxBinderThreads = 31;
    public static void main(String[] args) {
        new SystemServer().run();
    }
    private void run() {
            BinderInternal.setMaxThreads(sMaxBinderThreads); // 设置 binder 线程池最大数量
            Looper.prepareMainLooper(); // 以当前线程作为 MainLooper
            Looper.getMainLooper().setSlowLogThresholdMs(
                    SLOW_DISPATCH_THRESHOLD_MS, SLOW_DELIVERY_THRESHOLD_MS);
            createSystemContext(); // 初始化 context
            mSystemServiceManager = new SystemServiceManager(mSystemContext); // 创建 ssm，管理系统服务的启动
            // 将 ssm 作为本地进程 Service 使用
            LocalServices.addService(SystemServiceManager.class, mSystemServiceManager);
        ...
        // Start services.
        try { // 启动服务
            t.traceBegin("StartServices");
            startBootstrapServices(t); // 启动引导服务
            startCoreServices(t); // 启动核心服务
            startOtherServices(t); // 启动其他服务
        }
        Looper.loop(); // 进入 loop 循环
```

在 SystemServer 的 run() 方法中，主要做了如下工作：

- 设置 SystemServer 的 binder 线程池的数量为 31，默认是 15，这里的数量不包含 binder 主线程；
- 准备 Looper；
- 初始化 SystemContext；
- 创建 SystemServiceManager，用来管理系统服务的创建、启动和生命周期管理；
- 启动引导服务、核心服务以及其他服务；
- 进入 Looper 循环；

启动了三类服务：引导服务、核心服务、其他服务，比如 AMS/PMS/PKMS 等都在引导服务中启动，WMS 在其他服务中启动，这些服务都继承自 SystemServices，且都添加到 binder 的大管家 ServiceManager 进程中管理。
