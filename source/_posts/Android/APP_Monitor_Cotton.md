---
title: Android APP 层面监控卡顿
copyright: true
date: 2022-10-28 16:18:21
tags:
categories: Android
password: zr.
---

> Android 主线程更新 UI，如果界面 1 秒钟刷新少于 60 次，即 FPS 小于 60，用户就会产生卡顿感觉；

<!--more-->

### 利用 UI 线程的 Looper 打印的日志匹配

Android 使用消息机制进行 UI 更新，UI 线程有个 Looper，在其 loop 方法中会不断取出 message，调用其绑定的 Handler 在 UI 线程执行。如果在 handler 的 dispatchMesaage 方法里有耗时操作，就会发生卡顿；

``` java
// Looper.java
   private static boolean loopOnce(final Looper me,
           final long ident, final int thresholdOverride) {
       final Printer logging = me.mLogging;
       if (logging != null) {
           logging.println(">>>>> Dispatching to " + msg.target + " "
                   + msg.callback + ": " + msg.what);
      }
           msg.target.dispatchMessage(msg);
       if (logging != null) {
           logging.println("<<<<< Finished to " + msg.target + " " + msg.callback);
      }
```

只要检测 `msg.target.dispatchMessage(msg)` 的执行时间，就能检测到部分 UI 线程是否有耗时的操作，loop() 中调用 loopOnce()，在 dispatchMessage() 前后有两个 logging.println 函数，如果设置了 logging，会分别打印出日志，根据两次 log 日志的时间差值来计算 dispatchMessage 的执行时间，设置一个阈值，判断是否发生卡顿。

``` java
// Looper.java
   private Printer mLogging;
   public void setMessageLogging(@Nullable Printer printer) {
       mLogging = printer;
  }
// Printer.java
public interface Printer {
   void println(String x);
}
```

`Looper` 提供了 `setMessageLogging(@Nullable Printer printer)` 方法，所以我们可以自己实现一个 Printer，再通过 `setMessageLogging()` 方法传入即可。

``` java
public class BlockCanary {
   public static void install() {
       LogMonitor logMonitor = new LogMonitor();
       Looper.getMainLooper().setMessageLogging(logMonitor);
  }
}
public class LogMonitor implements Printer {
   // 卡顿阈值
   private long mBlockThresholdMillis = 3000;
   //采样频率
   private long mSampleInterval = 1000;
   private Handler mLogHandler;
  ...
}
// 使用
```

### Choreographer.FrameCallback

Android 系统每隔 16ms 发出 VSYNC 信号，来通知界面进行重绘、渲染，每一次同步的周期约为 16.6ms，代表一帧的刷新频率。通过 Choreographer 类设置它的 FrameCallback 函数，当每一帧被渲染时会触发回调 FrameCallback.doFrame (long frameTimeNanos) 函数。frameTimeNanos 是底层 VSYNC 信号到达的时间戳。

``` java
public class ChoreographerHelper {
   public static void start() {
       if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
           Choreographer.getInstance().postFrameCallback(new Choreographer.FrameCallback() {
               long lastFrameTimeNanos = 0;
               @Override
               public void doFrame(long frameTimeNanos) {
                   //上次回调时间
                   if (lastFrameTimeNanos == 0) {
                       lastFrameTimeNanos = frameTimeNanos;
                       Choreographer.getInstance().postFrameCallback(this);
                       return;
                  }
                   long diff = (frameTimeNanos - lastFrameTimeNanos) / 1_000_000;
                   if (diff > 16.6f) {
                       //掉帧数
                       int droppedCount = (int) (diff / 16.6);
                  }
                   lastFrameTimeNanos = frameTimeNanos;
                   Choreographer.getInstance().postFrameCallback(this);
              }
          });
      }
  }
}
```

通过 ChoreographerHelper 可以实时计算帧率和掉帧数，实时监测 App 页面的帧率数据，发现帧率过低，还可以自动保存现场堆栈信息；

Looper 比较适合在发布前进行测试或者小范围灰度测试然后定位问题，ChoreographerHelper 适合监控线上环境的 app 的掉帧情况来计算 app 在某些场景的流畅度然后有针对性的做性能优化。