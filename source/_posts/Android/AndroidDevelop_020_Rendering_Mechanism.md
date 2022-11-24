---
title: Android - 渲染机制分析
date: 2022-05-20 23:11:45
tags:
categories: Android
copyright: true
password:
---

>Android 渲染机制分析，代码基于 Android 12

<!--more-->



requestLayout - scheduleTraversals - mChoreographer.postCallback - scheduleFrameLocked - scheduleVsyncLocked - DisplayEventReceiver.scheduleVsync - nativeScheduleVsync

nativeScheduleVsync 在底层通过 requestNextVsync 去请求下一个 Vsync，接收 Vsync 信号后回调到 DisplayEventReceiver.onVsync 方法中，在其中发送了一个 Handler 消息到消息队列，接到消息后执行 DisplayEventReceiver.run()，在 run() 中调用 doFrame() - doCallBacks() - CallbackRecord.run() - TraversalRunnable.run() - doTraversal() - performTraversals()，至此开始绘制流程 performMessure - performLayout - performDraw；



详细流程后续更新；



### Surface与Canvas的区别在哪里

Surface和Canvas都有画布的意思

但实际上，Surface才是真正和屏幕管理器打交道的画布

Canvas是对画布操作细节的封装，它更多的是和View、用户打交道

当Canvas完成一轮绘制后，会将绘制结果提交到Surface的缓冲区中，然后由Surface交给屏幕管理器绘制

### Surface与Canvas是如何关联的

每个Window对应一个Surface，每个Surface对应一块屏幕缓冲区

SurfaceFlinger按照z轴顺序，将所有Surface的内容逐个绘制出来，就形成了最终的屏幕内容

ViewRootImpl每次执行draw方法时，都会通过对应的Surface创建一个新的Canvas，并指定一个绘制区域DirtyRect

DecorView在指定的Canvas和DirtyRect上，完成当前轮的绘制工作

ViewRootImpl再通过Surface，将Canvas的绘制结果提交到屏幕管理器，同时释放Canvas

当收到新一轮的绘制或刷新指令时，ViewRootImpl会再创建一个新的Canvas，重复以上工作

由此我们可以看出，Surface只有一个，而Canvas有多个，Canvas负责具体细节，而Surface直接和屏幕管理器打交道
[参考](https://blog.csdn.net/u013718730/article/details/120753180)
