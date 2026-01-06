---
title: Android - 壁纸服务流程
date: 2025-07-03 23:55:26
tags:
categories: Android
copyright: true
password:
---

> Android 壁纸服务启动流程。
>
> 源码：android-15.0.0_r23

<!--more-->

# 时序图

## 绑定 ImageWallpaper

``` mermaid
sequenceDiagram
autonumber
box Lavender system_server
participant SystemServer
participant SystemServiceManager
participant WallpaperManagerService.Lifecycle
participant WallpaperManagerService
participant AMS
participant WindowManagerInternal
end

box LightYellow SystemUI
participant ImageWallpaper
participant WallpaperService
end

SystemServer ->> SystemServer:startOtherServices()
SystemServer ->> SystemServiceManager:startService()
SystemServiceManager ->> WallpaperManagerService.Lifecycle:onStart()
Note right of WallpaperManagerService.Lifecycle:创建 WallpaperManagerService 对象
WallpaperManagerService.Lifecycle ->> WallpaperManagerService:new WallpaperManagerService()
SystemServer ->> SystemServiceManager:startBootPhase(PHASE_ACTIVITY_MANAGER_READY)
SystemServiceManager ->> WallpaperManagerService.Lifecycle:startBootPhase()
WallpaperManagerService.Lifecycle ->> WallpaperManagerService:startBootPhase()
WallpaperManagerService ->> WallpaperManagerService:systemReady()
WallpaperManagerService ->> WallpaperManagerService:initialize()
WallpaperManagerService ->> WallpaperManagerService:loadSettingsLocked()
WallpaperManagerService ->> WallpaperManagerService:initializeFallbackWallpaper()
WallpaperManagerService ->> WallpaperManagerService:bindWallpaperComponentLocked()
WallpaperManagerService ->> WallpaperManagerService:bindWallpaperDescriptionLocked()
Note right of WallpaperManagerService:绑定 ImageWallpaper 服务
WallpaperManagerService ->> ImageWallpaper:bindServiceAsUser()

```



## attach()/relayout()/finishDrawing()

``` mermaid
sequenceDiagram
autonumber
box Lavender system_server
participant WallpaperManagerService
participant AMS
participant WindowManagerInternal
participant Session
participant WindowManagerService
end

box LightYellow SystemUI
participant ImageWallpaper
participant WallpaperService
end

AMS -->> WallpaperManagerService:WallpaperConnection:onServiceConnected()
WallpaperManagerService ->> WallpaperManagerService:attachServiceLocked()
WallpaperManagerService ->> WallpaperManagerService:DisplayConnector.connectLocked()
Note over WallpaperManagerService, WindowManagerInternal:创建 WindowToken，并且传入 IWallpaperServiceWrapper/IWallpaperEngineWrapper/Engine
WallpaperManagerService ->> WindowManagerInternal:addWindowToken()
WallpaperManagerService ->> WallpaperService:IWallpaperServiceWrapper.attach()
WallpaperService ->> WallpaperService:IWallpaperEngineWrapper.IWallpaperEngineWrapper()
WallpaperService ->> WallpaperService:IWallpaperEngineWrapper.executeMessage(DO_ATTACH)
WallpaperService ->> WallpaperService:IWallpaperEngineWrapper.doAttachEngine()
WallpaperService -->> WallpaperManagerService:WallpaperConnection.attachEngine()
Note over WallpaperManagerService, WallpaperService:一系列操作
WallpaperManagerService ->> WallpaperService:IWallpaperEngineWrapper.setInAmbientMode()
WallpaperManagerService ->> WallpaperService:IWallpaperEngineWrapper.requestWallpaperColors()
WallpaperManagerService ->> WallpaperService:IWallpaperEngineWrapper.addLocalColorsAreas()
WallpaperManagerService ->> WallpaperService:IWallpaperEngineWrapper.applyDimming()
Note over WallpaperService, WallpaperService:调用 Engine.attach()
WallpaperService ->> WallpaperService:Engine.attach()
WallpaperService ->> WallpaperService:Engine.updateSurface()
Note over WallpaperService, Session:1.创建 WindowState
WallpaperService ->> Session:addToDisplay()
Session ->> WindowManagerService:addWindow()
Note over WallpaperService, Session:2.创建 Surface
WallpaperService ->> Session:relayout()
Session ->> WindowManagerService:relayoutWindow()
Note over WallpaperService, Session:3.客户端告知 WMS 我已经绘制完成
WallpaperService ->> Session:finishDrawing()
Session ->> WindowManagerService:finishDrawingWindow()
```



- Session:addToDisplay()

- Session:relayout()：客户端通过它来报告自己的期望（新的尺寸、可见性等），而 WMS 则通过它来执行复杂的布局计算，并把最终的结果（新的尺寸、配置、Surface 等）反馈给客户端，从而完成一次窗口的更新周期

- Session:finishDrawing()：本质上是客户端对 Window Manager 的一个**“报告”：“我已经画好了，你可以把我显示出来了！”**

## detach()
