---
title: Android - ANR分析
copyright: true
date: 2018-03-04 19:13:19
tags: ANR
categories: Android
password:
---

## 1. 简介

> ANR(Application Not Responding) 是一个很常见的问题，通俗的说，就是应用程序与外界的交互不灵敏了。Android 应用与外界的交互有多种，但其中一些特别重要的交互，需要在一定时间范围内完成，如果超过预定时间没有得到应用的及时处理，就会造成 ANR。

<!--more-->

从用户的角度来说，通常就会觉得在这段时间内，无论点击手机按键或滑动屏幕都没有反应。有的时候ANR会向用户显示一个对话框，用户可以选择继续等待或者关闭这个应用程序文件。

## 2. ANR分类

### 2.1 inputDispatching Timeout（最常见的 ANR）

输入事件超时（包括屏幕点击、滑动或按键事件），在一定时间内没有得到应用的处理；

Timeout：5 秒，**超过 5 秒并不是一定会报 ANR，对于 input 来说即便某次事件执行时间超过 timeout 时长，只要用户后续没有再生成事件，就不会触发 ANR**；

### 2.2 BroadcastQueue Timeout（比较常见）

广播事件处理超时，指 BroadcastReceiver 在一定时间内（通常是10秒）没有处理完成；

Timeout：前台广播，超时为 `BROADCAST_FG_TIMEOUT = 10s`，后台广播，超时为 `BROADCAST_BG_TIMEOUT = 60s`；

``` java
// ActivityManagerService.java
// How long we allow a receiver to run before giving up on it.
static final int BROADCAST_FG_TIMEOUT = 10 * 1000 * Build.HW_TIMEOUT_MULTIPLIER;
static final int BROADCAST_BG_TIMEOUT = 60 * 1000 * Build.HW_TIMEOUT_MULTIPLIER;
```

### 2.3 Service Timeout（很少见）

服务超时，应用提供的服务，在一定的时间内（通常是20秒）没法处理完成。

Timeout：前台服务,超时为 `SERVICE_TIMEOUT = 20s`，后台服务,超时为 `SERVICE_BACKGROUND_TIMEOUT = 200s`；

``` java
// ActiveServices.java
// How long we wait for a service to finish executing.
static final int SERVICE_TIMEOUT = 20 * 1000 * Build.HW_TIMEOUT_MULTIPLIER;

// How long we wait for a service to finish executing.
static final int SERVICE_BACKGROUND_TIMEOUT = SERVICE_TIMEOUT * 10;
```

### 2.4 ContentProvider Timeout

内容提供者,在 publish 超时10s；

Timeout：超时为 `CONTENT_PROVIDER_PUBLISH_TIMEOUT_MILLIS = 10s`；

``` java
// ContentResolver.java
    /**
     * How long we wait for an attached process to publish its content providers
     * before we decide it must be hung.
     * @hide
     */
    public static final int CONTENT_PROVIDER_PUBLISH_TIMEOUT_MILLIS =
            10 * 1000 * Build.HW_TIMEOUT_MULTIPLIER;
```



**注：以上超时的时间阈值，在一些特殊的情况下，也可以通过修改阈值来避免ANR。**

## 3. ANR产生原因

ANR产生的原因，总的来说，通常有六种：

- 主线程 IO
- 多线程等锁
- System_server watchdog
- 等待 Binder 对端返回数据
- Binder 无空闲线程
- 系统资源紧张

### 3.1 主线程中有耗时/等待操作

android 应用程序都有一个主线程，这个主线程主要负责控制 UI 界面的显示、更新和控件交互（因此主线程通常又叫做UI线程），在 android 应用程序中，对于输入事件、broadcast 以及 service 的处理都是在这个主线程中。任何一个线程，简单点来说，其实都是一个 while 循环，在这个循环中，依次去做各种事，因此线程的工作流程显然是串行的，而非并行的。从另一个角度来说，这就意味着，在线程中，如果有一件事情没有完成，其它事情是决不可能被执行的。主线程也不例外，主线程要处理的各项事务（包括输入事件，广播，服务等）也必须按序一样一样来完成的。因此，如果主线程一直在做某件耗时的事情，或者在等待某些条件，就必然导致其它事务得不到及时处理，这就为 ANR 产生创造了条件。

