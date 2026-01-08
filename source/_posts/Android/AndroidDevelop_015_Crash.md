---
title: Android - Crash 原理分析
copyright: true
date: 2022-03-016 19:18:19
tags: ANR
categories: Android
password:
---

# 1. 简介

> Crash 原理分析。

<!--more-->

# 2. 原理

``` mermaid
sequenceDiagram
autonumber
Note over ZygoteInit:1.Java Crash
ZygoteInit -->> ZygoteInit:forkSystemServer()
ZygoteInit ->> ZygoteInit:handleSystemServerProcess()
ZygoteInit ->> ZygoteInit:zygoteInit()
ZygoteInit ->> RuntimeInit:commonInit()
RuntimeInit ->> Thread:setDefaultUncaughtExceptionHandler()
Note over Thread,RuntimeInit:发生 crash 时 Thread 中回调自定义的 Handler
Thread -->> RuntimeInit:KillApplicationHandler.uncaughtException()
RuntimeInit ->> AMS:handleApplicationCrash()
AMS ->> AMS:handleApplicationCrashInner("crash")
Note over RuntimeInit,Process:在 finally 分支杀死进程
RuntimeInit ->> Process:killProcess(Process.myPid());

Note over SystemServer:2.Native Crash
SystemServer ->> SystemServer:startOtherServices()
Note over SystemServer,AMS:AMS.systemReady()时调用
SystemServer ->> AMS:startObservingNativeCrashes()
Note over AMS,NativeCrashListener:通过 NativeCrashListener 回调 AMS
AMS -->> AMS:handleApplicationCrashInner("native_crash")

AMS ->> AMS:addErrorToDropBox()
```

系统处理未捕获异常流程

- Java Crash：
    - Thread 中遇到未捕捉异常会一路往上抛，由 JVM 调用 `Thread .dispatchUncaughtException` 处理
    - dispatchUncaughtException 内部是运用 UncaughtExceptionHandler 进行处理
    - Android 在进程创建时，RuntimeInit 中向 Thread 设置了一个自定义的  `KillApplicationHandler` 实现 `UncaughtExceptionHandler`，其中提供杀死进程和请求 JVM 终止运行的功能
    - 在 `KillApplicationHandler` 中通过把 Exception 交给 AMS 处理，发生异常时调用 `handleApplicationCrashInner()`，最终把异常信息写入 `/data/system/dropbox` 目录并且会在 `KillApplicationHandler` 中杀死进程
- Native Crash
    - SystemServer 在 `AMS.systemReady()` 时通过 `startObservingNativeCrashes()` 观察 NativeCrash
    - 启动了 NativeCrashListener 线程，在这个线程的 run() 中，创建一个 UDS Socket server 端，绑定到文件路径 `/data/system/ndebugsocket`（NativeCrashListener 中定义），开始监听连接请求，进入死循环阻塞在 `Os.accept()`，等待 debuggerd 进程（crash_dump 进程）发起连接。
    - 一旦发生 Crash，底层会把 Crash 现场信息写入 `/data/system/ndebugsocket`，服务端收到连接，获取到客户端的 peerFd，调用 consumeNativeCrashData(peerFd) 方法读取并处理崩溃数据（包括 PID、信号量、Native 堆栈等）。
    - NativeCrashListener 再通过内部的 NativeCrashReporter 线程回调 AMS `handleApplicationCrashInner()`，最终也是把异常信息写入 `/data/system/dropbox`
    - <font color=red>**简单总结，它就像一个专用的接线员，一直守在 /data/system/ndebugsocket 这个电话机旁。一旦底层的 C/C++ 代码发生崩溃，debuggerd 就会打进电话，NativeCrashListener 接起电话记录崩溃详情，告诉对方“收到了”，然后挂断电话并将信息转交给 ActivityManagerService 进行后续的应用层崩溃处理（如弹出“应用已停止运行”对话框）。**</font>

DropBoxManager：AndroidDrobox 是 Android 在 8 引入的用来持续化存储系统数据的机制，主要用于记录 Android 运行过程中内核/系统进程/用户进程 等出现验证问题时的 log，可以认为这是一个可持续存储的系统级别的 logcat，文件保存在 system/dropbox



ANR 由多种情况触发处理，另外 ANR 在写入 `/data/system/dropbox` 之前会先写一份到 /data/anr下

最终所有的 crash 处理，android 内部都会把对应的数据收集到 `/data/system/dropbox` 下

# 3. Crash 优化处理

- 收集信息
    - 有 root 权限：直接采集 dropbox 下的文件
    - 无 root 权限：介入到异常处理过程中（）
        - 直接写一个 CrashHandler implements Thread.UncaughtExceptionHandler，重写 `uncaughtException()`，
        - 做了拦截，在具体进程被杀之前保存信息
- 提升用户体验
    - 出现 crash 时让进程不退出：拦截到之后重启 loop，更好的时 loop 崩了之后重启当前 Activity
    -  重启 APP

signal 11SIGSEGV, code 1, fault addr ox0

如果是 0x0，就是空指针，如果不是0，就是使用的时候已经被其他地方释放

# 4. 总结

**内部原理，系统对 Crash 的处理机制**

- JAVA 层没有捕获异常，那么会由 JVM 调用 `dispatchUncaughtException()` 调用一个 `UncaughtExceptionHandler` 进行处理，默认 RuntimeInit 给我们提供了一个 KillApplicationHandler，这个而处理会杀掉进程，那么我们自己可以给一个 `UncaughtExceptionHandler` 拦截处理，在其内部，如果不想退出，用 looper 重启具体能力/介入到 ActivityThread 中对所有 Activity 的生命周期周期提供异常捕捉呢能力
- Native  原理是通过 uds socket 把现场信息上报给 AMS

**方案**

- 上传数据
- 尽可能让崩溃友好一点
    - 重启（体验不好）
    - looper（对业务有影响，用户操作无响应，体验也不太好）
    - 关闭当前 Activity
