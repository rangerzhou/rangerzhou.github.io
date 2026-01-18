---
title: Android - 分屏
date: 2024-08-16 23:22:25
tags:
categories: Android
copyright: true
password:
published: false
---

> WMS 分屏。

<!--more-->

TaskView：最近任务列表里看到的那一张张 App 卡片

FloatingTaskView：TaskView 的“可动画副本”，用于分屏动画，不是实际界面

- 点击 Split Top → 上半屏稳定显示的是 FloatingTaskView
- 选择下半屏应用 → 上下屏都是 FloatingTaskView
- 上下半屏稳定显示的那一刻（动画结束）
    - FloatingTaskView 被销毁（remove）
    - TaskView 被恢复为 VISIBLE（但用户看不到），此时 RecentsView 已经被隐藏，用户已经进入真正的分屏界面（由 SystemUI/WM Shell 渲染），TaskView 虽然恢复，但不在屏幕上
- 真正显示在屏幕上的，是系统级分屏界面，是 SystemUI / WM Shell 创建的真实分屏布局（两个 Activity 的 Surface）

# Launcher 部分

Android T 的分屏流程被重构为 **Launcher 负责动画与选择，SystemUI/WM Shell 负责真正的分屏创建**。

当用户在 Recents 中点击 “Split top” 时，Launcher 会：

1. **创建 FloatingTaskView**，作为 TaskView 的可动画副本
2. **播放上屏动画**，把第一个任务移动到上半屏 placeholder
3. 进入 **SplitSelect 状态**，提示用户选择第二个应用

当用户点击第二个 TaskView：

1. Launcher 创建第二个 FloatingTaskView
2. 播放上下屏合并动画
3. 隐藏原 TaskView，展示 placeholder

动画结束后，Launcher 调用 **SplitSelectStateController.launchSplitTasks**，把两个任务交给 **WM Shell**。 WM Shell 使用 **WindowContainerTransaction** 完成 task reparent、bounds 设置，最终由 **system_server → WM** 执行真正的分屏。

一句话总结： **Launcher 负责“看得见的动画”，SystemUI/WM Shell 负责“真正的分屏”。**

时序图

``` mermaid
sequenceDiagram
    participant User
    participant TaskView
    participant RecentsView
    participant SplitSelectCtrl as SplitSelectStateController
    participant SysUI as WM Shell / SystemUI
    participant WM as WindowManager

    User ->> TaskView: 点击 Split Top
    TaskView ->> RecentsView: initiateSplitSelect()
    RecentsView ->> RecentsView: 创建 FloatingTaskView\n播放上屏动画
    RecentsView ->> SplitSelectCtrl: enterSplitSelect()

    User ->> TaskView: 点击第二个 Task
    TaskView ->> RecentsView: confirmSplitSelect()
    RecentsView ->> SplitSelectCtrl: setSecondTask()
    RecentsView ->> RecentsView: 上下屏动画

    RecentsView ->> SplitSelectCtrl: launchSplitTasks()
    SplitSelectCtrl ->> SysUI: requestSplit(WCT)
    SysUI ->> WM: applyTransaction()
    WM ->> User: 分屏完成

```



模块关系图

``` mermaid
flowchart TD

    subgraph Launcher["Launcher / RecentsView"]
        TV["TaskView"]
        RTV["RecentsView"]
        FTV["FloatingTaskView"]
        SSC["SplitSelectStateController"]
    end

    subgraph SystemUI["SystemUI / WM Shell"]
        Shell["SplitScreenController"]
        WCT["WindowContainerTransaction Builder"]
    end

    subgraph SystemServer["system_server / WM"]
        ATMS["ActivityTaskManagerService"]
        WMService["WindowManagerService"]
    end

    TV --> RTV
    RTV --> SSC
    SSC --> Shell
    Shell --> WCT
    WCT --> WMService
    WMService --> ATMS

```











# SystemUI 部分

当 Launcher 完成分屏选择动画后，会通过 **SystemUiProxy** 调用 SystemUI 的 `startTasksWithLegacyTransition()`。 SystemUI 内部的 **ISplitScreenImpl** 接收到 Binder 调用后，会切到主线程执行 **StageCoordinator** 的分屏启动逻辑。