具体来说，在主线程中发生的耗时/等待操作，可能有如下这些情况：

- 主线程在做网络访问
- 主线程在做大量的数据库访问
- 主线程在做硬件操作
- 主线程中调用了新建线程的 thread.join 方法，或调用了 sleep 方法
- Service 忙导致超时
- 其它线程占有 lock，导致主线程在等待 lock
- 主线程在等待其它线程的返回结果，而其它线程迟迟没有返回

总而言之，在主线程的任何地方，任何代码，只要它消耗的时间超过前面所说的时间阀值，就有可能会造成ANR，那么应用中，哪些地方属于主线程呢？常见的有如下这些：

- Activity:onCreate(), onResume(), onDestroy(), onKeyDown(), onClick() 等
- AsyncTask: onPreExecute(), onProgressUpdate(), onPostExecute(), onCancel,等
- Mainthread handler: handleMessage(), post*(runnable r)等

### 3.2 系统性能问题

在手机系统中，同一时间内有好多程序在运行，不可能只有当前的应用程序在跑，而系统 CPU 资源是有限的，因此，如果其它程序在进行繁忙的操作，占用了大量的 CPU 资源的话，就有可能导致当前应用无法及时运行（所谓的 CPU 饥饿），这也就意味着应用程序可能无法及时处理各种输入事件，从而导致 ANR。

### 3.3 应用程序没有收到输入事件

如果系统向当前应用分发了一个输入事件，但应用程序却由于某种原因（比如说因为事件分发的管道坏了），没有接到这个输入事件，当然也就无法处理这个事件，因此，过了一定时间后，仍然会出现 ANR，典型的 log 如下：

``` shell
03-01 17:34:02.641  5391  8174 W InputDispatcher: channel 'fb9318f PopupWindow:53fe386 (server)' ~ Consumer closed input channel or an error occurred.  events=0x9
03-01 17:34:02.641  5391  8174 E InputDispatcher: channel 'fb9318f PopupWindow:53fe386 (server)' ~ Channel is unrecoverably broken and will be disposed!
... ...
03-01 17:34:10.387  5391  8174 I WindowManager: Input event dispatching timed out sending to PopupWindow:53fe386.  Reason: Waiting because the focused window's input channel is not registered with the input dispatcher.  The window may be in the process of being removed.
```

## 4. 如何分析ANR

  ANR 分为前台 ANR（用户能感知到的，对用户体验影响大，需要弹框让用户决定退出还是等待）和后台 ANR（只抓取发生 ANR 进程的 trace，不会收集 CPU 信息，并且会在后台直接杀掉该无响应的进程，不会弹框提示用户）；

 前台 ANR 发生后，系统会马上去抓取现场信息用于调试分析，主要信息有：

- am_anr 信息（Eventlog），这条 log 的时间最接近 ANR 发生的时间；
- trace 信息，保存在 data/anr/ 目录下；
- main log 中发生 ANR 的原因和 CPU 使用情况信息；
- 将 trace 文件和 CPU 使用情况保存到 data/system/dropbox 目录；
- 对用户感知的进程弹出 ANR 对话框，对用户不感知的发生 ANR 的进程直接杀掉；

分析步骤：

- 定位 ANR 发生的时间点；
- 查看 trace 信息；
- 分析是否有耗时的 message, binder 调用，锁的竞争，CPU 资源的抢占；
- 结合具体的业务场景的上下文来分析；

### 4.1 在log中搜索"am_anr"

```shell
01-29 15:12:47.938  1720  1798 I am_anr  : [0,3108,com.miui.home,953794117,Input dispatching timed out (com.miui.home/com.miui.home.launcher.Launcher, Waiting to send non-key event because the touched window has not finished processing certain input events that were delivered to it over 500.0ms ago.  Wait queue length: 5.  Wait queue head age: 5799.1ms.)]
```

