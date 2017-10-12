---
title: Watchdog机制
copyright: true
date: 2017-10-12 10:01:06
tags: Watchdog
categories: Frameworks
password:
---

### 1. 概述





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

- Monitor Checker：用于检查是Monitor对象可能发生的死锁, AMS, PKMS, WMS等核心的系统服务都是Monitor对象。
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
        mMonitorChecker = new HandlerChecker(FgThread.getHandler(),
                "foreground thread", DEFAULT_TIMEOUT);
        mHandlerCheckers.add(mMonitorChecker);
        // Add checker for main thread.  We only do a quick check since there
        // can be UI running on the thread.
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



#### 2.3 Watchdog监测机制



### 3. 实例分析



### 4. 总结