StageCoordinator 首先初始化 **SplitLayout**，创建分割线 Surface，并根据当前屏幕方向计算上下（或左右）两个 Stage 的 bounds。 随后构建一个 **WindowContainerTransaction**，在其中设置：

- 两个 RootTask 的 bounds
- smallestScreenWidthDp
- RootTask 的 reorder
- 启动两个任务（startTask）

最后通过 TaskOrganizer 将 WCT 提交给 **system_server**，由 WindowManager 执行 reparent、bounds 设置和 Activity 启动，最终形成真正的分屏界面。

一句话总结： **Launcher 做动画，SystemUI 构建 WCT，system_server 执行真正的分屏。**



时序图

``` mermaid
sequenceDiagram
    participant Launcher
    participant SystemUiProxy
    participant ISplitScreenImpl as ISplitScreenImpl(SystemUI)
    participant StageCoordinator
    participant SplitLayout
    participant WCT as WindowContainerTransaction
    participant WM as system_server/WM

    Launcher ->> SystemUiProxy: startTasksWithLegacyTransition()
    SystemUiProxy ->> ISplitScreenImpl: Binder 调用
    ISplitScreenImpl ->> StageCoordinator: startTasksWithLegacyTransition()

    StageCoordinator ->> SplitLayout: init() 创建分割线 Surface
    StageCoordinator ->> SplitLayout: setDivideRatio() / updateBounds()

    StageCoordinator ->> WCT: 构建 WCT\n- setBounds\n- reorder\n- startTask
    WCT ->> WM: applyTransaction()

    WM ->> WM: 执行 task reparent / bounds 设置
    WM ->> Launcher: 分屏完成（进入真实分屏界面）

```



# system_server 部分

主要工作

- 处理 Change：applyWindowContainerChange()
    - 上/下屏 Task 的 bounds 应用
    - configuration 更新
- 处理 HierarchyOp（关键）
    - REORDER：置顶分屏 RootTask，确保分屏容器显示在最前。
    - LAUNCH_TASK：启动上下屏任务
        - 查找 Task
        - 根据 launchOptions 找到分屏 RootTask，把分屏的 RootTask 放到最前台并展示出来
        - 将 Activity 的 Task **reparent** 到 MainStage / SideStage（挂载到上下分屏对应的 Task 下面）

SystemUI 构建好 WindowContainerTransaction 后，会交给 system_server 的 WindowOrganizerController 处理。 system_server 首先解析所有 Change，通过 `applyWindowContainerChange()` 将分屏 bounds 写入 Task 的 override configuration。 然后解析 HierarchyOp：REORDER 会把分屏 RootTask 置顶；LAUNCH_TASK 会调用 `startActivityFromRecents()`。 在启动任务时，`anyTaskForId()` 会完成关键的 reparent，把两个任务挂到 MainStage 和 SideStage。 最后通过 `moveTaskToFrontLocked()` 启动 Activity，形成真正的分屏结构树。

一句话总结： **SystemUI 负责构建 WCT，system_server 负责执行 WCT，最终完成 reparent、bounds 设置和任务启动，形成真正的分屏。**

时序图

``` mermaid
sequenceDiagram
    participant SystemUI as SystemUI / StageCoordinator
    participant WCT as WindowContainerTransaction
    participant WOC as WindowOrganizerController
    participant WC as WindowContainer
    participant WM as WindowManagerService
    participant ATMS as ActivityTaskManagerService

    SystemUI ->> WOC: applyTransaction(WCT)
    WOC ->> WOC: 遍历 Changes
    WOC ->> WC: applyWindowContainerChange()\n应用 bounds / config

    WOC ->> WOC: 遍历 HierarchyOps
    WOC ->> WM: applyHierarchyOp(REORDER)\nRootTask 置顶
    WOC ->> ATMS: applyHierarchyOp(LAUNCH_TASK)\nstartActivityFromRecents()

    ATMS ->> ATMS: anyTaskForId()\nreparent 到分屏 RootTask
    ATMS ->> ATMS: moveTaskToFrontLocked()\nresume / focus

    ATMS ->> WM: 完成分屏结构树\n(MainStage / SideStage)

```

