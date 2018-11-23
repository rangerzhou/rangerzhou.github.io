---
title: Watchdog机制及实例分析
copyright: true
date: 2017-10-12 10:01:06
tags: Watchdog
categories: Frameworks
password:
---

### 1. 概述

> xxxxxx

<!--more-->

### 2. Watchdog机制解析

#### 2.1 Watchdog的初始化

Watchdog是在System Server中初始化的：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/java/com/android/server/)/[SystemServer.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/java/com/android/server/SystemServer.java)

``` java
public final class SystemServer {
  ... ...
    /**
     * Starts a miscellaneous grab bag of stuff that has yet to be refactored
     * and organized.
     */
    private void startOtherServices() {
    ... ...
        try {
          ... ...
            traceBeginAndSlog("InitWatchdog");
            final Watchdog watchdog = Watchdog.getInstance(); // 获取Watchdog对象初始化
            watchdog.init(context, mActivityManagerService); // 注册receiver以接收系统重启广播
            Trace.traceEnd(Trace.TRACE_TAG_SYSTEM_SERVER);
          ... ...
        }
    ... ...
        mActivityManagerService.systemReady(new Runnable() {
            @Override
            public void run() {
              ... ...
                Watchdog.getInstance().start();
              ... ...
             }
        });
    }
```

Watchdog在初始化时构造了很多HandlerChecker，大致可以分为两类：

- Monitor Checker：用于检查是Monitor对象可能发生的死锁, AMS, PKMS, WMS等核心的系统服务都是Monitor对象。在log中会有`watchdog: Blocked in monitor xxx foreground thread(android.fg)`，所以其实就是android.fg线程。
- Looper Checker：用于检查线程的消息队列是否长时间处于工作状态。Watchdog自身的消息队列，UI, IO, Display这些全局的消息队列都是被检查的对象。此外，一些重要的线程的消息队列，也会加入到**Looper Checker**中，譬如AMS, PKMS，这些是在对应的对象初始化时加入的。

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[Watchdog.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/Watchdog.java)

``` java
/** This class calls its monitor every minute. Killing this process if they don't return **/
public class Watchdog extends Thread {
  ... ...

    /* This handler will be used to post message back onto the main thread */
    final ArrayList<HandlerChecker> mHandlerCheckers = new ArrayList<>();
    final HandlerChecker mMonitorChecker;
  ... ...      
    public static Watchdog getInstance() {
        if (sWatchdog == null) {
            sWatchdog = new Watchdog(); // new一个Watchdog对象
        }

        return sWatchdog;
    }
... ...
    private Watchdog() {
        super("watchdog");
        // Initialize handler checkers for each common thread we want to check.  Note
        // that we are not currently checking the background thread, since it can
        // potentially hold longer running operations with no guarantees about the timeliness
        // of operations there.

        // The shared foreground thread is the main checker.  It is where we
        // will also dispatch monitor checks and do other work.
  		// 可以看一下FgThread的构造函数，super("android.fg", xxx, true)，所以其实就是android.fg线程
        mMonitorChecker = new HandlerChecker(FgThread.getHandler(),
                "foreground thread", DEFAULT_TIMEOUT);
        mHandlerCheckers.add(mMonitorChecker); //添加MonitorChecker
        // Add checker for main thread.  We only do a quick check since there
        // can be UI running on the thread.
  		// 添加Looper Checker
        mHandlerCheckers.add(new HandlerChecker(new Handler(Looper.getMainLooper()),
                "main thread", DEFAULT_TIMEOUT));
        // Add checker for shared UI thread.
        mHandlerCheckers.add(new HandlerChecker(UiThread.getHandler(),
                "ui thread", DEFAULT_TIMEOUT));
        // And also check IO thread.
        mHandlerCheckers.add(new HandlerChecker(IoThread.getHandler(),
                "i/o thread", DEFAULT_TIMEOUT));
        // And the display thread.
        mHandlerCheckers.add(new HandlerChecker(DisplayThread.getHandler(),
                "display thread", DEFAULT_TIMEOUT));

        // Initialize monitor for Binder threads.
        addMonitor(new BinderThreadMonitor());
    }
```

