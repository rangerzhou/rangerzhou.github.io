---
title: 车载系统整体介绍
copyright: true
date: 2025-01-15 22:18:31
tags:
categories: Others
password: zr.
---

> 车载系统整体介绍

<!--more-->

# 车载和 Android 开发区别



# 车载启动原理



# 车载 CarService

- 实现 Service 服务，返回 mICarImpl
  - 实例化 Car 相关的 Service
  - 提供 Car 服务
- sss

CarService 组成

- CarPropertyService
  - 此类实现 ICarProperty 的 binder 接口，有助于更容易的创建处理车辆属性的多个 Manager
- CarInputService
  - 通过车辆 HAL 监控和处理输入事件
- CarLocationService
  - 此服务在车辆停放时存储 LocationManager 中最后一个已知位置，并在车辆通电时恢复该位置
- CarMediaService
  - 管理汽车应用程序的当前活动媒体源，这与 MediaSessionManager 的活动会话不同，因为同一时间内车内只能有一个活动源。在车内，活动的媒体源不一定有活动的 MediaSession，例如，如果只是在浏览它，但是，该源仍然被视为活动源，并且应该是任何媒体相关 UI（媒体中心、主屏幕等） 中显示的源
- CarPowerManagementService
  - 汽车电源管理服务，控制电源状态并与系统的其他部分交互以确保其自身状态
- CarProjectionService
  - 汽车投屏服务
- CarAudioService
  - 负责与汽车音响系统交互的服务
- AppFocusService
  - 应用程序焦点服务，确保一次只有一个应用程序类型的实例处于活动状态
- GarageModeService
  - 车库模式，车库模式启用车内空闲时间
- InstrumentClusterService
  - 负责与汽车仪表盘交互的服务
- CarPackageManagerService
- CarUserService
  - 创建用作驱动程序的用户
  - 创建用作乘客的用户
  - 首次运行时创建辅助管理员用户
  - 切换驾驶员
- CarStorageMonitoringService
  - 提供存储监视数据（如 I/O 统计数据）的服务，为了接收此类数据，用户需要实现IIoStatsListener，并根据此服务注册自己。
- CarBluetoothService
  - 车载蓝牙服务，维护当前用户的蓝牙设备和配置文件连接
- FixedActivityService
  - 监控显示器顶部的 Activity，并确保在固定模式下的 Activity 在崩溃或因任何原因进入后台时重新启动，此组件还监视目标包的更新，并在更新完成后重新启动它。
- CarBugreportManagerService
- CarConfigurationService
- CarDiagnosticService
  - 汽车诊断服务，工程模式会用到此服务
- CarDrivingStateService
  - 推断车辆当前驾驶状态的服务，它通过侦听 CarPropertyService 的相关属性来计算驾驶状态
- CarExperimentalFeatureServiceController
- CarFeatureController
  - 控制汽车特性的部件
- CarNightService
  - 用于处理将车辆设置为夜间模式的事件
- SystemActivityMonitorService
  - 监控 AMS 新 Activity 或 Service 启动的服务

这些服务并不是四大组件意义上的 Service，它们没有继承自 `android.app.service`，相反它们都继承自 `ICarxxxx.Stub`，本质上属于 AIDL 接口的实现类，到这一步也可以看出 CarService 本质上只是作为这些服务的容器而存在，本身并没有实现业务逻辑上的功能。

既然这些 Service 都是 AIDL 接口的实现类，本质上就算 AIDL 的 Server 端，那应用就还需要通过相应的 API SDK 才能调用 Server 的方法，这歌 API SDK 就是 Car API。

# 车载相关面试题









