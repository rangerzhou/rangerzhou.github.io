

# 1 窗口层级树

## 1.1 DisplayArea 层级树构建流程

``` mermaid
sequenceDiagram
Autonumber
SystemServer ->> SystemServer:run()
SystemServer ->> SystemServer:startOtherServices()
SystemServer ->> WMS:main()
SystemServer ->> AMS(ATMS):AMS-setWindowManager(wms)
AMS(ATMS) ->> AMS(ATMS):ATMS-setWindowManager(wms)
AMS(ATMS) ->> RootWindowContainer:setWindowManager()
Note right of RootWindowContainer:创建 DisplayContent
RootWindowContainer ->> DisplayContent:new DisplayContent()
Note right of DisplayContent:创建 WindowContainer 树
DisplayContent ->> DisplayAreaPolicy:DefaultProvider.instantiate()
Note over DisplayAreaPolicy:创建 TaskDisplayArea
DisplayAreaPolicy -->> DisplayAreaPolicy:new TaskDisplayArea()
Note over DisplayAreaPolicy:创建层级树数据结构，这里传入的 root 是 DisplayContent
DisplayAreaPolicy -->> DisplayAreaPolicyBuilder:new HierarchyBuilder(DisplayContent)
Note over DisplayAreaPolicy:设置输入法容器
DisplayAreaPolicy -->> DisplayAreaPolicy:setImeContainer()
Note over DisplayAreaPolicy,DisplayAreaPolicyBuilder:配置层级的支持的 Feature，配置 6 个 Feature
DisplayAreaPolicy ->> DisplayAreaPolicy:configureTrustedHierarchyBuilder()
DisplayAreaPolicy ->> DisplayAreaPolicyBuilder:addFeature("WindowedMagnification")
DisplayAreaPolicy ->> DisplayAreaPolicyBuilder:addFeature("HideDisplayCutout")
DisplayAreaPolicy ->> DisplayAreaPolicyBuilder:addFeature("OneHanded")
DisplayAreaPolicy ->> DisplayAreaPolicyBuilder:addFeature("AppZoomOut")
DisplayAreaPolicy ->> DisplayAreaPolicyBuilder:addFeature("FullscreenMagnification")
DisplayAreaPolicy ->> DisplayAreaPolicyBuilder:addFeature("ImePlaceholder")

Note over DisplayAreaPolicy:真正开始构建层级树
DisplayAreaPolicy ->> DisplayAreaPolicy:new DisplayAreaPolicyBuilder(HierarchyBuilder).build()

DisplayAreaPolicy ->> DisplayAreaPolicyBuilder:build()
Note over DisplayAreaPolicyBuilder:构建 PendingArea 树
DisplayAreaPolicyBuilder ->> DisplayAreaPolicyBuilder:HierarchyBuilder.build()
Note over DisplayAreaPolicyBuilder:构建真正的 DisplayArea 树, 参数 mRoot 为 D
DisplayAreaPolicyBuilder ->> DisplayAreaPolicyBuilder:PendingArea.instantiateChildren(mRoot)
Note over DisplayAreaPolicyBuilder,DisplayContent:为 DisplayContent 挂载子节点，addChild() 真正实现在父类 WindowContainer 中
DisplayAreaPolicyBuilder -->> DisplayContent:addChild()


Note over DisplayContent:创建 DC 及 DA 的 SurfaceControl
DisplayContent ->> DisplayContent:configureSurfaces()


Note over RootWindowContainer:为 RootWindowContainer 添加 0 号孩子:DisplayContent
RootWindowContainer -->> RootWindowContainer:addChild(displayContent)
%% Note over RootWindowContainer:获取前面创建的 TaskDisplayArea
%% RootWindowContainer ->> RootWindowContainer:getDefaultTaskDisplayArea()
```

### 总结：

