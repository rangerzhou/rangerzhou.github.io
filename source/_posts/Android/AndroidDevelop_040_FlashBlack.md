---
title: Android - 切换壁纸闪黑问题分析
date: 2024-06-30 23:55:26
tags:
categories: Android
copyright: true
password:
---

> Android 壁纸服务启动流程以及闪黑分析。
>
> 源码：android-15.0.0_r23

<!--more-->

# 壁纸服务启动流程

## 绑定 ImageWallpaper

``` mermaid
sequenceDiagram
autonumber
box Lavender system_server
participant SystemServer
participant SystemServiceManager
participant WallpaperManagerService.Lifecycle
participant WallpaperManagerService
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
SystemServiceManager ->> WallpaperManagerService.Lifecycle:onBootPhase()
WallpaperManagerService.Lifecycle ->> WallpaperManagerService:onBootPhase()
WallpaperManagerService ->> WallpaperManagerService:systemReady()
WallpaperManagerService ->> WallpaperManagerService:initialize()
Note over WallpaperManagerService:从系统配置中读取当前壁纸/锁屏壁纸信息/壁纸组件名等
WallpaperManagerService ->> WallpaperManagerService:loadSettingsLocked()
Note over WallpaperManagerService:准备兜底壁纸
WallpaperManagerService ->> WallpaperManagerService:initializeFallbackWallpaper()
Note over WallpaperManagerService:选择要绑定的壁纸组件，默认ImageWallpaper
WallpaperManagerService ->> WallpaperManagerService:bindWallpaperComponentLocked()
Note over WallpaperManagerService:建立与壁纸服务的连接
WallpaperManagerService ->> WallpaperManagerService:bindWallpaperDescriptionLocked()
Note right of WallpaperManagerService:绑定 ImageWallpaper 服务
WallpaperManagerService ->> ImageWallpaper:bindServiceAsUser()

```

系统启动过程中，SystemServer 启动 WallpaperManagerService，在系统就绪后读取壁纸配置，并最终通过 bindService 方式把系统默认的 ImageWallpaper 服务绑定起来，从而让桌面壁纸真正开始工作。

SystemServer 启动过程中会创建 WallpaperManagerService，但真正的初始化发生在 PHASE_ACTIVITY_MANAGER_READY 之后。此时服务会读取壁纸配置，初始化兜底壁纸，并通过 bindServiceAsUser 绑定 SystemUI 进程中的 ImageWallpaper 服务，最终由 WallpaperService 渲染并显示系统壁纸。



## 绑定新壁纸

attach()/relayout()/finishDrawing()

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
Note over WallpaperService, ImageWallpaper:ImageWallpaper 创建 Engine
WallpaperService ->> ImageWallpaper:onCreateEngine()
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

ImageWallpaper 创建 WallpaperService.Engine，并通过 WMS 注册一个 TYPE_WALLPAPER 的窗口；WMS 为其创建 SurfaceControl，在 SurfaceFlinger 中生成对应的 Layer；壁纸内容通过 BufferQueue 提交给 SF，最终与应用窗口一起合成并显示。

## 解绑旧壁纸

detach()

``` mermaid
sequenceDiagram
WallpaperManagerService ->> WallpaperService:attach()
Note right of WallpaperService:创建 WindowState
WallpaperService ->> WMS:addToDisplay()
Note right of WallpaperService:创建 Surface
WallpaperService ->> WMS:relayout()
WallpaperService ->> WMS:BbqSurfaceControl
Note right of WallpaperService:绘制第一帧完成，提交
WallpaperService ->> WMS:finishDrawing()

WallpaperManagerService ->> WallpaperManagerService:detachWallpaperLocked()
WallpaperManagerService ->> WallpaperManagerService:DisplayConnector.disconnectLocked()
Note right of WallpaperManagerService:1.移除 WallpaperToken
WallpaperManagerService ->> WindowManagerInternal:removeWindowToken()
WallpaperManagerService ->> WallpaperService:IWallpaperServiceWrapper.detach()
WallpaperService ->> WallpaperService:IWallpaperEngineWrapper.destroy()
WallpaperService ->> WallpaperService:executeMessage(DO_DETACH)
WallpaperService ->> WallpaperService:IWallpaperEngineWrapper.doDetachEngine()
WallpaperService ->> WallpaperService:IWallpaperEngineWrapper.detach()
Note over WallpaperService,Session:2.移除 WindowState
WallpaperService ->> Session:remove(WindowState)
Note over WallpaperService,SurfaceControl:3.移除 mBbqSurfaceControl
WallpaperService ->> SurfaceControl:Transaction.remove(mBbqSurfaceControl)
WallpaperManagerService -->> WallpaperManagerService:unbindService()
```

