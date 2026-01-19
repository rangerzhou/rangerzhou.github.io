---
title: Android - Input ANR
date: 2024-06-22 22:15:36
tags:
categories: Android
copyright: true
password:
published: false
---

> Android Input 系统 ANR 源码分析；
>
> 源码版本：android-15-0.0_r23

<!--more-->

------

# 三个队列介绍

- IQ(InboundQueue)：InputReader 读取原始事件后的入队（所有输入事件的 “系统总收件箱”）
    - 是 InputDispatcher 全局唯一的 “总接收队列”，事件是 InputReader 加工后的 `EventEntry`（非原始硬件事件），入队后唤醒 InputDispatcher 线程处理

- OQ(OutboundQueue)：InputDispatcher 已入队，等待通过 socketpair 发送给 APP 的队列（单个 APP 的 “待发送件箱”）
    - 与单个 APP 的 `Connection` 绑定（每个 APP 专属），事件是 `DispatchEntry`，等待 InputDispatcher 主动发起 `socketpair` 发送流程

- WQ(WaitQueue)：已发送到 APP，但是还没有收到 APP 回调 finish 的队列（单个 APP 的 “已发出但未签收件箱”（签收 = APP 回调 finish））
    - 同样绑定 APP 的 `Connection`，事件发送后立即转入此队列，系统会为队列中事件启动 ANR 超时计时；APP 回调 `finish` 本质是调用 `InputDispatcher` 的 `finishInputEvent`，触发事件从 WQ 移除

**IQ 是 InputDispatcher 进程内唯一的，所有 APP 的输入事件都先进入 IQ；而 OQ/WQ 是每个 APP 的 `Connection` 实例下的专属队列，不同 APP 的 OQ/WQ 相互隔离。**

# Input ANR 发生原理

- InputReader 读取原始事件放入 IQ，唤醒 InputDispatcher，InputDispatcher 把它放入 OQ，准备通过 socket 发送给 APP，把交付给 APP 的事件放入 WQ，APP 处理完毕后回调 finish 后把 WQ 对应的事件移除，如果 WQ 里的事件超过5秒还没有处理，就报 ANR；
- `onCreate()` 中 sleep 10 秒钟不会发生 ANR（不管 sleep 时是否触摸都不会 ANR），因为在 `onCreate()` 阶段，InputDispatcher 和应用之间的 connection 还没有建立，所以不在 ANR 发生的流程中，就不会发生 ANR 了；
- 在 onTouchEvent() 中 sleep 10 秒钟也不会发生 ANR，除非在 sleep 的过程中触摸了屏幕，发生了 input 事件，才会导致 WQ 中的事件超过 5 秒未处理报 ANR；

# Focused Window ANR 场景

``` shell
# ANR 常见类型
Input dispatching timed out(Application does not have a focused window)
```

这类 ANR 的 **本质不是应用卡死**，而是 InputDispatcher 在等待一个“应该接收输入的窗口”，但 WMS 在超时时间内始终没有提供一个“可聚焦且可接收输入的 WindowState”。也就是说，

- 没有焦点窗口 FocusedWindow 导致

- 或者 **焦点窗口存在，但不满足 input 条件**

- InputDispatcher 无法完成 target window 的选择

- 超时 → ANR

- Focused ANR 几乎只会发生在 key 事件的派发，触摸事件不会产生，因为 key 事件找不到焦点窗口会立即触发 ANR，而触摸事件在 DOWN 阶段通过 `findTouchedWindow()` 找不到窗口只会丢弃事件，不会触发 ANR（但在已建立 touch focus 的情况下，后续触摸事件仍可能进入等待并触发 InputDispatching ANR，只是其 reason 通常不是“no focused window”），可以通过 events 日志看出：

``` shell
# key_back_press 按键事件
sysui_multi_action: [777,802,444,key_back_press,803,1]
am_anr:xxx
```

- **Key 事件**：系统级关键输入（返回键、Home键、音量键）
    - 必须要有接收者
    - 无法确定目标 = 系统状态异常
- **Touch 事件**：应用级交互
    - 允许无目标（点到状态栏、导航栏外）
    - 可能是正常情况（点击区域无控件）

### 查看焦点窗口命令

```shell
# 两种方式
dumpsys window | grep mFocused
dumpsys window lastanr # 查看 ANR 信息
dumpsys SurfaceFlinger
dumpsys input # 如果发生 ANR，以这个命令为准
```

dumpsys window 

- mCurrentFocus：指明 window，focused ANR 的时候，就是因为这里为 null
- mFocusedApp：指明  ActivityRecord，不一定指向同一个进程，比如下拉通知栏的时候 dumpsys window

- LAST ANR：显示 ANR 相关信息

dumpsys SurfaceFlinger

- 查看 HWC layers，后面有标记 [*] 的是焦点

dumpsys input

- FocusedApplications
- FocusedWindows
- last ANR：ANR 信息

### 分析方法

查看 input_focus 信息

``` shell
logcat -b events | grep input_focus
```

- Focus request
- Focus leaving：wms 发了一个请求焦点
- Focus entering：说明已经有焦点了，如果发生 ANR 时出现这个日志，可以考虑查看是否 input 那边有问题，如果没有这条日志，考虑 WMS/SurfaceFlinger 的问题



分析流程

- 确认 ANR reason
- `dumpsys window` 看 mCurrentFocus
- 查目标 WindowState 是否存在 / focusable
- 查是否有 NOT_FOCUSABLE 窗口覆盖
- 查 Activity 生命周期是否已结束
- 查是否在 transition / animation 中
- 多 display 下查 displayId 是否匹配



[酷派Android ANR|原理解析及常见案例](https://mp.weixin.qq.com/s/40T6ITvJNWR8F42530k4DA?poc_token=HExVbmmjqJIJt3A3Io1TdIZDwsDaJJBXpPS8grUk)

[Android ANR|原理解析及常见案例 - 酷派技术团队 #20](https://github.com/cyrushine/bookmark/issues/20)
