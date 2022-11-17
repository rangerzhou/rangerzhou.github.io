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