对于旧壁纸，detach 过程中，移除了 WindowToken/WindowState/BbqSurfaceControl ，

# 闪黑问题

## 问题描述

> 切换壁纸时出现闪黑。

看源码之前可能的猜想：

- 图片太大，新壁纸绘制慢？
- 新老窗口动画切换异常？
- 新老壁纸移除时序？

## 分析

抓取 Winscope，查看 SF 层级，发现在闪黑的时候，壁纸图层消失了，等过了几帧后才出现，那么分析出现之前最后一帧的状态，取消勾选 `Only visible`（因为此时是不可见的状态，取消勾选才能看到未显示的图层）， 看到对应壁纸图层的 BbqSurface 消失了，而将要显示的新壁纸的 BbqSurface 是存在的（为什么新壁纸不可见，写明了原因：Buffer is empty，即新壁纸还没有向它的 Bbq 绘制），这种 Buffer 类型的图层才是真正显示内容的地方，所以原因就找到了，就是新的 Bbq 已经被移除，但是新的 Bbq 还没有绘制，而源码中，注意 attach() 和 detach() 都是异步的，所以有可能旧壁纸移除时新壁纸还没有准备好，所以导致闪黑。

## 解决

前面知道 BBQ 被移除，所以可以看 SurfaceControl 的 `remove()`（其他还有 `show()/hide()` API 也经常用） API 的调用堆栈，通过调用堆栈看到和之前 detach() 流程中的 `SurfaceControl:Transaction.remove(mBbqSurfaceControl)` 对上了。

<font color=red>首先尝试注释这行</font>，结果还是有闪黑，抓取 winscope 发现 BBQ 没有被移除了，但是 winscope 右侧显示状态是不可见，原因是 `Invisible due to: Alpha is 0`，而 alpha 值通常和动画有关，图层中也存在 leash 图层（动画相关），所以考虑是窗口移除动画导致 alpha 为 0。

接下来<font color=red>尝试注释掉移除 WindowState 和 WindowToken 的代码</font>，移除后发现闪黑确实解决了，但是dumpsys window 的时候发现每次切换壁纸，都会多一个 WindowToken，会导致内存泄漏，<font color=red>**所以需要找到合适的时机移除而不是不移除**</font>。

在之前的源码分析中，在 `updateSurface()` 中调用了 `reportEngineShown() - reportShown() - WallpaperManagerService.engineShown()`，就是告知 system_server 新壁纸已经显示，<font color=red>**所以考虑在 `engineShown()` 中对 WindowToken 进行移除，同时传入参数 true（把孩子 WindowState 也移除）**</font>：

``` java
// WallpaperService.java 
// 1.注释移除 WindowState
-                    mSession.remove(mWindow);
-                } catch (RemoteException e) {
+                   // mSession.remove(mWindow);
+                } catch (Exception e) {
...
// 2.注释移除 mBbqSurfaceControl
-                    new SurfaceControl.Transaction().remove(mBbqSurfaceControl).apply();
+                    //new SurfaceControl.Transaction().remove(mBbqSurfaceControl).apply();

// WallpaperManagerService.java
+    WallpaperConnection.DisplayConnector mPendingRemoveDisplayConnector= null;
     class WallpaperConnection extends IWallpaperConnection.Stub
             implements ServiceConnection {
         // 3.注释移除 WindowToken
-                mWindowManagerInternal.removeWindowToken(mToken, false/* removeWindows */, mDisplayId);
+//                mWindowManagerInternal.removeWindowToken(mToken, false/* removeWindows */, mDisplayId);
+                mPendingRemoveDisplayConnector = this;

// 4.在合适的时机移除 WindowToken 及孩子
         @Override
         public void engineShown(IWallpaperEngine engine) {
+            if (mPendingRemoveDisplayConnector != null) {
+                mWindowManagerInternal.removeWindowToken(mPendingRemoveDisplayConnector.mToken, true/* removeWindows */,
+                        mPendingRemoveDisplayConnector.mDisplayId);
+                mPendingRemoveDisplayConnector = null;
+                android.util.Log.i("test33"," engineShown mPendingRemoveDisplayConnector = " + mPendingRemoveDisplayConnector);
+            }
```

# 总结

黑屏原因（根据 Winscope 分析）

- 没有图层
- 动画导致 alpha 为 0
- Buffer 没有准备好
- flag 本身是 hide

解决思路

- 找到 remove 或 hide 的地方（根据 SurfaceControl 的堆栈）
- 重新规划调整图层显示顺序（熟悉具体业务代码）



