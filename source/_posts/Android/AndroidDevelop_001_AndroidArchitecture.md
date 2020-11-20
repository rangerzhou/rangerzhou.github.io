---
title: Android 底层学习系列（1）-Android 平台架构
date: 2020-10-14 14:31:01
tags:
categories: Android
copyright: true
password:
---

>
>
>Android 平台架构

<!--more-->

### Android 平台架构

Android 是一种基于 Linux 的开放源代码软件栈，为各类设备和机型而创建。

#### 嵌入式 Linux 系统软件架构

一般情况下嵌入式 Linux 系统中的软件主要分为以下几部分：

- 引导加载程序：包括固化在固件（firmware）中的 boot 代码(可选)，和 Boot Loader 两大部分。

  内部固化 ROM 是厂家在芯片生产时候固化的，作用基本上是引导Boot Loader

- Linux kernel 和 drivers，特定于嵌入式板子的定制内核、内核的启动参数以及外围硬件设备驱动程序。

- 文件系统。包括根文件系统和建立于Flash内存设备之上的文件系统（EXT4、UBI、CRAMFS 等等）。它是提供管理系统的各种配置文件以及系统执行用户应用程序的良好运行环境的载体。

- 应用程序。特定于用户的应用程序。

#### Android 软件堆栈

[下图](https://developer.android.com/guide/platform?hl=zh-cn) 所示为 Google 提供的 Android 平台的主要组件图：

![Android 堆栈](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/android_architecture.png)

在上图中，Google 把 Android 分成了5层架构：

- Linux 内核
- 硬件抽象层（HAL）
- Android Runtime + 原生 C/C++ 库
- Java API 框架
- 系统应用层

#### 系统启动架构

以进程的视角、分层的架构展示 Android 系统启动架构：

![系统启动架构图](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/android-boot.jpg)

对于 Android 整个启动过程来说，可以划分为三个阶段：BootLoader 引导（U-Boot）、Linux Kernel 启动、Android OS 启动。

U-Boot 主要作用，就是引导内核的启动，首先会把内核从 Flash 中放到内存中，然后引导内核启动；

内核是整个系统的核心，它负责进程管理、内存管理、网络管理，可以直接对硬件进行控制，并且把硬件全部抽象成文件，对上层提供接口；

内核启动完后，会根据所设置的启动方式去启动 Android 系统；

#### Loader 层

早期经常刷机的时候，通过某个组合键（一般是 power + volume down）就会进入 bootloader 页面，就是系统启动架构图中的最底层，BootLoader 并不是 Linux 才需要，而是几乎所有的运行操作系统的设备都具备，PC 中的 BIOS 就是 BootLoader 的一部分，对于 Linux PC 来说，BootLoader = BIOS + GRUB/LILO。

常用的 BootLoader 有 Redboot、ARMBoot、Blob、**U-Boot** 等，U-Boot 是最常用的 BootLoader，可以引导多种操作系统，支持多种架构的 CPU。全称 Universal Boot Loader，是由开源项目 PPCBoot 发展起来的，ARMboot 并入了 PPCBoot，和其他一些 arch 的 Loader 合称 U-Boot。

- <font color=red>**Boot ROM**</font>：固化在固件（firmware）中的 boot 代码；
- <font color=red>**Boot Loader**</font> ：启动 Android OS 之前的引导程序，主要是`检查 RAM，初始化硬件参数`等功能，会把内核从 flash 中放到内存中，然后引导内核启动。

**Bootloader 是如何被引导的？**

由主 CPU 完成，CPU 内部也会有一段引导程序，并且有一段固化的 ROM，由芯片厂商完成。手机处于关机状态时，长按 Power 键开机，如上 **嵌入式 Linux 系统软件架构** 中所述，芯片从固化在 ROM 里的预设代码开始执行，然后加载引导程序（Bootloader）到 RAM。主芯片基本都会提供几种启动模式：USB 启动、SD 卡启动、Flash 启动等。

#### Linux Kernel 层

Android 平台的基础是 Linux 内核，也是整个系统的核心，内核负责进程管理、内存管理、网络管理，作为硬件和软件之间的抽象层，可以直接对硬件进行控制，并且<font color = red>**把硬件全部抽象成文件，对上层提供接口**</font>。例如，[Android Runtime (ART)](https://developer.android.com/guide/platform?hl=zh-cn#art) 依靠 Linux 内核来执行底层功能，例如线程和低层内存管理。

使用 Linux 内核可让 Android 利用[主要安全功能](https://source.android.com/security/overview/kernel-security.html?hl=zh-cn)，并且允许设备制造商为著名的内核开发硬件驱动程序。

- <font color=red>**swapper 进程（pid = 0）**</font>：即 idle 进程，由系统自动创建，运行在内核态，系统初始化过程开创的第一个进程，也是唯一一个没有通过 fork 或者 kernel_thread 产生的进程。完成加载系统后，演变为进程调度、交换，用于**初始化进程管理、内存管理，加载 Display, Camera Driver, Binder Driver** 等相关工作；
- <font color = red>**kthreadd（pid = 2）**</font>：kthreadd  进程由 idle 通过 kernel_thread 创建，并始终运行在内核空间，负责所有内核线程的调度和管理。它的任务就是管理和调度其他内核线程 kernel_thread, 会循环执行一个 kthreadd 的函数，该函数的作用就是运行 kthread_create_list 全局链表中维护的 kthread, 当我们调用 kernel_thread 创建的内核线程会被加入到此链表中，因此<font color = red>**所有的内核线程都是直接或者间接的以 kthreadd 为父进程**</font>。

#### 硬件抽象层（HAL）

[硬件抽象层 (HAL)](https://source.android.com/devices/architecture/hal-types?hl=zh-cn) 提供标准界面，向更高级别的 [Java API 框架](https://developer.android.com/guide/platform?hl=zh-cn#api-framework)显示设备硬件功能。HAL 包含多个库模块，其中每个模块都为特定类型的硬件组件实现一个界面，例如[相机](https://source.android.com/devices/camera/index.html?hl=zh-cn)或[蓝牙](https://source.android.com/devices/bluetooth.html?hl=zh-cn)模块。当框架 API 要求访问设备硬件时，Android 系统将为该硬件组件加载库模块。

**作用**：把一些主要外设抽象出一套标准的接口，供 C++ Framework 层调用。比如把 Camera 抽象出一套接口，如果底层换了 Camera，那么 Camera 号和 C++ Framework 层之间的接口是不会发生改变的，所要修改的就是从 HAL 层调用驱动的方式会发生一些改变，但是 Framework 层到 HAL 层之间的接口是不会改变的。

同样 Sensor、Audio、WIFI 对 C++ Framework 层所提供的接口都是一套标准的，如果需要更换硬件、驱动、调用方式，这套标准接口是不会改变的。

#### Android Runtime & 原生 C/C++ 库

##### Android Runtime

Android 运行时分为核心库和 ART（5.0 系统以后，Dalvik 虚拟机被 ART 取代），核心库提供了 Java 语言核心库的大多数功能。对于运行 Android 5.0（API 级别 21）或更高版本的设备，每个应用都在其自己的进程中运行，并且有其自己的 [Android Runtime (ART)](https://source.android.com/devices/tech/dalvik/index.html?hl=zh-cn) 实例。ART 编写为通过执行 DEX 文件在低内存设备上运行多个虚拟机，DEX 文件是一种专为 Android 设计的字节码格式，经过优化，使用的内存很少。编译工具链（例如 [Jack](https://source.android.com/source/jack.html?hl=zh-cn)）将 Java 源代码编译为 DEX 字节码，使其可在 Android 平台上运行。

ART 的部分主要功能包括：

- 预先 (AOT) 和即时 (JIT) 编译
- 优化的垃圾回收 (GC)
- 在 Android 9（API 级别 28）及更高版本的系统中，支持将应用软件包中的 [Dalvik Executable 格式 (DEX) 文件转换为更紧凑的机器代码](https://developer.android.com/about/versions/pie/android-9.0?hl=zh-cn#art-aot-dex)。
- 更好的调试支持，包括专用采样分析器、详细的诊断异常和崩溃报告，并且能够设置观察点以监控特定字段

在 Android 版本 5.0（API 级别 21）之前，Dalvik 是 Android Runtime。如果您的应用在 ART 上运行效果很好，那么它应该也可在 Dalvik 上运行，但[反过来不一定](https://developer.android.com/guide/practices/verifying-apps-art?hl=zh-cn)。

Android 还包含一套核心运行时库，可提供 Java API 框架所使用的 Java 编程语言中的大部分功能，包括一些 [Java 8 语言功能](https://developer.android.com/guide/platform/j8-jack?hl=zh-cn)。

##### 原生 C/C++ 库

Android 包含一个 C/C++ 库的集合，供 Android 系统的各个组件使用。这些功能通过 Android 的应用程序框架（application framework）暴露给开发者。下面列出一些核心库：

- **系统C库**——标准 C 系统库（libc）的 BSD 衍生，调整为基于嵌入式 Linux 设备
-  **媒体库**——基于 PacketVideo 的 OpenCORE。这些库支持播放和录制许多流行的音频和视频格式，以及静态图像文件，包括 MPEG4、H.264、MP3、AAC、AMR、JPG、PNG
-  **界面管理**——管理访问显示子系统和无缝组合多个应用程序的二维和三维图形层
-  **LibWebCore**——新式的 Web 浏览器引擎,驱动 Android 浏览器和内嵌的 web 视图
- **SGL**——基本的 2D 图形引擎
- **3D库**——基于 OpenGL ES 1.0 APIs 的实现。库使用硬件 3D 加速或包含高度优化的 3D 软件光栅
- **FreeType** ——位图和矢量字体渲染
- **SQLite** ——所有应用程序都可以使用的强大而轻量级的关系数据库引擎

C++ Framework 层作用：起一个承上启下的作用，对上（Java Framework 层）提供服务，对下能够挂接 HAL 层（比如 Camera、Sensor、Audio、WIFI 等外设），并且能够对外设提供保护。比如上层同时有两个程序同时对 Camera 进行访问，但是同一时刻只能有一个应用程序对 Camera 进行访问，C++ Framework 层就会有一种机制去管理这种访问，确保在同一时刻只有一个应用程序对 Camera 进行访问。

许多核心 Android 系统组件和服务（例如 ART 和 HAL）构建自原生代码，需要以 C 和 C++ 编写的原生库。Android 平台提供 Java 框架 API 以向应用显示其中部分原生库的功能。例如，您可以通过 Android 框架的 [Java OpenGL API](https://developer.android.com/reference/android/opengl/package-summary?hl=zh-cn) 访问 [OpenGL ES](https://developer.android.com/guide/topics/graphics/opengl?hl=zh-cn)，以支持在应用中绘制和操作 2D 和 3D 图形。

如果开发的是需要 C 或 C++ 代码的应用，可以使用 [Android NDK](https://developer.android.com/ndk?hl=zh-cn) 直接从原生代码访问某些[原生平台库](https://developer.android.com/ndk/guides/stable_apis?hl=zh-cn)。

原生系统库主要包括 init 浮华来的用户空间的守护进程、HAL 层以及开机动画等。

- <font color = red>**init 进程（pid = 1）**</font>：Linux 系统的用户进程，负责的事情主要是对 `init.rc` 这个系统启动脚本文件进行解析；
- init 进程会孵化出 ueventd、logd、healthd、installd、adbd、lmkd 等用户守护进程；
- init 进程还启动 `servicemanager`(binder 服务管家)、`bootanim` (开机动画)等重要服务；
- init 进程孵化出 Zygote 进程，Zygote 进程是 Android 系统的第一个 Java 进程(即虚拟机进程)，<font color = red>**Zygote是所有Java进程的父进程**</font>，Zygote进程本身是由init进程孵化而来的。

#### Framework 层

您可通过以 Java 语言编写的 API 使用 Android OS 的整个功能集。这些 API 形成创建 Android 应用所需的构建块，它们可简化核心模块化系统组件和服务的重复使用，包括以下组件和服务：

- 丰富、可扩展的[视图系统](https://developer.android.com/guide/topics/ui/overview?hl=zh-cn)，可用以构建应用的 UI，包括列表、网格、文本框、按钮甚至可嵌入的网络浏览器
- [资源管理器](https://developer.android.com/guide/topics/resources/overview?hl=zh-cn)，用于访问非代码资源，例如本地化的字符串、图形和布局文件
- [通知管理器](https://developer.android.com/guide/topics/ui/notifiers/notifications?hl=zh-cn)，可让所有应用在状态栏中显示自定义提醒
- [Activity 管理器](https://developer.android.com/guide/components/activities?hl=zh-cn)，用于管理应用的生命周期，提供常见的[导航返回栈](https://developer.android.com/guide/components/tasks-and-back-stack?hl=zh-cn)
- [内容提供程序](https://developer.android.com/guide/topics/providers/content-providers?hl=zh-cn)，可让应用访问其他应用（例如“联系人”应用）中的数据或者共享其自己的数据

开发者可以完全访问 Android 系统应用使用的[框架 API](https://developer.android.com/reference/packages?hl=zh-cn)。

- <font color = red>**Zygote 进程**</font>：由 init 进程通过解析 init.rc 文件后 fork 生成的，Zygote 进程主要包含：
  - 加载 ZygoteInit 类，注册 Zygote Socket 服务端套接字
  - 加载虚拟机
  - 提前加载类 preloadClasses
  - 提前加载资源 preloadResouces
- <font color = red>**System Server 进程**</font>：是由 Zygote 进程 fork 而来，<font color = red>**System Server 是 Zygote 孵化的第一个进程**</font>，System Server 负责启动和管理整个 Java framework，包含 ActivityManager，WindowManager，PackageManager，PowerManager 等服务。
- <font color = red>**Media Server 进程**</font>：是由 init 进程 fork 而来，负责启动和管理整个 **C++ framework**，包含AudioFlinger，Camera Service 等服务。

#### APP 层

APP 包含系统应用和第三方应用，Android 随附一套用于电子邮件、短信、日历、互联网浏览和联系人等的核心应用。平台随附的应用与用户可以选择安装的应用一样，没有特殊状态。因此第三方应用可成为用户的默认网络浏览器、短信 Messenger 甚至默认键盘（有一些例外，例如系统的“设置”应用）。

系统应用可用作用户的应用，以及提供开发者可从其自己的应用访问的主要功能。例如，如果您的应用要发短信，您无需自己构建该功能，可以改为调用已安装的短信应用向您指定的接收者发送消息。

- Zygote 进程孵化出的第一个 App 进程是 Launcher，这是用户看到的桌面 App；
- Zygote 进程还会创建 Browser，Phone，Email 等 App 进程，每个 App 至少运行在一个进程上。
- 所有的 App 进程都是由 Zygote 进程 fork 生成的。

#### Syscall && JNI

- Native与Kernel之间有一层系统调用(SysCall)层
- Java层与Native(C/C++)层之间的纽带 JNI