- `SystemServer.run()` 发起构建层级树
- 从 RootWindowContainer 开始创建 DisplayContent
- DisplayContent 中的构造函数中通过 `instantiate()` 开始构建窗口层级树（<font color=red>**只构建到 DisplayArea 层级**</font>）
   - 创建 TaskDisplayArea
   - 创建层级树数据结构
   - 设置输入法容器
   - 配置 6 个 Feature
   - 通过 `DisplayAreaPolicyBuilder.build()` 真正构建层级树
      - 构建 PendingArea 树
         - 遍历所有 Feature，为每个 layer 生成 PendingArea 结构
         - 再为每个 layer 添加 Leaf（Tokens）、IME、TaskDisplayArea 等节点
      - 构建真正的 DisplayArea 树
         - 将 PendingArea 转换为 DisplayArea 或 DisplayArea.Tokens
         - 递归挂载到父节点
         - 最终形成完整的 DisplayArea 层级树
- 通过 `DisplayAreaPolicy:DefaultProvider.instantiate()` 传入了 root 为 this，即把自己（DisplayContent）作为 RootDisplayArea
- <font color=red>**通过 `DisplayAreaPolicyBuilder.instantiateChildren() - DisplayContent.addChild() - WindowContainer.addChild()`，为 DisplayContent 挂载子节点**</font>
- DisplayContent 中的构造函数中 <font color=red>**为 DisplayContent 及 DisplayArea 创建 SurfaceControl**</font> (见 **2 SurfaceFlinger 层级树**)

## 1.2 挂载应用窗口

包括挂载 Task、ActivityRecord(WindowToken)、WindowState

### 1.2.1 创建挂载 Task/AR

桌面点击应用图标，从 `Activity.startActivity()` 一路调用到 `Instrumentation.execStartActivity()`，Instrumentation 又调用到 `ATMS.startActivity()`，这里从 ATMS 开始整理时序图。



``` mermaid
sequenceDiagram
autonumber
Note left of ATMS:从 Instrumentation 调用
ATMS ->> ATMS:startActivity()
Note over ATMS:多次调用
ATMS -->> ATMS:startActivityAsUser()
ATMS ->> ActivityStarter:execute()
ActivityStarter ->> ActivityStarter:executeRequest()

%% 1.创建 ActivityRecord
Note right of ActivityStarter:1.创建 ActivityRecord r 并往下传递
ActivityStarter ->> ActivityRecord:Builder.build()
ActivityStarter ->> ActivityStarter:startActivityUnchecked(ActivityRecord r)
ActivityStarter ->> ActivityStarter:startActivityInner(ActivityRecord r)
Note over ActivityStarter:把创建的 ActivityRecord 赋值给 mStartActivity
ActivityStarter ->> ActivityStarter:setInitialState(ActivityRecord r)

%% 2.创建 Task
Note over ActivityStarter:2.创建 Task
ActivityStarter ->> ActivityStarter:getOrCreateRootTask()
ActivityStarter ->> RootWindowContainer:getOrCreateRootTask()
RootWindowContainer -->> TaskDisplayArea:getOrCreateRootTask()

%% 3.挂载 Task 到 DefaultTaskDisplayArea
Note right of TaskDisplayArea:把 TaskDisplayArea 设置为 parent
TaskDisplayArea ->> Task:Builder.setParent(this)
Note right of TaskDisplayArea:2.1 真正创建 Task 的地方
TaskDisplayArea ->> Task:Builder.build()
Task ->> Task:Builder.buildInner()
Note over Task:2.2 直接 new 出 Task 对象
Task ->> Task:new Task()
%% 3.挂载 Task 到 DefaultTaskDisplayArea
Note over Task,TaskDisplayArea:3.挂载 Task 到 TaskDisplayArea
Task ->> TaskDisplayArea:addChild()

%% 4.挂载 ActivityRecord 到 Task
Note over ActivityStarter:4.开始挂载 ActivityRecord
ActivityStarter ->> ActivityStarter:setNewTask(Task task)
Note over ActivityStarter:Task 作为新的父亲：TaskFragment newParent = task
ActivityStarter ->> ActivityStarter:addOrReparentStartingActivity(Task task)
Note over ActivityStarter,TaskFragment:4.1 挂载 ActivityRecord 到 Task 的顶部(这里的 mStartActivity 就是前面创建传递下来的)
ActivityStarter ->> TaskFragment:addChild(mStartActivity, POSITION_TOP)
```

#### 总结