- 从 log 中可以看到发生 ANR 的进程 ID(3108)，进程名(com.miui.home)，ANR 的类型(Input dispatching timed out)等信息；
- 要注意这条 log 的时间(01-29 15:12:47.938)，即 ANR 发生的时间点，向前平移相应类型超时的时间，就可以找到输入事件/广播/服务 开始的时间点，比如这里是输入事件超时，发生在 15:12:47 ，则向前平移 5 秒，15:12:42 就是事件输入的时间；
- 知道这个时间很重要，因为应用程序就是在这个时间段内，无法对外界的交互作出响应的。因此，我们应当重点查看这个时间段内主线程的所有 log（就是那些 pid 与 tid 相同，且都等于应用程序的进程 ID 的 log），从这些 log 我们也许可以看到在 ANR 期间，主线程在做些什么，这对于我们判断 ANR 的成因有一定的帮助。比如说，如果我们看到在这个时间段内，主线程打印了大量的与数据库相关的操作，那么就不难推测，很可能就是这些数据库操作，导致了阻塞；

### 4.2 在log中搜索”ANR in”

```shell
01-29 15:12:47.953  3042  3164 I WtEventController: ANR com.miui.home 3108
01-29 15:12:52.810  1720  1798 E ActivityManager: ANR in com.miui.home (com.miui.home/.launcher.Launcher)
01-29 15:12:52.810  1720  1798 E ActivityManager: PID: 3108
01-29 15:12:52.810  1720  1798 E ActivityManager: Reason: Input dispatching timed out (com.miui.home/com.miui.home.launcher.Launcher, Waiting to send non-key event because the touched window has not finished processing certain input events that were delivered to it over 500.0ms ago.  Wait queue length: 5.  Wait queue head age: 5799.1ms.)
01-29 15:12:52.810  1720  1798 E ActivityManager: Load: 0.92 / 0.52 / 0.31
01-29 15:12:52.810  1720  1798 E ActivityManager: CPU usage from 37298ms to 0ms ago (2018-01-29 15:12:10.574 to 2018-01-29 15:12:47.872):
01-29 15:12:52.810  1720  1798 E ActivityManager:   13% 663/surfaceflinger: 6.3% user + 7.5% kernel / faults: 218 minor 2 major
01-29 15:12:52.810  1720  1798 E ActivityManager:   10% 1720/system_server: 6.4% user + 3.6% kernel / faults: 3751 minor 3 major
01-29 15:12:52.810  1720  1798 E ActivityManager:   8.9% 12029/com.tencent.mm: 7.2% user + 1.6% kernel / faults: 12889 minor 26 major
01-29 15:12:52.810  1720  1798 E ActivityManager:   6.2% 20598/ctrip.android.view:pushsdk.v1: 2.3% user + 3.8% kernel / faults: 12738 minor 1 major
01-29 15:12:52.810  1720  1798 E ActivityManager:   6.1% 29744/com.tencent.mm:tools: 4.3% user + 1.8% kernel / faults: 293 minor
01-29 15:12:52.810  1720  1798 E ActivityManager:   5.2% 3970/com.hxwj.wjjf: 4% user + 1.1% kernel / faults: 194 minor
01-29 15:12:52.810  1720  1798 E ActivityManager:   5.1% 7498/com.talk51.dasheng: 3.2% user + 1.8% kernel / faults: 568 minor
01-29 15:12:52.810  1720  1798 E ActivityManager:   4.7% 29530/com.tencent.mm:appbrand0: 3.4% user + 1.3% kernel / faults: 270 minor
01-29 15:12:52.810  1720  1798 E ActivityManager:   2.7% 22516/com.ss.android.ugc.live:push: 0% user + 2.7% kernel / faults: 9 minor
```

从上面这些信息，同样可以看到 ANR 的类型，进程名，进程 ID 等信息，而最重要的是还可以看到 ANR 发生之前与之后，各进程占用 CPU 的情况，以及 io 访问的情况，通过这些信息，我们可以作出一些判断：

- 如果 ANR 进程的 cpu 占用比别的进程都高得多，则显然应当关注该进程本身是否做了什么，是不是有大量耗时的操作；
- 如果是其它进程占用了很高的 CPU，比如说达到了百分之一百多，则有可能是 CPU 饥饿导致了 ANR；
- 如果 iowait 很高，则很可能是主线程在进行 io 操作导致的 ANR；

