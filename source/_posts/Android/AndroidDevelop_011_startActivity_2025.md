---
title: Android - Activity 应用启动流程概述
date: 2025-04-11 22:12:19
tags:
categories: Android
copyright: true
password:

---



> 详细梳理 Android 应用程序的启动流程。这是一个复杂但核心的过程，涉及到多个进程和组件的协作。
>

<!--more-->

### Android 应用启动流程概述

Android 应用程序的启动是一个多阶段、跨进程的复杂过程。当用户点击应用图标时，系统会协调多个关键组件来创建一个新的进程，加载应用代码，并初始化应用组件（通常是 Activity）。

其核心目标是：

1. **进程创建：** 为应用程序创建一个独立的 Linux 进程。
2. **VM 初始化：** 在新进程中初始化 ART/Dalvik 虚拟机。
3. **代码加载：** 加载应用程序的 `.apk` 文件和相关代码。
4. **组件启动：** 实例化并启动请求的应用程序组件（如 Activity）。

### 参与者

在应用启动过程中，主要有以下几个关键参与者：

1. **Zygote 进程：**
   - Android 系统中的第一个 Java 进程。
   - 预加载了大部分 Android 框架类和资源，并创建了一个 ART/Dalvik 虚拟机实例。
   - 作为所有新应用程序进程的**孵化器**。当需要启动新应用时，Zygote 会通过 `fork` 自身来快速创建新进程，从而实现“写时复制”（Copy-on-Write）优化，提高启动速度和内存效率。
2. **System Server 进程：**
   - Android 系统的核心进程，由 Zygote fork 出来。
   - 运行着所有核心系统服务，如 `ActivityManagerService (AMS)`、`PackageManagerService (PMS)`、`WindowManagerService (WMS)` 等。这些服务通过 Binder IPC 提供系统级功能。
3. **ActivityManagerService (AMS)：**
   - `System Server` 进程中的核心服务，负责管理所有应用程序的生命周期、进程管理、Activity 栈管理、任务管理等。
   - 它是应用启动的**中央协调者**。
4. **Launcher (桌面应用)：**
   - 用户点击应用图标的入口。它是一个特殊的 Android 应用。
   - 当用户点击图标时，它会向 `AMS` 发送一个启动应用的请求。
5. **Application Process (应用程序进程)：**
   - 每个 Android 应用程序运行在自己的独立 Linux 进程中。
   - 这个进程由 Zygote fork 出来，并包含了应用的 ART/Dalvik VM 和应用自身的所有代码。
6. **ActivityThread (应用程序主线程对象)：**
   - 每个应用程序进程的主线程（UI 线程）上运行的 Java 对象。
   - 负责管理进程内所有 Activity、Service、BroadcastReceiver 的生命周期，并处理 UI 事件。
   - 它内部包含一个 `Looper` 和 `Handler`，用于处理消息队列。

### 应用启动流程（从点击图标开始）

以下是用户点击桌面应用图标时，一个典型的应用启动流程：

1. **用户点击应用图标（Launcher）**
   - 用户在 Launcher（桌面应用）上点击一个应用的图标。
   - Launcher 通过 Binder IPC 向 `ActivityManagerService (AMS)` 发送一个启动 Activity 的请求（通常是 `startActivity()` 调用）。这个请求包含了要启动的 Activity 的 `Intent` 信息。
2. **AMS 接收并处理启动请求（System Server 进程）**
   - `AMS` 接收到 `startActivity()` 请求。
   - 它首先进行一系列检查：权限检查、目标 Activity 是否存在、是否需要创建新的任务栈等。
   - `AMS` 判断目标 Activity 所属的应用程序进程是否已经存在：
     - **如果进程已存在：** `AMS` 会直接通知该进程（通过 Binder IPC）去启动目标 Activity。
     - **如果进程不存在（首次启动或进程已被杀死）：** `AMS` 需要创建一个新的应用程序进程。
3. **AMS 请求 Zygote 创建新进程（System Server -> Zygote）**
   - 如果需要创建新进程，`AMS` 会通过 Socket IPC 向 `Zygote` 进程发送一个“fork 新进程”的请求。这个请求包含了新进程的包名、UID、需要启动的 Activity 等信息。
4. **Zygote 创建并初始化新进程（Zygote 进程）**
   - `Zygote` 进程接收到请求后，会执行 `fork()` 系统调用，创建一个新的子进程。这个子进程是 `Zygote` 进程的副本，继承了 `Zygote` 预加载的所有类和资源，以及一个已经初始化好的 ART/Dalvik 虚拟机。
   - `Zygote` 还会执行一些初始化工作，例如设置新进程的 UID/GID、配置 Selinux 上下文等。
   - 然后，`Zygote` 子进程会执行 `ActivityThread.main()` 方法。这是应用程序进程的入口点。
5. **应用程序进程初始化（Application Process）**
   - `ActivityThread.main()` 方法是新应用程序进程的入口。它会：
     - 创建并初始化 `Looper`（消息循环）和 `Handler`（消息处理器），用于处理主线程的消息队列。
     - 创建 `ActivityThread` 实例本身。
     - 通过 Binder IPC 向 `AMS` 发送一个“进程已启动并准备就绪”的信号，并建立起与 `AMS` 的 Binder 通信通道。