- ActivityStarter 中创建 ActivityRecord
- TaskDisplayArea 中创建 Task
- <font color=red>**创建 Task 时把 TaskDisplayArea 自身作为 Task 的 parent，然后在 `Task.Builder.build()` 的时候通过调用 `TaskDisplayArea.addChild() - WindowContainer.addChild()` 把 Task 挂载到 TaskDisplayArea，也就是窗口层级树中看到的 DefaultTaskDisplayArea**</font>
- <font color=red>**挂载 ActivityRecord 到 Task，也是通过 addChild()**</font>

### 1.2.2 创建挂载 WindowState

``` mermaid
sequenceDiagram
autonumber
ActivityThread -->> ActivityThread:handleResumeActivity()
Note over ActivityThread,WindowManagerGlobal:经过 WMI 中转到 WMG
ActivityThread -->> WindowManagerGlobal:addView()
Note right of WindowManagerGlobal:创建 ViewRootImpl
WindowManagerGlobal ->> ViewRootImpl:new ViewRootImpl()
WindowManagerGlobal ->> ViewRootImpl:setView()
Note over ViewRootImpl:这里比较重要，以后分析
ViewRootImpl ->> ViewRootImpl:requestLayout()
Note over ViewRootImpl:创建 InputChannel 空对象，传给 WMS 写入
ViewRootImpl ->> ViewRootImpl:new InputChannel()
Note right of ViewRootImpl:通过 binder 到 Session
ViewRootImpl ->> Session:addToDisplayAsUser(W)

%% WMS 侧操作
Note right of Session:Session 持有 WMS
Session ->> WMS:addWindow(W)
Note right of WMS:通过 attrs.token 获取 WindowToken
WMS ->> DisplayContent:getWindowToken(attrs.token)
Note over WMS:1.创建 WindowState
WMS -->> WMS:new WindowState()
Note over WMS,WindowState:创建 InputChannel
WMS ->> WindowState:openInputChannel(outInputChannel)
Note over WMS:把 W 对象和 WindowState 放入 Map
WMS ->>WMS:mWindowMap.put(W, win)

WMS ->> WMS:addWindowInner()
Note over WMS,ActivityRecord:win.mToken.addWindow(win)
WMS ->> ActivityRecord:addWindow(WindowState)
ActivityRecord ->> WindowToken:addWindow(WindowState)
Note over WindowToken:2.挂载 WindowState 到 ActivityRecord
WindowToken ->> WindowToken:addChild()
```

#### 总结