Monitor Checker和Looper Checker的侧重点不一样，前者预警我们不能长时间持有核心系统服务的对象锁，否则会阻塞很多函数的运行；后者预警我们不能长时间的霸占消息队列，否则其他消息将得不到处理。这两类都会导致系统卡住(System Not Responding)。

init注册了一个广播接收器用来接收重启系统的广播：

``` java
    final class RebootRequestReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context c, Intent intent) {
            if (intent.getIntExtra("nowait", 0) != 0) {
                rebootSystem("Received ACTION_REBOOT broadcast");
                return;
            }
            Slog.w(TAG, "Unsupported ACTION_REBOOT broadcast: " + intent);
        }
    }
... ...
    public void init(Context context, ActivityManagerService activity) {
        mResolver = context.getContentResolver();
        mActivity = activity;

        context.registerReceiver(new RebootRequestReceiver(),
                new IntentFilter(Intent.ACTION_REBOOT),
                android.Manifest.permission.REBOOT, null);
    }
```

#### 2.2 触发Watchdog

初始化Watchdog后，在SystemServer中start，作为SystemServer进程中的一个单独的线程运行，但是想要触发Watchdog的运行还需要AMS、PMS等系统服务加入到Watchdog的监测集，也就是需要Watchdog关注的对象，Watchdog只关注一些核心的系统服务。

需要Watchdog检测的对象，需要将自己添加到Watchdog的监测集中，以AMS为例：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[am](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/am/)/[ActivityManagerService.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/am/ActivityManagerService.java)

``` java
    public ActivityManagerService(Context systemContext) {
      ... ...
        Watchdog.getInstance().addMonitor(this);
        Watchdog.getInstance().addThread(mHandler);
    }

    /** In this method we try to acquire our lock to make sure that we have not deadlocked */
    public void monitor() {
        synchronized (this) { }
    }
```

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[Watchdog.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/Watchdog.java)

``` java
public class Watchdog extends Thread {
  ... ...
    // 1 addMonitor
	public void addMonitor(Monitor monitor) {
        synchronized (this) {
            if (isAlive()) {
                throw new RuntimeException("Monitors can't be added once the Watchdog is running");
            }
            // 实际调用Watchdog内部类HandlerChecker的addMonitor
            mMonitorChecker.addMonitor(monitor);
        }
    }

    // 2 addThread
    public void addThread(Handler thread) {
        addThread(thread, DEFAULT_TIMEOUT);
    }

    public void addThread(Handler thread, long timeoutMillis) {
        synchronized (this) {
            if (isAlive()) {
                throw new RuntimeException("Threads can't be added once the Watchdog is running");
            }
            final String name = thread.getLooper().getThread().getName(); // 线程名
            mHandlerCheckers.add(new HandlerChecker(thread, name, timeoutMillis));
        }
    }
  ... ...
```

``` java
public class Watchdog extends Thread {
  ... ...
	public final class HandlerChecker implements Runnable {
      ... ...
        HandlerChecker(Handler handler, String name, long waitMaxMillis) {
            mHandler = handler;
            mName = name;
            mWaitMax = waitMaxMillis;
            mCompleted = true;
        }
        public void addMonitor(Monitor monitor) {
        	// mMonitors是一个ArrayList<Monitor> mMonitors = new ArrayList<Monitor>
            // 将monitor对象添加到MonitorChecker中，在AMS中则是把AMS对象添加到此list
            mMonitors.add(monitor);
        }
      ... ...
```

AMS在构造函数中分别通过addMonitor和 addThread方法把自己添加到Monitor Checker对象中，把自己的Handler添加到Looper Checker对象中。

#### 2.3 Watchdog监测机制

Watchdog继承了Thread，也就是说本身就是一个线程，来看一下它的run()方法实现：