6. **AMS 通知应用程序进程启动 Activity**
   - 一旦 `AMS` 收到应用程序进程的“准备就绪”信号，它就会向该应用程序进程发送一个 Binder 请求，通知其启动目标 Activity。这个请求包含 Activity 的信息（如类名、Intent、配置等）。
7. **ActivityThread 启动 Activity 并执行生命周期方法**
   - 应用程序进程中的 `ActivityThread` 接收到 `AMS` 的启动 Activity 请求。
   - `ActivityThread` 在主线程中：
     - 加载目标 Activity 的类。
     - 通过反射创建 Activity 实例。
     - 为 Activity 创建 `Context`。
     - 调用 Activity 的生命周期方法：`onCreate()` -> `onStart()` -> `onResume()`。
     - 将 Activity 的根视图添加到 `WindowManagerService` 中，使其可见。
8. **Activity 显示到屏幕上**
   - 一旦 `Activity` 的 `onResume()` 方法执行完毕，其界面就会被渲染并显示在屏幕上，用户可以开始与应用交互。

### `Application` 和 `Activity` 的先后顺序及关系

在 Android 应用进程被创建并初始化后，在任何 `Activity` 组件被启动之前，`Application` 类会首先被实例化。

#### 1. 先后顺序

在应用程序进程中，当 `ActivityThread.main()` 方法执行时，它会按以下核心顺序进行：

1. **实例化 `Application` 对象：**
   - `ActivityThread` 会首先通过反射机制实例化你应用中定义的 `Application` 子类（如果没有定义，则使用默认的 `android.app.Application`）。
   - 紧接着，会调用这个 `Application` 对象的 **`onCreate()`** 方法。这个方法是整个应用程序进程的入口点，用于进行应用级别的全局初始化。
2. **实例化并启动第一个 `Activity` 对象：**
   - 在 `Application.onCreate()` 方法执行完毕后，`ActivityThread` 才会根据 `AMS` 的请求，去实例化并启动要显示给用户的第一个 `Activity`。
   - 然后，会调用这个 `Activity` 对象的生命周期方法：`onCreate()` -> `onStart()` -> `onResume()`。

**总结顺序：** `Application` 实例化 -> `Application.onCreate()` -> `Activity` 实例化 -> `Activity.onCreate()` -> `Activity.onStart()` -> `Activity.onResume()`

#### 2. 它们之间的关系

`Application` 和 `Activity` 都代表了 Android 应用中的重要组件，并且都继承自 `Context`，但它们扮演着不同的角色：

- **`Application` (应用全局上下文)：**
  - **生命周期：** 与应用程序进程的生命周期一致。在应用程序进程的整个生命周期中，`Application` 对象只会被创建**一次**。当进程启动时它被创建，当进程被系统销毁时它才会被销毁。
  - **作用：** 作为整个应用程序的**全局上下文**。它通常用于存放和初始化**应用级别的全局状态**、共享资源、第三方库的初始化等，这些初始化只需要执行一次，并且需要在任何 Activity 或其他组件启动之前完成。
  - **获取方式：** 在 `Activity` 或 `Service` 中可以通过 `getApplication()` 方法获取 `Application` 对象。
- **`Activity` (屏幕/UI 组件上下文)：**
  - **生命周期：** 与用户界面的生命周期绑定。一个应用可以有多个 Activity，并且它们可以根据用户的交互和导航，在应用进程中被**多次创建和销毁**。
  - **作用：** 代表应用的一个**单一的、具有用户界面的屏幕**。它负责用户交互、UI 布局的显示与管理。
  - **上下文：** `Activity` 自身也是一个 `Context`（Activity Context），它包含了应用程序上下文的信息，同时还包含了关于当前 Activity 的主题、资源、特定 UI 组件等信息。它的生命周期比 Application Context 更短。

**简要类比：**

你可以把 `Application` 想象成一座**建筑（整个应用程序）**，而 `Activity` 则是这座建筑里的**不同房间（不同的用户界面屏幕）**。

- 当你第一次进入这座建筑时（应用进程启动），首先要做的可能是打开建筑的总电源（`Application.onCreate()`），初始化整个建筑的公共设施。
- 之后，你才能进入某个房间（`Activity.onCreate()`），打开房间的灯（`Activity.onStart()`），并开始在房间里活动（`Activity.onResume()`）。
- 你可以从一个房间进入另一个房间（启动新的 Activity），或者离开一个房间但仍在建筑内（Activity 被销毁但 Application 依然存在）。

这种分层和生命周期的设计，使得开发者可以更好地管理应用资源和状态，将全局性操作放在 `Application` 中，将与特定 UI 相关的操作放在 `Activity` 中。

### 关键概念总结

- **Binder IPC：** Android 框架中用于进程间通信的核心机制。AMS、Launcher、应用程序进程之间都通过 Binder 进行通信。
- **Zygote 的作用：** 通过 `fork` 自身快速创建新进程，实现代码共享和内存效率优化。
- **Main Thread (UI Thread) 和 Looper/Handler：** 每个应用程序进程都有一个主线程，它负责处理用户界面事件和所有组件的生命周期回调。`Looper` 和 `Handler` 机制是主线程能够处理消息队列的关键。
- **AMS 的核心地位：** `ActivityManagerService` 是整个应用启动和生命周期管理的“中央大脑”，负责协调所有进程和组件的行为。

理解这个流程对于 Android 开发者至关重要，它能帮助你更好地理解应用性能优化、启动时间、内存管理以及 Activity 生命周期管理等方面的问题。