- resume() 流程中通过 `addView() -> setView() -> addWindow()`，在 WMS 中创建了  WindowState，并且<font color=red>**通过 `addChild()` 挂载到了 ActivityRecord**</font>；
- 创建 WindowState 时传入了 IWindow(W 对象，用于 WMS 和 Window 窗口回调之间通信的 binder) 以及 WindowToken(<font color=red>**详见[3.1 Token 相关](# 3.1 Token 相关)**</font>)；
- 在 `WMS.addWindow()` 中触发了 InputChannel 的创建；

## 1.3 挂载系统窗口

``` mermaid
sequenceDiagram
autonumber
Session ->> WMS:addWindow()
WMS ->> WindowToken:Builder.build()
WindowToken ->> WindowToken:new WindowToken()
WindowToken ->> DisplayContent:addWindowToken()
DisplayContent ->> DisplayContent:findAreaForToken()
Note right of DisplayContent:挂载 WindowToken 到 DisplayArea
DisplayContent ->> DisplayArea.Tokens:addChild()
WMS ->> WMS:addWindowInner()
Note right of WMS:挂载 WindowState 到 WindowToken
WMS ->> WindowToken:addWindow(win)
```

### 总结

系统窗口的创建和挂载和应用窗口一样，区别就是 WindowToken 不是 ActivityRecord，在创建 WindowToken 的时候就把 WindowToken 挂载到 DisplayArea，然后再在`WMS.addWindow()` 把 WindowState 挂载到 WindowToken。



# 2 SurfaceFlinger层级树

在 [1.1 DisplayArea 层级树构建流程](#1.1 DisplayArea 层级树构建流程) 中已经写明了创建 SurfaceControl 的入口 `DisplayContent.configureSurfaces()`，我们从这里开始。

## 2.1 DisplayContent 的 Surface 构建

``` mermaid
sequenceDiagram
autonumber
RootWindowContainer ->> DisplayContent:new DisplayContent()
DisplayContent ->> DisplayContent:configureSurfaces()
Note right of DisplayContent:构建 SurfaceControl，设置为 Container 类型、名字
DisplayContent ->> WMS:makeSurfaceBuilder().setContainerLayer().setName
```

### 总结

- 为 DisplayContent 和 DisplayArea 创建层级树的同时，也构建了对应的 Surface；

## 2.2 其他容器(包括 DisplayArea) Surface 的构建

从 [1.1 DisplayArea 层级树构建流程](#1.1 DisplayArea 层级树构建流程) 和 [1.2 挂载应用窗口](1.2 挂载应用窗口) 的分析可以得知，挂载操作都是在 `addChild()` 操作中，比如 DisplayArea 挂载到 DisplayContent、WindowState 挂载到 WindowToken 都是这样，所以我们从 `addChild()` 开始分析。

``` mermaid
sequenceDiagram
autonumber
WindowContainer -->> WindowContainer:addChild()
WindowContainer ->> WindowContainer:setParent()
WindowContainer ->> WindowContainer:onParentChanged()
WindowContainer ->> WindowContainer:createSurfaceControl()
%% WindowContainer ->> WindowContainer:setInitialSurfaceControlProperties(makeSurface())
Note over WindowContainer:makeSurface() 返回一个 SurfaceControl.Builder
WindowContainer ->> WindowContainer:makeSurface()
WindowContainer ->> WindowContainer:makeChildSurface()
Note over WindowContainer,DisplayContent:DC 重写了 makeChildSurface()
WindowContainer ->> DisplayContent:makeChildSurface()
Note right of DisplayContent:同样设置容器类型的 Layer
DisplayContent ->> WMS:makeSurfaceBuilder().setContainerLayer()

WindowContainer ->> SurfaceControl:Builder.setParent(mSurfaceControl)
WindowContainer ->> WindowContainer:setInitialSurfaceControlProperties(SurfaceControl.Builder)
WindowContainer ->> WindowContainer:setSurfaceControl()
```

### 总结

- 当 `addChild()` 调用的时候，通过如上时序图层层调用，最终 DisplayContent 重写了 `makeChildSurface()`，所以到了 DC 就结束了 `makeChildSurface()` 的递归调用，并把父类 SurfaceControl 设置为 parent，比如设置 Task 的 parent 为 TaskDisplayArea
- SurfaceFlinger 就把 Task 的 Surface 挂载到了 TaskDisplayArea

## 2.3 BufferStateLayer 创建

在 SurfaceFlinger 的层级树中可以看到 WindowState 下还有一个节点，即 BufferStateLayer，这是真正显示 UI 数据的 Layer，触发创建的起点在 `WMS.relayoutWindow()`。

``` scss
WindowManagerService::relayoutWindow
   WindowManagerService::createSurfaceControl
      WindowStateAnimator::createSurfaceLocked -- 创建“Buff” 类型Surface
         WindowStateAnimator::resetDrawState   -- 设置窗口状态为DRAW_PENDING
         WindowSurfaceController::init
            SurfaceControl.Builder::build
               SurfaceControl::init
   WindowSurfaceController::getSurfaceControl  -- 给应用端Surface赋值
```



``` mermaid
sequenceDiagram
autonumber
ViewRootImpl ->> ViewRootImpl:setView()
ViewRootImpl ->> ViewRootImpl:requestLayout()
ViewRootImpl ->> ViewRootImpl:scheduleTraversals()
ViewRootImpl ->> Choreographer:postCallback(CALLBACK_TRAVERSAL)
ViewRootImpl -->> ViewRootImpl:TraversalRunnable.run()
ViewRootImpl ->> ViewRootImpl:doTraversal()
ViewRootImpl ->> ViewRootImpl:performTraversals()
ViewRootImpl ->> ViewRootImpl:relayoutWindow()
ViewRootImpl ->> Session:relayout()
Session ->> WMS:relayoutWindow()

Note over WMS:创建 Buffer 类型 Surface
WMS ->> WMS:createSurfaceControl(outSurfaceControl, windowState)
WMS ->> WindowStateAnimator:createSurfaceLocked()
Note over WindowStateAnimator:1.设置 mDrawState 状态为 DRAW_PENDING
WindowStateAnimator ->> WindowStateAnimator:resetDrawState()
Note over WindowStateAnimator,WindowState:2.构建 Surface 并给到 mSurfaceControl
WindowStateAnimator ->> WindowState:makeSurface()
Note over WindowStateAnimator,SurfaceControl:把 WindowState 的 Surface 设为 parent
WindowStateAnimator ->> SurfaceControl:Builder.setParent(mWin.mSurfaceControl)
Note over WindowStateAnimator,SurfaceControl:设置为 Buffer 图层并 build
WindowStateAnimator ->> SurfaceControl:Builder.setBLASTLayer().build()
Note over WindowStateAnimator,SurfaceControl:随后通过 native 创建 Surface

Note right of WMS:3.把构建好的 mSurfaceControl 给到 outSurfaceControl
WMS ->> WindowStateAnimator:getSurfaceControl(outSurfaceControl)
WindowStateAnimator ->> SurfaceControl:copyFrom(mSurfaceControl)
```

### 总结

- 在 `WMS.relayoutWindow()` 中开始创建 SurfaceControl，当然真正构建的地方在 WindowState，在真正构建之前，会先把 mDrawState 设置为 DRAW_PENDDING
- 创建 SurfaceControl 的时候把 `WindowState.mSurfaceControl` 设置为了 parent
- 通过 setBLASTLayer() 设置为 Buffer 类型
- SurfaceControl 的构造函数中通过 `nativeCreate()` 获取 Native 层 Surface 的引用，所以拿到 SurfacControl 就是拿到了 Surface
- 把创建好的 SurfaceControl 给到应用端，这样应用端就可以开始绘制了

# 3 WMS 窗口显示

## 3.1 Token 相关

以下三个 token 都是 `ActivityRecord.token`，即 `WindowToken.token`，**这个 Token 用于 Activity 向系统申请资源（创建 Window、启动新 Activity）时证明身份**。

- `ActivityRecord.token`：位于 system_server 进程，AMS 侧启动 Activity 时创建 ActivityRecord 以及 token
- `Activity.mToken`：位于应用进程，执行 `Activity.attach(ActivityRecord.token)` 时传入 `ActivityRecord.token`
- `Window.mAppToken`：位于应用进程，，执行 `Activity.attach(ActivityRecord.token)` 时创建 PhoneWindow 后调用 Window.setWindowManager() 时传入 `ActivityRecord.token`

### 1 ActivityRecord 和 ActivityClientRecord的关联

ActivityRecord 和 ActivityClientRecord，后续 WMS 创建 WindowState 时传入的 token 就是 以`attr.token` 为 key 获取到的 WindowToken。

``` mermaid
sequenceDiagram
autonumber
ActivityTaskSupervisor ->> ActivityTaskSupervisor:realStartActivityLocked()
ActivityTaskSupervisor ->> ActivityTaskSupervisor:tryRealStartActivityInner(ActivityRecord r)
Note over ActivityTaskSupervisor:1.这里把 ActivityRecord.token 传给 LaunchActivityItem.mActivityToken
ActivityTaskSupervisor ->> ActivityTaskSupervisor:new LaunchActivityItem(r.token)

LaunchActivityItem -->> LaunchActivityItem:execute()
Note over LaunchActivityItem:2.以 mActivityToken 为参数创建 ActivityClientRecord
LaunchActivityItem ->> LaunchActivityItem:new ActivityClientRecord(mActivityToken)
Note right of LaunchActivityItem:ActivityClientRecord 持有 mActivityToken
LaunchActivityItem -->> ActivityThread:handleLaunchActivity(ActivityClientRecord r)

Note left of ResumeActivityItem:传入参数 ActivityClientRecord
ResumeActivityItem -->> ResumeActivityItem:execute(ActivityClientRecord r)
ResumeActivityItem -->> ActivityThread:handleResumeActivity(r)
```

### 2 ActivityClientRecord 和 LayoutParams 的关联

从 handleResumeActivity(ActivityClientRecord) 调用到 `WindowManagerImpl.addView(LayoutParams)` 时传入的是 LayoutParams，在 `WMS.addWindow()` 中通过 `LayoutParams.token` 获取 WindowToken，我们知道在 ActivityClientRecord 中有 mActivityToken，那么 `ActivityClientRecord.mActivityToken` 和 `LayoutParams.token` 是如何关联的呢？

``` mermaid
sequenceDiagram
autonumber
ActivityThread ->> WindowManagerImpl:addView(LayoutParams)
WindowManagerImpl ->> WindowManagerGlobal:addView(LayoutParams)
WindowManagerGlobal ->> Window:adjustLayoutParamsForSubWindow(LayoutParams)
Note over Window:wp.token = mContainer.mAppToken

```

而这个 `mAppToken` 则是在 Activity 创建的时候把 `ActivityClientRecord.token` 赋值给它的。

``` mermaid
sequenceDiagram
autonumber
ActivityThread ->>ActivityThread:performLaunchActivity()
ActivityThread ->> Activity:attach(ActivityClientRecord.token)
Note over Activity,Window:设置 mToken = token;
Activity ->> Window:setWindowManager(IBinder token)
```



### 3 LayoutParams 和 WindowToken 的关联

这个 `ActivityRecord.token` 是 IBinder 对象，定义在 ActivityRecord 中，那么这个 Token 是如何和 WindowToken 关联起来的呢？

就是在 ActivityRecord 构造的时候，调用父类 WindowToken 的构造方法的时候通过 `DisplayContent.addWindowToken()` 关联的：

``` mermaid
sequenceDiagram
autonumber
ActivityStarter ->> ActivityRecord:new ActivityRecord()
ActivityRecord ->> WindowToken:new WindowToken(new Token())
Note right of WindowToken:token 是 IBinder 对象，this 就是 ActivityRecord 了
WindowToken ->> DisplayContent:addWindowToken(token, this)
```

`addWindowToken()` 时会执行 `mTokenMap.put(binder, token)`，即把 ActivityRecord.token 为 key，以 ActivityRecord 为 value 添加到 mTokenMap 中，随后在 `WMS.addWindow()` 中再通过 `DisplayContent.getWindowToken(LayoutParams.token)` 获取到 WindowToken（也就是 ActivityRecord）；

## 3.2 Activity/PhoneWindow 创建

``` mermaid
sequenceDiagram
autonumber
ActivityThread ->> ActivityThread:handleLaunchActivity()
ActivityThread ->> ActivityThread:performLaunchActivity()
Note right of ActivityThread:1.创建 Activity
ActivityThread ->> Instrumentation:newActivity()
ActivityThread ->> Activity:attach()
Note right of Activity:2.创建 PhoneWindow
Activity ->> PhoneWindow:new PhoneWindow()
Note right of Activity:设置回调用于把input事件从Window传递到Activity
Activity ->> PhoneWindow:setCallback()
Note right of Activity:设置 mToken = token;
Activity ->> PhoneWindow:setWindowManager(IBinder token)
ActivityThread ->> Instrumentation:callActivityOnCreate
```

总结

- 创建 Activity
- Activity.attach()
    - 创建 PhoneWindow 并关联，让 Activity 拥有显示内容的容器
    - 把 ActivityRecord.token 传给 Activity 和 PhoneWindow
- 执行 onCreate()

## 3.3 Window 显示 - 应用端

``` mermaid
sequenceDiagram
autonumber
ActivityThread ->>ActivityThread:handleResumeActivity()
Note right of ActivityThread:执行 onResume()
ActivityThread ->>ActivityThread:performResumeActivity()
Note right of ActivityThread:从 PhoneWindow 获取 DecorView
ActivityThread ->> PhoneWindow:getDecorView()
ActivityThread ->> WindowManagerImpl:addView(DecorView)
WindowManagerImpl ->> WindowManagerGlobal:addView(DecorView)
Note right of WindowManagerGlobal:创建 ViewRootImpl
WindowManagerGlobal ->> ViewRootImpl:new ViewRootImpl()
WindowManagerGlobal ->> ViewRootImpl:setView(DecorView)
ViewRootImpl ->> ViewRootImpl:requestLayout()
ViewRootImpl -->> ViewRootImpl:performTraversals()
Note over ViewRootImpl:2.通过 WMS 创建 Surface 并给到应用端
ViewRootImpl ->> ViewRootImpl:relayoutWindow()
Note over ViewRootImpl:3.1 绘制三部曲：测量
ViewRootImpl ->> ViewRootImpl:performMeasure()
Note over ViewRootImpl:3.2 绘制三部曲：布局
ViewRootImpl ->> ViewRootImpl:performLayout()

ViewRootImpl ->> ViewRootImpl:createSyncIfNeeded()
Note over ViewRootImpl,SurfaceSyncGroup:4.1 创建 SurfaceSyncGroup 回调
ViewRootImpl ->> SurfaceSyncGroup:new SurfaceSyncGroup()

Note over ViewRootImpl:3.3 绘制三部曲：绘制
ViewRootImpl ->> ViewRootImpl:performDraw()
Note over ViewRootImpl,SurfaceSyncGroup:4.2 触发执行 SurfaceSyncGroup 回调
ViewRootImpl ->> SurfaceSyncGroup:markSyncReady();
Note over ViewRootImpl:4.3 进入 finish 流程
ViewRootImpl ->> ViewRootImpl:reportDrawFinished()
ViewRootImpl ->> Session:finishDrawing()
Session ->> WMS:finishDrawingWindow()

ViewRootImpl ->> Session:addToDisplayAsUser()
Note over Session,WMS:1.创建挂载 WindowState，并绑定 W 和 WindowState
Session ->> WMS:addWindow()
```

总结

- 执行 onResume()
- 执行 addView()
- 创建 ViewRootImpl 并执行 setView()
    - 创建 Surface
    - 绘制三部曲
    - 创建 SurfaceSyncGroup 回调，其中定义了 `reportDrawFinished()`，在 `performDraw()` 之后触发运行

## 3.4 Window 显示 - system_server 端

### 3.4.1 addWindow()

``` mermaid
sequenceDiagram
autonumber
ViewRootImpl -->> WMS:addWindow()
Note right of WMS:通过 IBinder token 获取 WindowToken
WMS ->> DisplayContent:getWindowToken(IBinder token)
Note over WMS,WindowState:创建 WindowState
WMS ->> WindowState:new WindowState(W, WindowToken)
Note over WMS,WindowState:创建 InputChannel
WMS ->> WindowState:openInputChannel(outInputChannel)
Note over WMS:把 W 对象和 WindowState 放入 Map
WMS ->>WMS:mWindowMap.put(W, win)
Note over WMS:挂载 WindowState 到 ActivityRecord(WindowToken)
WMS ->>WMS:addWindowInner()
```

总结

- 根据 ActivityRecord.token 获取 WindowToken
- 创建 WindowState，参数有 WindowToken 和 W 对象
- 创建 InputChannel
- 挂载 WindowState（详见 [1.2.2 创建挂载 WindowState](# 1.2.2 创建挂载 WindowState)）

### 3.4.2 relayoutWindow()

``` mermaid
sequenceDiagram
autonumber
ViewRootImpl ->> ViewRootImpl:performTraversals()
ViewRootImpl ->> ViewRootImpl:relayoutWindow()


ViewRootImpl ->> Session:relayout()
Note over Session,WMS:WindowRelayoutResult 持有 mTmpFrames,SC 也是 WMS 侧写入的
Session ->> WMS:relayoutWindow(WindowRelayoutResult, SurfaceControl)
Note over WMS:创建 Buffer 类型的 Surface
WMS ->> WMS:createSurfaceControl()
WMS ->> WindowAnimator:createSurfaceLocked()
Note over WMS,WindowAnimator:把构建好的 mSurfaceControl 给到 outSurfaceControl
WMS ->> WindowAnimator:getSurfaceControl()

Note over WMS,WindowPlacerLocked:计算窗口大小
WMS ->> WindowPlacerLocked:performSurfacePlacement()
Note over WMS,WindowState:填充 WMS 计算好后的数据，返回应用端
WMS ->> WindowState:fillClientWindowFramesAndConfiguration()

Note over ViewRootImpl:创建 BLASTBufferQueue 并绑定 Surface
ViewRootImpl ->> ViewRootImpl:updateBlastSurfaceIfNeeded()
Note over ViewRootImpl:将 WMS 计算的窗口大小设置到 mTmpFrames
ViewRootImpl ->> ViewRootImpl:setFrame(mTmpFrames.frame)
Note over ViewRootImpl:通过 mWinFrame.set(frame) 为 mWinFrame 赋值
```

总结

- relayoutWindow() 传入的 WindowRelayoutResult 和 SurfaceControl 参数会经过处理后返回给应用
    - 创建 Buffer 类型的 Surface(详见 [2.3 BufferStateLayer 创建](# 2.3 BufferStateLayer 创建))
    - 计算窗口大小
- 创建 BLASTBufferQueue 并绑定 Surface

### 3.4.3 finishDrawingWindow()

``` mermaid
sequenceDiagram
autonumber
ViewRootImpl ->> ViewRootImpl:performTraversals()
ViewRootImpl ->> ViewRootImpl:createSyncIfNeeded()
ViewRootImpl ->> ViewRootImpl:reportDrawFinished()
ViewRootImpl ->> Session:finishDrawing()
Session ->> WMS:finishDrawingWindow()

Note over WMS:获取对应的 WindowState
WMS ->> WMS:windowForClient()
WMS ->> WindowState:finishDrawing()
Note over WindowState,WindowStateAnimator:设置 COMMIT_DRAW_PENDING
WindowState ->> WindowStateAnimator:finishDrawingLocked()
WMS ->> WindowPlacerLocked:requestTraversal()
```



requestTraversal() 流程

``` mermaid
sequenceDiagram
autonumber
WMS ->> WindowPlacerLocked:requestTraversal()
WindowPlacerLocked ->> WindowPlacerLocked:performSurfacePlacement()
WindowPlacerLocked ->> WindowPlacerLocked:performSurfacePlacementLoop()
WindowPlacerLocked ->> RootWindowContainer:performSurfacePlacement()
Note over RootWindowContainer:处理 Surface 事务
RootWindowContainer ->> RootWindowContainer:applySurfaceChangesTransaction()
Note over RootWindowContainer，DisplayContent:遍历每个屏幕
RootWindowContainer ->> DisplayContent:applySurfaceChangesTransaction()
Note over DisplayContent:1.relayoutWinodw 流程
DisplayContent ->> DisplayContent:performLayout()
	DisplayContent ->> DisplayContent:performLayoutNoTrace()
	Note over DisplayContent:1.1对所有顶级窗口进行布局
	DisplayContent ->> DisplayContent:forAllWindows(mPerformLayout)
	Note over DisplayContent:1.2处理子窗口的布局
	DisplayContent ->> DisplayContent:forAllWindows(mPerformLayoutAttached)
Note over DisplayContent:遍历所有窗口执行 lambda表达式
DisplayContent ->> DisplayContent:forAllWindows(mApplySurfaceChangesTransaction)
Note over DisplayContent,WindowStateAnimator:2.设置 READY_TO_SHOW
DisplayContent ->> WindowStateAnimator:commitFinishDrawingLocked()
Note over WindowState,WindowStateAnimator:满足条件会设置为 HAS_DRAW
WindowStateAnimator ->> WindowState:performShowLocked()
Note over WindowState,ActivityRecord:类型不是窗口，就移除 startwindow
Note over WindowState,ActivityRecord:3.真正设置为 HAS_DRAW 的地方
WindowState ->> ActivityRecord:onFirstWindowDrawn()
```

总结

- 应用端绘制后触发了 `finishDrawingWindow()` 流程

- system_server 把窗口的 Surface 状态从 `DRAW_PENDING`更新到 `COMMIT_DRAW_PENDING`，表示准备提交

- 然后触发一次 layout 这次 layout 的目的是将这个窗口的 Surface 显示到屏幕上

    - 状态设置到 `READY_TO_SHOW` 表示准备显示

    - 状态设置到 `HAS_DRAWN` 表示已经显示在屏幕上

    - 把这次 layout 对 Surface 的操作通过 `SurfaceControl.Transaction` 统一提交到 SurfaceFlinger

- SurfaceFlinger 显示窗口的 Layer



系统 Window 或者 StartWindow 在 `commitFinishDrawingLocked()` 阶段会直接设置 `HAS_DRAWN`

# 4 Activity 启动流程

