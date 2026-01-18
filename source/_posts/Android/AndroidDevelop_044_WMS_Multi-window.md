---
title: Android - 车载桌面多窗口
date: 2024-08-16 23:22:25
tags:
categories: Android
copyright: true
password:
published: false
---

> WMS 车载桌面多窗口。

<!--more-->

# multi-window 生命周期

TaskFragment.geVisibility()

Task 变换之后，会触发 resumeTopActivity()，它又会触发 pause 相关方法，会对 DefaultTaskDisplayArea 树所有节点进行遍历，看 Task 是应该 pause 还是 resume

- 当遍历顶部的 Task，它就是 resume 的状态
- 遍历其他节点 Task，如果在它的上面有 `WINDOWING_MODE_FULLSCREEN` 的，则把状态设置为 INVISIBLE，
- 如果在它的上面有 MULTI_WINDOW 类型的，以及重写了xxx，就设置为 VISIBLE

根据上面的知识，可以得知为什么 CarLauncher 和地图组件可以同时都是 Resume 的状态了。



# 核心总结

- **TaskView 是 CarLauncher 中用于嵌入外部 Activity 的关键组件，本质是一个 SurfaceView。**
- **TaskViewManager 初始化时注册 ShellTaskOrganizer，与 system_server 建立 Task 回调通道。**
- **Activity 启动时通过 launchCookie 实现 Task 与 TaskView 的精准绑定。**
- **Task 启动后 system_server 回调 onTaskAppeared，TaskView 将 Task 的 surface 重新 reparent 到自身 Surface 下，实现真正的“应用内嵌应用”。**
- **整个机制依赖 WindowManager、ShellTaskOrganizer、SurfaceControl 等核心系统组件协作。**



Android 16 中 TaskView 不再由 CarLauncher 直接使用 TaskView，而是由 CarSystemUI 注入 TaskView

1. CarLauncher 只负责“留一个坑”

- 布局里放一个卡片区域（占位 View / Fragment）。
- 不再直接 new TaskView，也不再直接调用 `TaskView.startActivity()`。

2. CarSystemUI 负责“在这个坑里塞 TaskView”

- CarSystemUI 通过 overlay/host 机制拿到 CarLauncher 的卡片占位。
- 创建 TaskView（在 WM Shell 里）。
- 把 TaskView 的 Surface attach 到 CarLauncher 的卡片区域上。

3. CarSystemUI 决定“启动哪个导航 Activity”

- 通过配置 / CarActivityManager / CarLauncherUtils 等拿到导航 Activity 的 `Intent`。
- 调用 TaskView 的 `startActivity()`，传入 PendingIntent + ActivityOptions。

4. system_server 创建 Task → WM Shell / TaskView 接管

- AMS 创建 Task，WMS/WM Shell 为其创建 Task leash。
- TaskAppeared 回调到 WM Shell / TaskView。
- TaskView 把 Task leash reparent 到自己的 Surface 下。

## 模块关系图

``` mermaid
flowchart TD

    %% =======================
    %% CarLauncher 层
    %% =======================
    subgraph CarLauncher["CarLauncher (App)"]
        subgraph Container["CarTaskViewContainer"]
            CarTaskView["CarTaskView\n(SurfaceView)"]
        end
    end

    %% =======================
    %% 中间管理层
    %% =======================
    TaskViewManager["TaskViewManager"]
    ShellTaskOrganizer["ShellTaskOrganizer\n(client side)"]

    %% =======================
    %% system_server 层
    %% =======================
    subgraph SystemServer["system_server / WM"]
        TaskOrganizerController["TaskOrganizerController\n(system_server)"]
        ATMS["ActivityTaskManagerService"]
        TargetActivity["Target Activity\n(e.g., Maps/Nav)"]
    end

    %% =======================
    %% 关系连线
    %% =======================

    CarLauncher --> TaskViewManager
    TaskViewManager --> CarTaskView

    TaskViewManager --> ShellTaskOrganizer
    ShellTaskOrganizer --> TaskOrganizerController

    TaskOrganizerController --> ShellTaskOrganizer
    ShellTaskOrganizer --> TaskViewManager

    TaskViewManager --> ATMS
    ATMS --> TargetActivity

    TargetActivity --> TaskOrganizerController

    %% Surface reparenting
    TaskOrganizerController --> CarTaskView

```

- **CarLauncher → TaskViewManager → CarTaskView**
    - 表示 CarLauncher 通过 TaskViewManager 创建并管理 TaskView。
- **TaskViewManager ↔ ShellTaskOrganizer ↔ system_server**
    - 是 Task 生命周期事件的回调链路。
- **ATMS → TargetActivity → TaskOrganizerController**
    - 表示 Activity 启动后由 system_server 回调 Task 出现事件。
- **TaskOrganizerController → CarTaskView**
    - 表示 TaskView 在 TaskAppeared 后执行 Surface reparent，将 Activity 内嵌到 CarLauncher。

## 时序图

``` mermaid
sequenceDiagram
    autonumber

    participant CL as CarLauncher
    participant TVM as TaskViewManager
    participant TV as CarTaskView
    participant STO as ShellTaskOrganizer<br/>(client)
    participant TOC as TaskOrganizerController<br/>(system_server)
    participant ATMS as ActivityTaskManagerService
    participant ACT as Target Activity

    %% 初始化阶段
    CL->>TVM: setUpTaskView()
    TVM->>TV: createTaskView()
    TV->>STO: registerOrganizer()

    %% 启动 Activity
    CL->>TV: startActivityInTaskView()
    TV->>TV: prepareActivityOptions()<br/>create launchCookie
    TV->>ATMS: startActivity(PendingIntent + ActivityOptions)

    %% system_server 处理启动
    ATMS->>ACT: launch Activity
    ACT->>TOC: report TaskAppeared(launchCookie)

    %% 回调到客户端
    TOC->>STO: onTaskAppeared(taskInfo, leash, launchCookie)
    STO->>TVM: dispatchTaskAppeared()
    TVM->>TV: onTaskAppeared()

    %% Surface 嵌入
    TV->>TV: reparent(task.leash → SurfaceView)
    TV->>CL: notifyTaskCreated()

```