``` java
    @Override
    public void run() {
        boolean waitedHalf = false;
        while (true) {
            final ArrayList<HandlerChecker> blockedCheckers;
            final String subject;
            final boolean allowRestart;
            int debuggerWasConnected = 0;
            synchronized (this) {
                long timeout = CHECK_INTERVAL; // 值为30s
                // Make sure we (re)spin the checkers that have become idle within
                // this wait-and-check interval
                // 2.3.1 调度所有的HandlerChecker，给所有受监控的线程发送消息
                for(int i=0; i<mHandlerCheckers.size(); i++) {
                    HandlerChecker hc = mHandlerCheckers.get(i);
                    hc.scheduleCheckLocked();
                }

                if (debuggerWasConnected > 0) {
                    debuggerWasConnected--;
                }

                // NOTE: We use uptimeMillis() here because we do not want to increment the time we
                // wait while asleep. If the device is asleep then the thing that we are waiting
                // to timeout on is asleep as well and won't have a chance to run, causing a false
                // positive on when to kill things.
                // 2.3.2 睡眠一段时间
                long start = SystemClock.uptimeMillis();
                while (timeout > 0) {
                    if (Debug.isDebuggerConnected()) {
                        debuggerWasConnected = 2;
                    }
                    try {
                        wait(timeout); // 线程休眠且释放锁
                    } catch (InterruptedException e) {
                        Log.wtf(TAG, e);
                    }
                    if (Debug.isDebuggerConnected()) {
                        debuggerWasConnected = 2;
                    }
                    timeout = CHECK_INTERVAL - (SystemClock.uptimeMillis() - start);
                }

                // 2.3.3 检查是否有线程或者服务出了问题
                final int waitState = evaluateCheckerCompletionLocked();
                if (waitState == COMPLETED) {
                    // The monitors have returned; reset
                    waitedHalf = false;
                    continue;
                } else if (waitState == WAITING) {
                    // still waiting but within their configured intervals; back off and recheck
                    continue;
                } else if (waitState == WAITED_HALF) {
                    if (!waitedHalf) {
                        // We've waited half the deadlock-detection interval.  Pull a stack
                        // trace and wait another half.
                        ArrayList<Integer> pids = new ArrayList<Integer>();
                        pids.add(Process.myPid());
                        ActivityManagerService.dumpStackTraces(true, pids, null, null,
                                NATIVE_STACKS_OF_INTEREST);
                        waitedHalf = true;
                    }
                    continue;
                }

                // something is overdue!
                // 2.3.4 存在超时的HandlerChecker
                blockedCheckers = getBlockedCheckersLocked();
                subject = describeCheckersLocked(blockedCheckers);
                allowRestart = mAllowRestart;
            }

            // If we got here, that means that the system is most likely hung.
            // First collect stack traces from all threads of the system process.
            // Then kill this process so that the system will restart.
            // 走到这里意味着系统hung了，首先收集系统进程所有线程的stack trace，然后kill进程以重启。
            EventLog.writeEvent(EventLogTags.WATCHDOG, subject);

            ArrayList<Integer> pids = new ArrayList<Integer>();
            pids.add(Process.myPid());
            if (mPhonePid > 0) pids.add(mPhonePid);
            // Pass !waitedHalf so that just in case we somehow wind up here without having
            // dumped the halfway stacks, we properly re-initialize the trace file.
            final File stack = ActivityManagerService.dumpStackTraces(
                    !waitedHalf, pids, null, null, NATIVE_STACKS_OF_INTEREST);

            // Give some extra time to make sure the stack traces get written.
            // The system's been hanging for a minute, another second or two won't hurt much.
            // 线程休眠2秒钟以确保trace输出完毕
            SystemClock.sleep(2000);

            // 输出kernel log（dump和backtrace），尝试把error添加到dropbox
            ... ...

            // Only kill the process if the debugger is not attached.
            if (Debug.isDebuggerConnected()) {
                debuggerWasConnected = 2;
            }
            if (debuggerWasConnected >= 2) {
                Slog.w(TAG, "Debugger connected: Watchdog is *not* killing the system process");
            } else if (debuggerWasConnected > 0) {
                Slog.w(TAG, "Debugger was connected: Watchdog is *not* killing the system process");
            } else if (!allowRestart) {
                Slog.w(TAG, "Restart not allowed: Watchdog is *not* killing the system process");
            } else {
                Slog.w(TAG, "*** WATCHDOG KILLING SYSTEM PROCESS: " + subject);
                for (int i=0; i<blockedCheckers.size(); i++) {
                    Slog.w(TAG, blockedCheckers.get(i).getName() + " stack trace:");
                    StackTraceElement[] stackTrace
                            = blockedCheckers.get(i).getThread().getStackTrace();
                    for (StackTraceElement element: stackTrace) {
                        Slog.w(TAG, "    at " + element);
                    }
                }
                // 2.3.5 保存日志，判断是否需要杀掉系统进程
                Slog.w(TAG, "*** GOODBYE!");
                // 杀死SystemServer
                Process.killProcess(Process.myPid());
                System.exit(10);
            }

            waitedHalf = false;
        }
    }
```