### 4.3 查看 trace 文件

#### 4.3.1 trace 信息

人为收集 trace 命令：`adb shell kill -3 pid`，执行完该命令后 trace 信息会保存在 */data/anr/trace_xx* 中；

Trace 文件是 ANR 最重要的分析依据，它是在 ANR 发生时，系统自动生成的，放在手机目录 */data/anr/* 下面，发生 ANR 时，系统会将各主要进程的所有线程的当前堆栈，以及其它很多与进程、线程、内存相关的信息，都打印在 trace 文件中；

trace 文件中的信息种类很多，但我们在解决 ANR 时，主要关注的还是线程的堆栈。因为这些堆栈是在系统监测到 ANR 发生时打印的，所以其中很可能就包含了与 ANR 相关的函数调用的信息；

需要注意的一点是，trace 中的堆栈并不必然包含与 ANR 相关的函数堆栈信息，因此，**不能看到主线程的堆栈顶是什么操作，就以为主线程一定是卡在这个操作里**，这个必须综合考量；

trace 文件中一个典型的线程堆栈大致如下：

```java
----- pid 3108 at 2018-01-29 15:12:47 ----- //进程ID
Cmd line: com.miui.home // 进程名
Build fingerprint: 'xiaomi/whyred/whyred:7.1.1/NGI77B/V9.2.2.0.NEIMIEK:user/release-keys'
ABI: 'arm64'
Build type: optimized
... ...
DALVIK THREADS (43): // 该进程中线程数目
... ...
"main" prio=5 tid=1 Native // "main"是本线程的名称，即主线程，tid 是该线程在本进程中所有线程中的序号
  | group="main" sCount=1 dsCount=0 obj=0x76205000 self=0x7fb1496a00
  | sysTid=3108 nice=-10 cgrp=default sched=0/0 handle=0x7fb5a1da98 // "sysTid"即该线程在 linux 系统中的线程号
  | state=S schedstat=( 142450779402 106025895288 282748 ) utm=11713 stm=2532 core=1 HZ=100
  | stack=0x7fe8140000-0x7fe8142000 stackSize=8MB
  | held mutexes=
  kernel: __switch_to+0x88/0x94    // 从这里开始以下是主线程堆栈
  kernel: binder_thread_read+0x324/0xea4
  kernel: binder_ioctl_write_read+0x18c/0x2d0
  kernel: binder_ioctl+0x1c0/0x5fc
  kernel: do_vfs_ioctl+0x48c/0x564
  ... ...
  at android.os.Looper.loop(Looper.java:163)
  at android.app.ActivityThread.main(ActivityThread.java:6210)
  at java.lang.reflect.Method.invoke!(Native method)
  at com.android.internal.os.ZygoteInit$MethodAndArgsCaller.run(ZygoteInit.java:901)
  at com.android.internal.os.ZygoteInit.main(ZygoteInit.java:791)
```

- 第 1 行：
  - 线程名：main，如果有 daemon 则是守护线程；
  - prio：线程优先级；
  - tid：该线程在本进程所有线程中的序号；
  - Native：线程状态；
- 第 2 行：
  - group：线程所属的线程组；
  - sCount：线程挂起次数；
  - dsCount：用于调试的线程挂起次数；
  - obj：当前线程关联的 java 线程对象；
  - self：当前线程地址；
- 第 3 行：
  - sysTid：线程真正意义上的 tid；
  - nice：调度有优先级，值越小优先级越高；
  - cgrp：进程所属的进程调度组；
  - sched：调度策略；
  - handle：函数处理地址；
- 第 4 行：
  - state：线程状态；
  - schedstat：CPU 调度时间统计，括号中的 3 数字依次是 Running（CPU 运行时间，单位 ns）、Runnable（RQ 队列的等待时间，单位 ns）、Switch（CPU 调度切换次数）；
  - utm/stm：该线程在用户态 / 内核态的所执行的时间，单位是 jiffies，jiffies 定义为 sysconf（_SC_CLK_TCK），默认等于 10ms，utm + stm = schedstat 第一个参数值；
  - core：该线程的最后运行所在核；
  - HZ：时钟频率；
- 第 5 行：
  - stack：线程栈的地址区间；
  - stackSize：栈的大小；
- 第 6 行：
  - held mutexes：所持有mutex类型，有独占锁 exclusive 和共享锁 shared 两类；





拿到一份 trace 文件后，我们首先要看的是 ANR 进程主线程的堆栈，看主线程正在做什么，值得注意的情况大概有如下几点：

#### 4.3.1 主线程是否正在执行网络 / IO / 数据库等操作?

这些情况都是发生 ANR 的高危操作，如果有的话，那么这些操作很可能就是导致 ANR 的原因了(当然一般还需要调试确认)，这种问题的解决方法一般就是把这些耗时操作放到其它线程中去完成，待完成后，再通过 handler 通知主线程就可以了;

**解决办法：**

- 在建立网络连接时设置 timeout 超时时间；
- 可以把这任务放到独立的线程中去完成；

#### 4.3.2 主线程的栈顶是否有 Thread.sleep/Thread.join 函数调用

**解决办法：**

- 对于 sleep，可以尝试去掉这个 sleep，如果不能去的话，那还是把这这个任务放到其它线程中去执行
- 对于 join（等待子线程执行完再继续执行），可以去掉 join，把 join 后面的工作放到 handler 的相关消息处理中，当新线程任务完成时，使用 handler 消息来通知主线程即可

#### 4.3.3 主线程的函数栈中，特别是栈顶的那些函数中，是否存在大的 for/while 循环

**解决办法：**

- 优化函数代码，使用其他方法代替；

#### 4.3.4 主线程的栈顶是否有锁等待（waitting on a lock）

栈顶有 waiting on <0x********>字样的话，说明主线程在等待锁，如下:

``` shell
at com.android.server.wm.WindowManagerService$H.handleMessage(WindowManagerService.java:8315)
  - waiting to lock <0x084ffe56> (a java.util.HashMap) held by thread 76
  at android.os.Handler.dispatchMessage(Handler.java:102)
  at android.os.Looper.loop(Looper.java:148)
... ...
```

当然这并不能说明 ANR 就一定是因为卡在这个锁上，但如果多次抓取的 trace 文件中，都是卡在这个锁上，有可能一直在等待其它线程释放该锁，另外，还可以通过查找该锁是被哪个线程锁住的，然后去看那个线程中是否有什么可疑的阻塞操作？或者是否存在互相等待的死锁？如果那个线程中发现有可疑操作或死锁的话，这个锁应该就是 ANR 的原因了，如果没发现，那么该锁可能就是正常现象；

如何查找一个锁是被哪个线程锁住的？在 `waiting to lock` 的后面通常会有关键字 `held by thread 76`，根据这个线程序号，可以直接找到锁定的线程。也可以在 trace 文件中查找锁的数值关键字（如上面的<0x084ffe56> ），如果发现有 locked <0x084ffe56>，那么它就是在这个线程序中被锁定的，查找结果如下：

``` shell
"Binder_A" prio=5 tid=76 Native
  | group="main" sCount=1 dsCount=0 obj=0x134490a0 self=0x55b18611f0
  | sysTid=4276 nice=-3 cgrp=default sched=0/0 handle=0x7f7b6f6450
  | state=S schedstat=( 155534146538 91307372331 509087 ) utm=8036 stm=7517 core=4 HZ=100
  | stack=0x7f7b5fa000-0x7f7b5fc000 stackSize=1013KB
  | held mutexes=
... ...
  native: #02 pc 000000000002d584  /system/lib64/libbinder.so (_ZN7android14IPCThreadState14talkWithDriverEb+164)
  native: #03 pc 000000000002e050  /system/lib64/libbinder.so (_ZN7android14IPCThreadState15waitForResponseEPNS_6ParcelEPi+104)
... ...
  at com.android.server.wm.WindowStateAnimator.createSurfaceLocked(WindowStateAnimator.java:875)
  at com.android.server.wm.WindowManagerService.relayoutWindow(WindowManagerService.java:3264)
  - locked <0x084ffe56> (a java.util.HashMap)
  at com.android.server.wm.Session.relayout(Session.java:198)
  at android.view.IWindowSession$Stub.onTransact(IWindowSession.java:284)
  at com.android.server.wm.Session.onTransact(Session.java:130)
  at android.os.Binder.execTransact(Binder.java:453)
```

从上面的堆栈可以看出， <0x084ffe56> 锁是在 Binder_A 线程中被锁定的，之所以一直没释放锁，是由于该线程卡在了 createSurface 这个 inder 调用中；另外，还需要说明的是，如果在同一个堆栈中出现这样的现象，一个锁先是被锁定，然后后面立刻又等待该锁，像下面这样：

``` shell
"main" prio=5 tid=1 TimedWaiting
| group="main" sCount=1 dsCount=0 obj=0x752ccfb8 self=0x559e6b26a0
| sysTid=3078 nice=0 cgrp=apps/bg_non_interactive sched=0/0 handle=0x7f81cd4150
| state=S schedstat=( 521831915 7324195292 1199 ) utm=46 stm=6 core=3 HZ=100
| stack=0x7fec70d000-0x7fec70f000 stackSize=8MB
| held mutexes=
at java.lang.Object.wait!(Native method)
- waiting on <0x2f38fd73> (a java.lang.Object)
at java.lang.Thread.parkFor(Thread.java:1220)
- locked <0x2f38fd73>  (a java.lang.Object)
at sun.misc.Unsafe.park(Unsafe.java:299)
at java.util.concurrent.locks.LockSupport.parkNanos(LockSupport.java:197)

```

有人可能会认为这是死锁，其实是不一定的。这种情况下，要看这个锁是不是 **可重入锁**，意思就是在同一个线程中，外层函数获得锁之后 ,内层函数仍然可以获取该锁，如果是可重入锁，上面的情况就不构成死锁，如果不是可重入锁，就会造成死锁。至于在堆栈出现的到底是哪种锁，这个需要具体看代码来分析，一般来说，java下使用 synchronized，ReentrantLock 来实现的锁都是**可重入锁**；

#### 4.3.5 主线程的栈顶是否正在执行 binder 请求

Binder 通信默认是同步的，所以有可能在 Binder 请求时对端阻塞了，如果主线程的栈顶正在请求某个binder调用，它的形式通常如下：

``` shell
"main" prio=5 tid=1 Native
  | group="main" sCount=1 dsCount=0 obj=0x74baafa0 self=0x55637f22b0
  | sysTid=1347 nice=-2 cgrp=default sched=0/0 handle=0x7f8d762ff0
  | state=S schedstat=( 19576409545 8006176352 39658 ) utm=1155 stm=802 core=5 HZ=100
  | stack=0x7fcb8ef000-0x7fcb8f1000 stackSize=8MB
  | held mutexes=
... ...
  native: #02 pc 000000000002d584  /system/lib64/libbinder.so (_ZN7android14IPCThreadState14talkWithDriverEb+164)
  native: #03 pc 000000000002e050  /system/lib64/libbinder.so (_ZN7android14IPCThreadState15waitForResponse)
... ...
  at android.os.BinderProxy.transact(Binder.java:503)
  at android.content.ContentProviderProxy.query(ContentProviderNative.java:419)
... ...
  at com.android.server.telecom.Call$3.run(Call.java:226)
  - locked <0x048a55bc> (a com.android.server.telecom.TelecomSystem$1)
  at android.os.Handler.handleCallback(Handler.java:739)
  at android.os.Handler.dispatchMessage(Handler.java:95)
  at android.os.Looper.loop(Looper.java:148)
```

并非出现这种情况，就一定阻塞，但如果多次抓取的 trace 文件中，都可以发现主线程在进行同一个特殊的 binder 请求的话，那么基本就可以确定，主线程是卡在了这个请求中了。为什么 binder 请求也会阻塞呢？这个要先从 binder 本身说起；

Binder 是进程间的通信机制，是 C/S 结构，客户端向服务端发起请求，服务端完成这个请求，并可将结果返给客户端，客户端与服务端分别属于不同的线程；而 binder 请求又分为**同步与异步**，同步意味着客户端的请求必须等服务端的工作完成并返回结果后才可以结束，异步则意味着客户端发出请求后就可以立即返回，不必等待服务端的完成；看到这儿，大家就会想到，如果是同步调用，而服务端又长时间没有返回的话，那么客户端线程不就是会一直卡在那儿，等待返回吗？而如果客户端恰好是主线程的话，不就是会因此造成ANR吗？因此，如果主线程的栈顶正在进行某个 binder 调用，我们有必要看一下该调用是同步的还是异步的，如果是同步调用，我们就有理由怀疑该请求的服务端是不是长时间没有返回；

那么如何知道服务端在做什么呢？由于服务端是在一个独立的线程中完成请求的，因此，如果此时这个请求还没有完成的话，这个线程的堆栈通常也会在trace 文件中打印出来，有一个简单的办法就是，先找到服务端中完成该请求的函数名及其所在文件名，然后在 trace 文件中搜索该函数名，并结合函数所在的文件名，一般就可以找到这个服务端的线程堆栈了，然后再去分析这个堆栈，看具体是什么原因导致它没有尽快返回的；

如何判断一个 binder 调用是同步还是异步，这个可以从代码来看，如下是一个 binder 请求语句：

``` java
remote()->transact(NOTIFY, data, &reply, IBinder::FLAG_ONEWAY);
```

注意看最后一个参数，如果最后一个参数是 FLAG_ONEWAY，就说明它是异步 binder，如果为 0 或者缺省的话，就是同步 binder；

## 5. 如何避免 ANR

主线程尽量只做 UI 相关的操作，避免耗时操作，比如过度复杂的 UI 绘制,网络操作，文件 IO 操作;

避免主线程跟工作线程发生锁的竞争，减少系统耗时 binder 的调用，谨慎使用 sharePreference，注意主线程执行 provider query 操作；

总之就是尽可能减少主线程的负载,让其空闲待命，以期可随时响应用户的操作；

## 6. 监控 ANR

### 6.1 FileObserver

FileObserver 可以监控目录或文件的状态，继承 FileObserver，重写 onEvent()，当被监控的文件或者目录发生变更事件时，将回调FileObserver的onEvent()函数来处理文件或目录的变更事件；

``` java
import android.os.FileObserver;
import android.util.Log;
import androidx.annotation.Nullable;

public class ANRFileObserver extends FileObserver {
    public ANRFileObserver(String path) {//data/anr/
        super(path);
    }

    public ANRFileObserver(String path, int mask) {
        super(path, mask);
    }

    @Override
        public void onEvent(int event, @Nullable String path) {
            switch (event)
        {
            case FileObserver.ACCESS://文件被访问
                Log.i("Test", "ACCESS: " + path);
                break;
            case FileObserver.ATTRIB://文件属性被修改，如 chmod、chown、touch 等
                Log.i("Test", "ATTRIB: " + path);
                break;
            case FileObserver.CLOSE_NOWRITE://不可写文件被 close
                Log.i("Test", "CLOSE_NOWRITE: " + path);
                break;
            case FileObserver.CLOSE_WRITE://可写文件被 close
                Log.i("Test", "CLOSE_WRITE: " + path);
                break;
            case FileObserver.CREATE://创建新文件
                Log.i("Test", "CREATE: " + path);
                break;
            case FileObserver.DELETE:// 文件被删除，如 rm
                Log.i("Test", "DELETE: " + path);
                break;
            case FileObserver.DELETE_SELF:// 自删除，即一个可执行文件在执行时删除自己
                Log.i("Test", "DELETE_SELF: " + path);
                break;
            case FileObserver.MODIFY://文件被修改
                Log.i("Test", "MODIFY: " + path);
                break;
            case FileObserver.MOVE_SELF://自移动，即一个可执行文件在执行时移动自己
                Log.i("Test", "MOVE_SELF: " + path);
                break;
            case FileObserver.MOVED_FROM://文件被移走，如 mv
                Log.i("Test", "MOVED_FROM: " + path);
                break;
            case FileObserver.MOVED_TO://文件被移来，如 mv、cp
                Log.i("Test", "MOVED_TO: " + path);
                break;
            case FileObserver.OPEN://文件被 open
                Log.i("Test", "OPEN: " + path);
                break;
            default:
                //CLOSE ： 文件被关闭，等同于(IN_CLOSE_WRITE | IN_CLOSE_NOWRITE)
                //ALL_EVENTS ： 包括上面的所有事件
                Log.i("Test", "DEFAULT(" + event + "): " + path);
                break;
        }
    }
}

```

### 6.2 WatchDog

post 一个 anr 检测任务到主线程的消息队列，在 post 之前先记录 mStartTime，mComplete = false，Watchdog 线程等待，检测 anr 检测任务的执行情况（mComplete 是否等于 true），当异常发生时（mComplete 为 fasle）记录堆栈信息，上报数据；

``` java
import android.annotation.TargetApi;
import android.os.Build;
import android.os.Debug;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;

public class ANRWatchDog extends Thread {
    private static final String TAG = "ANR";
    private int timeout = 5000;
    private boolean ignoreDebugger = true;
    static ANRWatchDog sWatchdog;
    private Handler mainHandler = new Handler(Looper.getMainLooper());

    private class ANRChecker implements Runnable {

        private boolean mCompleted;
        private long mStartTime;
        private long executeTime = SystemClock.uptimeMillis();

        @Override
        public void run() {
            synchronized (ANRWatchDog.this) {
                mCompleted = true;
                executeTime = SystemClock.uptimeMillis();
            }
        }

        void schedule() {
            mCompleted = false;
            mStartTime = SystemClock.uptimeMillis();
            mainHandler.postAtFrontOfQueue(this);
        }

        boolean isBlocked() {
            return !mCompleted || executeTime - mStartTime >= 5000;
        }
    }

    public interface ANRListener {
        void onAnrHappened(String stackTraceInfo);
    }

    private ANRChecker anrChecker = new ANRChecker();

    private ANRListener anrListener;

    public void addANRListener(ANRListener listener){
        this.anrListener = listener;
    }

    public static ANRWatchDog getInstance(){
        if(sWatchdog == null){
            sWatchdog = new ANRWatchDog();
        }
        return sWatchdog;
    }

    private ANRWatchDog(){
        super("ANR-WatchDog-Thread");
    }

    @TargetApi(Build.VERSION_CODES.JELLY_BEAN)
    @Override
    public void run() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND); // 设置为后台线程
        while(true){
            while (!isInterrupted()) {
                synchronized (this) {
                    anrChecker.schedule();
                    long waitTime = timeout;
                    long start = SystemClock.uptimeMillis();
                    while (waitTime > 0) {
                        try {
                            wait(waitTime);
                        } catch (InterruptedException e) {
                            Log.w(TAG, e.toString());
                        }
                        waitTime = timeout - (SystemClock.uptimeMillis() - start);
                    }
                    if (!anrChecker.isBlocked()) {
                        continue;
                    }
                }
                if (!ignoreDebugger && Debug.isDebuggerConnected()) {
                    continue;
                }
                String stackTraceInfo = getStackTraceInfo();
                if (anrListener != null) {
                    anrListener.onAnrHappened(stackTraceInfo);
                }
            }
            anrListener = null;
        }
    }

    private String getStackTraceInfo() {
        StringBuilder stringBuilder = new StringBuilder();
        for (StackTraceElement stackTraceElement : Looper.getMainLooper().getThread().getStackTrace()) {
            stringBuilder
                    .append(stackTraceElement.toString())
                    .append("\r\n");
        }
        return stringBuilder.toString();
    }
}

```

使用：

``` java
Handler handler = null;
void ANRTest(){
    handler = new Handler();
    ANRWatchDog.getInstance().addANRListener(new ANRWatchDog.ANRListener {
        @Override
        public void onAnrHappened(String stackTraceInfo){
            Log.i(TAG, "anr: " + stackTraceInfo);
        }
    });
    ANRWatchDog.getInstance.start();
    handler.postDelayed(new Runnable() {
        @Override
        public void run() {
            try{
                Thread.sleep(10 * 1000);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }, 3000);
        
}
// 找个地方把 ANRTest() 放进去
private void onCreate(xxx) {
    ANRTest();
}
```

