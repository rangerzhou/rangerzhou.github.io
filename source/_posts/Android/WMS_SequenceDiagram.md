

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

#### 1 ActivityRecord 和 WindowToken 的关联

ActivityRecord 和 ActivityClientRecord，后续 WMS 创建 WindowState 时传入的 token 就是 ActivityRecord.token，token 弱引用指向 ActivityRecord。

``` mermaid
sequenceDiagram
autonumber
ActivityTaskSupervisor ->> ActivityTaskSupervisor:realStartActivityLocked()
ActivityTaskSupervisor ->> ActivityTaskSupervisor:tryRealStartActivityInner(ActivityRecord r)
Note over ActivityTaskSupervisor:这里把 ActivityRecord.token 传给 LaunchActivityItem.mActivityToken
ActivityTaskSupervisor ->> ActivityTaskSupervisor:new LaunchActivityItem(r.token)

LaunchActivityItem -->> LaunchActivityItem:execute()
LaunchActivityItem ->> LaunchActivityItem:new ActivityClientRecord(mActivityToken)
Note right of LaunchActivityItem:ActivityClientRecord 持有 mActivityToken
LaunchActivityItem -->> ActivityThread:handleLaunchActivity(ActivityClientRecord r)

Note left of ResumeActivityItem:传入了 ActivityClientRecord
ResumeActivityItem -->> ResumeActivityItem:execute(ActivityClientRecord r)
ResumeActivityItem -->> ActivityThread:handleResumeActivity(r)
```

这个 `ActivityRecord.token` 是 IBinder 对象，定义在 ActivityRecord 中，那么这个 Token 是如何和 WindowToken 关联起来的呢？

就是在 ActivityRecord 构造的时候，调用父类 WindowToken 的构造方法的时候通过 `DisplayContent.addWindow()` 关联的：

``` mermaid
sequenceDiagram
autonumber
ActivityStarter ->> ActivityRecord:new ActivityRecord()
ActivityRecord ->> WindowToken:new WindowToken(new Token())
Note right of WindowToken:token 是 IBinder 对象，this 就是 ActivityRecord 了
WindowToken ->> DisplayContent:addWindowToken(token, this)
```



#### 2 WindowState 挂载

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
Note right of Session:Session 持有 WMS
Session ->> WMS:addWindow(W)
Note right of WMS:获取 WindowToken，弱引用指向 ActivityRecord
WMS ->> DisplayContent:getWindowToken()
Note over WMS:创建 WindowState
WMS -->> WMS:new WindowState()
Note over WMS,WindowState:创建 InputChannel
WMS ->> WindowState:openInputChannel(outInputChannel)
Note over WMS:把 W 对象和 WindowState 放入 Map
WMS ->>WMS:mWindowMap.put(W, win)

WMS ->> WMS:addWindowInner()
Note over WMS,ActivityRecord:win.mToken.addWindow(win)
WMS ->> ActivityRecord:addWindow(WindowState)
ActivityRecord ->> WindowToken:addWindow(WindowState)
Note over WindowToken:挂载 WindowState 到 ActivityRecord
WindowToken ->> WindowToken:addChild()
```

#### 3 总结

- resume() 流程中通过 `addView() -> setView() -> addWindow()`，在 WMS 中创建了  WindowState，并且<font color=red>**通过 `addChild()` 挂载到了 ActivityRecord**</font>；
- 创建 WindowState 时传入了 IWindow(W 对象，用于 WMS 和 Window 窗口回调之间通信的 binder) 以及 WindowToken(<font color=red>**详见前述 WindowToken 和 ActivityRecord.Token(IBinder) 的关联**</font>)；
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

从 [1.1 DisplayArea 层级树构建流程](#1.1 DisplayArea 层级树构建流程) 和 [1.2 挂载应用窗口](1.2 挂载应用窗口) 的分析可以得知，挂载操作都是在 `addChild()` 操作中，所以我们从 `addChild()` 开始分析。

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



# 3 WMS 窗口显示



# 4 Activity 启动流程