##### 2.3.1 scheduleCheckLocked()方法

Watchdog运行后开始循环，调用每一个HandlerChecker的scheduleCheckLocked()方法：

``` java
    public final class HandlerChecker implements Runnable {
      ... ...
        public void scheduleCheckLocked() {
            if (mMonitors.size() == 0 && mHandler.getLooper().getQueue().isPolling()) {
                // ... ...
                mCompleted = true;
                return;
            }

            if (!mCompleted) {
                // we already have a check in flight, so no need
                return;
            }

            mCompleted = false;
            mCurrentMonitor = null;
            mStartTime = SystemClock.uptimeMillis();
            mHandler.postAtFrontOfQueue(this); // 给监控的线程发送消息
        }
      ... ...
```

HandlerChecker对象既要监控服务，也要监控某个线程，所以代码中要先判断mMonitors.size是否为0，如果为0则说明这个HandlerChecker没有监控服务，这时如果被监控线程的消息队列处于空闲状态（调用isIdling()检查），则说明线程运行良好，把mCompleted设为true后就可以返回了。否则先把mCompleted设为false，然后记录消息开始发送的时间到变量mStartTime中，最后调用postAtFrontOfQueue()方法给被监控的线程发送一个消息。

##### 2.3.2 定期检查 

调度完HandlerChecker给受监控的线程发送完消息后，开始定期检查是否超时，每一次的检查的间隔由常量CHECK_INTERVAL设定，为30s，调用wait()方法（线程休眠且释放锁）让WatchDog线程睡眠一段时间。

##### 2.3.3 检查线程或服务是否有问题

调用evaluateCheckerCompletionLocked()方法来检查是否有问题：

``` java
    private int evaluateCheckerCompletionLocked() {
        int state = COMPLETED;
        for (int i=0; i<mHandlerCheckers.size(); i++) {
            HandlerChecker hc = mHandlerCheckers.get(i);
            state = Math.max(state, hc.getCompletionStateLocked());
        }
        return state;
    }
```



``` java
        public int getCompletionStateLocked() {
            if (mCompleted) {
                return COMPLETED;
            } else {
                long latency = SystemClock.uptimeMillis() - mStartTime;
                if (latency < mWaitMax/2) {
                    return WAITING;
                } else if (latency < mWaitMax) {
                    return WAITED_HALF;
                }
            }
            return OVERDUE;
        }
```

根据等待时间来确认返回HandlerChecker对象的状态，

- COMPLETED表示已经完成

- WAITING和WAITED_HALF表示还在等待，但未超时

- OVERDUE表示已经超时，默认情况下timeout是1分钟，但监测对象可以通过传参自行设定，譬如PKMS的**Handler Checker**的超时是10分钟:

- ``` java
      private static final long WATCHDOG_TIMEOUT = 1000*60*10;     // ten minutes
              Watchdog.getInstance().addThread(mHandler, WATCHDOG_TIMEOUT);
  ```

  ​

##### 2.3.4 getBlockedCheckersLocked

``` java
    private ArrayList<HandlerChecker> getBlockedCheckersLocked() {
        ArrayList<HandlerChecker> checkers = new ArrayList<HandlerChecker>();
        for (int i=0; i<mHandlerCheckers.size(); i++) {
            HandlerChecker hc = mHandlerCheckers.get(i);
            if (hc.isOverdueLocked()) {
                checkers.add(hc);
            }
        }
        return checkers;
    }
```

如果超时时间到了，还有HandlerChecker处于未完成的状态(OVERDUE)，则通过getBlockedCheckersLocked()方法，获取阻塞的HandlerChecker，生成一些描述信息

##### 2.3.5 保存日志

保存日志，包括一些运行时的堆栈信息，这些日志是我们解决Watchdog问题的重要依据。如果判断需要杀掉system_server进程，则给当前进程(system_server)发送signal。

### 3. 实例分析



### 4. 总结



