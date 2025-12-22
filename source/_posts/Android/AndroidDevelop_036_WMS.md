---
title: Android - WMS
date: 2024-06-25 23:26:08
tags:
categories: Android
copyright: true
password:
---

> Android WMS 窗口层级树
>
> 源码版本：android-15-0.0_r23

<!--more-->

------

# WMS 窗口层级树

## <font color=red>顶层</font>

- RootWindowContainer：WMS 管理的 **全局根节点**，整个系统 **唯一实例**，根窗口容器，对应 `dumpsys containers` 中的 `ROOT`，孩子是 DisplayContent
  - 职责：
    - 管理所有 Display（多屏）


``` scss
RootWindowContainer
 └── DisplayContent (一个或多个)
```

## <font color=red>Display 级别</font>

- DisplayContent：代表一个屏幕，一个物理/逻辑 Display 对应一个 DisplayContent，对应 `dumpsys containers` 中的 `Display`
  - 职责：
    - 管理该 Display 上的：
      - DisplayArea
      - WindowToken
      - 输入分发
      - Display policy（状态栏/导航栏）


``` scss
DisplayContent
 ├── DisplayArea（根）
 │    └── TaskDisplayArea
 │         └── Task
 │              └── ActivityRecord
 │                   └── WindowState
 ├── WallpaperWindowToken
 ├── ImeContainer
 └── 其他系统 WindowToken
```

## <font color=red>DisplayArea 体系</font>

- DisplayArea：把 Display 内部再划分为**逻辑区域**，DisplayArea 是 **“区域容器”**，不是窗口

  - 用于：
    - System UI
    - App 区
    - IME 区
    - Wallpaper 区

- DisplayArea 的核心子类

  - TaskDisplayArea（App 主区域）：承载 **Task（任务栈）** 的区域，代表了屏幕上一块专门用来存放 App 窗口的区域，每个 Display 至少一个，DefaultTaskDisplay是TaskDisplayArea的别名
    - **职责**
      - 管理：
        - Task 的 Z-order
        - 分屏 / Freeform / 多窗口
        - Home / Recents Task


  ``` scss
  TaskDisplayArea
   └── Task
  ```

  - ImeContainer：输入法（IME）专用容器，继承自 DisplayArea.Tokens，同样是一个 WindowToken 的容器，即孩子也是 WindowToken
    - 职责
      - 确保 IME：
        - 总在应用之上
        - 又低于状态栏

      - 单独做动画、Insets 计算


``` scss
ImeContainer
 └── WindowState (InputMethod)
```

- 其他 DisplayArea
  - StatusBar 区
  - NavigationBar 区
  - SystemUI Overlay 区

## <font color=red>Task 与 Activity 体系</font>

- Task（原 TaskRecord）：一个 **任务栈**，对应一个应用或一组 Acitivity，比如最近任务里就是一个个 Task

  - 职责
    - 管理：
      - Activity 的层级
      - Task 的 Surface
      - Task-level 动画


  ``` scss
  Task
   └── ActivityRecord
  ```

- ActivityRecord：AMS 中 Activity 的表示，在 WMS 中承担 **Activity 窗口容器**

  - 一个 Activity 可以有
    - 主 Window
    - Dialog Window
    - Popup Window


  ``` scss
  ActivityRecord
   └── WindowState (一个或多个)
  ```

## <font color=red>WindowToken 体系（窗口分组）</font>

- WindowToken：一组 WindowState 的 **逻辑归属**，Binder Token 对应（？）

  ``` scss
  WindowToken
   └── WindowState
  ```

- WallpaperWindowToken（特殊 Token）：专门用于 **壁纸窗口**

  - Z-order 特殊（始终最底）
  - 不参与普通 Task 管理

  ``` scss
  WallpaperWindowToken
   └── WindowState (Wallpaper)
  ```

## <font color=red>最底层：WindowState</font>：

- WindowState（真正的窗口）：单个窗口，对应 App 侧的 `ViewRootImpl`，继承 WindowContainer，**addWindow 的产物**

  - 管理：

    - LayoutParams
    - 可见性
    - Insets
    - SurfaceControl

  - > WindowState 才是“真正的窗口”，其余都是“容器”。

  

## <font color=red>持有 WindowState 的容器</font>

  - WindowToken：继承自 WindowContainer
    - App 之上的窗口，父容器为 WindowToken，如 StatusBar 和 NavigationBar
  - ActivityRecord：继承自 WindowToken，一个 ActivityRecord 就代表一个 Activity
    - App 窗口，父容器为 ActivityRecord，如 Launcher
  - WallpaperWindowToken：继承自 WindowToken，用来存放和 Wallpaper 相关的窗口
    - App 之下的窗口，父容器为 WallpaperWindowToken，如 ImageWallpaper 窗口

- DisplayArea.Tokens：继承自 DisplayArea，即包含 WindowToken 的 DisplayArea，WindowToken 的容器



## 层级关系总览（简化 ASCII 图）

``` scss
RootWindowContainer
└── DisplayContent
    ├── DisplayArea.Root
    │   ├── SystemUI Area
    │   ├── TaskDisplayArea
    │   │   └── Task
    │   │       └── ActivityRecord
    │   │           └── WindowState
    │   └── ImeContainer
    │       └── WindowState (IME)
    ├── WallpaperWindowToken
    │   └── WindowState
    └── Other WindowToken
        └── WindowState
```

## 总结

WMS 以 `WindowContainer` 为基础构建一棵层级树：

- `RootWindowContainer` 管全局，`DisplayContent` 管屏
- `DisplayArea` 划区域，`TaskDisplayArea` 管应用任务
- `Task → ActivityRecord → WindowState` 构成应用窗口链路
- IME 和 Wallpaper 通过专用容器保证层级与布局独立性



# addWindow() → WindowState 挂树全过程

## addWindow 的入口链路（宏观）

``` scss
App 进程
└── ViewRootImpl.setView()
    └── IWindowSession.addToDisplay()
        └── WindowManagerService.addWindow()
```

addWindow **一定发生在 Activity onResume 之后**

不是 AMS 调用，是 **App 主动请求**







addWindow 的本质是：
**创建 WindowState → 根据 Token 找父容器 → 挂入 WindowContainer 树 → 创建 Surface → 参与 layout。**



# Activity 启动时 Task / ActivityRecord / WindowState 创建顺序

## 总体时序

``` scss
Task
 → ActivityRecord
   → Activity 生命周期
     → addWindow
       → WindowState
```

重点

- **Task / ActivityRecord 早于 WindowState**
- WindowState 一定最晚

## 详细时序（含 AMS / WMS 边界）

### Step 1：AMS 创建 Task

``` scss
ActivityStarter.startActivity()
└── Task created / reused
```

可能是：

- 新 Task
- 复用已有 Task

### Step 2：AMS 创建 ActivityRecord

``` java
new ActivityRecord(...)
```

此时还没有窗口，只是“逻辑 Activity”

### Step 3：Task 挂入 TaskDisplayArea（WMS）

``` scss
TaskDisplayArea
└── Task
```

这是 **AMS → WMS 的第一次关键交集**

### Step 4：ActivityRecord 挂入 Task

``` scss
Task
└── ActivityRecord
```

### Step 5：Activity 进入生命周期

``` scss
onCreate()
onStart()
onResume()
```

Activity 可见，**但窗口还不存在**

### Step 6：ViewRootImpl 触发 addWindow

``` scss
onResume()
└── ViewRootImpl.setView()
    └── addWindow()
```

### Step 7：WMS 创建 WindowState 并挂入 ActivityRecord

``` scss
ActivityRecord
└── WindowState
```

### Activity 启动完整容器生成图

``` scss
TaskDisplayArea
└── Task               ★ AMS 创建
    └── ActivityRecord ★ AMS 创建
        └── WindowState★ WMS addWindow 创建
```

### 总结

- Activity 启动时，AMS 先创建 Task 和 ActivityRecord 并挂入 TaskDisplayArea
- 当 Activity onResume 后，App 通过 addWindow 向 WMS 请求创建 WindowState
- WMS 根据 WindowToken 和 WindowType 决定挂载路径
- 最终形成 Task → ActivityRecord → WindowState 的完整窗口层级

## Q/A

### Q1：为什么 WindowState 不能早点创建？

**答**

- 需要 View 层级
- 需要 LayoutParams
- 需要 Activity 完成 resume

### Q2：Task / ActivityRecord 属于 AMS 还是 WMS？

**答**

- 生命周期归 AMS
- Surface / 层级 / Z-order 归 WMS
- **逻辑在 AMS，表现归 WMS**

### Dialog / Popup 在哪？

**答**

- 同一个 ActivityRecord
- 多个 WindowState



# 面试

------

## 第一轮：WMS 核心架构（必问）

------

### Q1：你整体讲一下 WindowManagerService 的容器体系？

**标准回答（高级）**

> WMS 以 WindowContainer 为基础构建一棵层级树。
> 顶层是 RootWindowContainer，管理所有 DisplayContent。
> 每个 DisplayContent 通过 DisplayArea 再划分系统区、应用区和 IME 区。
> 应用窗口路径是 TaskDisplayArea → Task → ActivityRecord → WindowState。
> WindowState 才是真正的窗口，其余都是用于层级、Z-order 和布局管理的容器。

**追问点**

- DisplayArea 引入的背景
- Task / ActivityRecord 为什么在 WMS

------

### Q2：addWindow 是谁调用的？什么时候发生？

**标准回答**

> addWindow 不是 AMS 调用的，而是 App 在 Activity onResume 后，
> ViewRootImpl 调用 IWindowSession.addToDisplay 触发的。
> 这个时机保证了 View 树和 LayoutParams 已经准备好。

**追问**

- 如果 Activity 没 onResume 会怎样？
- SplashScreen 在哪里创建？

------

## 第二轮：Task / Activity / Window 的边界（高频）

------

### Q3：Task 和 ActivityRecord 是 AMS 的类，为什么出现在 WMS？

**标准回答**

> Task 和 ActivityRecord 的生命周期和调度在 AMS，
> 但它们同时也是窗口的容器，需要参与 Z-order、动画和 Surface 管理，
> 所以在 WMS 中也有对应实例。
> 本质是 **逻辑在 AMS，显示在 WMS**。

**追问（高阶）**

- Task Surface 是谁创建的？
- Task-level 动画在哪一层做？

------

### Q4：一个 Activity 可以有几个 WindowState？

**标准回答**

> 至少一个主窗口，
> Dialog、PopupWindow、子窗口都会对应独立的 WindowState，
> 但都归属于同一个 ActivityRecord。

**淘汰点**

- 回答“一个 Activity 只有一个窗口”

------

## 第三轮：车载 / 多 Display（高级岗位分水岭）

------

### Q5：车载系统中，多屏是如何在 WMS 中建模的？

**标准回答**

> 每个物理或虚拟屏幕对应一个 DisplayContent。
> 主驾、副驾、中控、副屏都是独立 DisplayContent，
> 每个 DisplayContent 内部有自己的 DisplayArea 和 TaskDisplayArea。
> 输入、焦点、窗口层级都是 Display 维度隔离的。

**追问**

- Activity 能否跨 Display？
- 一个 Task 能否存在于多个 Display？

------

### Q6：Car 中 IME 显示在哪个 Display？如何控制？

**标准回答**

> IME 属于 ImeContainer，挂在特定 DisplayContent 下。
> 车载系统通常通过 DisplayPolicy 或 CarInputService
> 明确指定 IME 目标 Display，
> 避免副屏弹出输入法影响主驾。

**加分点**

- 提到 Insets 控制
- 提到 Car UX Restriction

------

## 第四轮：输入、焦点与安全（高级必考）

------

### Q7：WMS 是如何决定当前焦点窗口的？

**标准回答**

> 焦点以 Display 为单位管理。
> WMS 在 DisplayContent 中维护 focusedWindow，
> 根据可见性、Z-order、WindowType 以及输入模式动态更新。

**追问**

- IME 显示时焦点是否变化？
- Overlay 窗口能否抢焦点？

------

### Q8：车载系统如何防止 Overlay 滥用？

**标准回答**

> 车载系统通常禁用或限制 SYSTEM_ALERT_WINDOW，
> 并通过白名单 + WindowType 校验，
> 防止第三方应用创建高层级窗口遮挡驾驶信息。

**加分**

- 提到 CTS / VHAL / UX 安全规范

------

## 第五轮：源码级深挖（高级淘汰题）

------

### Q9：IME 弹出时，WMS 内部发生了什么？

**标准回答**

> IME WindowState 被加入 ImeContainer，
> WMS 重新计算 Insets，
> TaskDisplayArea 中的应用窗口根据 IME 高度调整布局，
> 同时通过 SurfaceControl Transaction 保证动画同步。

**追问**

- Insets 是谁计算的？
- 为什么 IME 不走普通 WindowToken？

------

### Q10：如果一个窗口不显示，你如何排查？

**标准回答**

> 我会从三层排查：
> 1）WindowState 是否 visible / hasSurface
> 2）父容器是否被隐藏或 Z-order 被遮挡
> 3）Surface 是否被裁剪、alpha 为 0 或未提交 transaction
> 同时结合 dumpsys window 和 SurfaceFlinger 分析。

**加分**

- 提到 `dumpsys window containers`
- 提到 `SurfaceFlinger --list`

------



### Q11：addWindow 是怎么知道该挂到哪？

> 先用 WindowToken 确定逻辑归属，再用 WindowType 匹配 DisplayArea，最后由 DisplayPolicy 选择具体父容器并完成挂载
>
> **先用 WindowToken 确定逻辑归属**
>  → 确定窗口在系统语义上属于 Activity / IME / SystemUI / Wallpaper
>
> **再用 WindowType 匹配 DisplayArea**
>  → 决定窗口位于 Display 的应用区 / 系统区 / IME 区
>
> **最后由 DisplayPolicy 选择具体父容器并完成挂载**
>  → 在选定区域内，结合设备策略，确定最终 parent（ActivityRecord / ImeContainer / WindowToken），并将 WindowState 挂入 WindowContainer 树
>
> Token 定身份，Type 定区域，Policy 定位置。



#### 逻辑归属

这个窗口在系统语义上属于哪一类实体，不是 UI 位置，而是 **生命周期、权限、分组关系**。

常见逻辑归属分类

| 逻辑归属        | 对应 Token             |
| --------------- | ---------------------- |
| Activity 的窗口 | ActivityRecord         |
| 输入法          | InputMethodWindowToken |
| 壁纸            | WallpaperWindowToken   |
| SystemUI        | SystemWindowToken      |
| Toast / Overlay | 对应 SystemWindowToken |

WindowToken 在 addWindow 中起什么作用

在 `addWindow()` 里，第一件事是：

``` java
WindowToken token = displayContent.getWindowToken(tokenBinder);
```

**这一步做了两件事：**

1. 确定 **这个窗口“跟谁走”**
2. 确定 **它将来只能挂在哪些容器下面**



举例说明：

- Activity 窗口 `token = ActivityRecord`
  - **含义**
    - 这个 WindowState：
      - 生命周期跟 Activity
      - Z-order 跟 Task
      - 不能脱离 TaskDisplayArea
- IME 窗口 `token = InputMethodWindowToken`
  - **含义**
    - 生命周期不跟 Activity
    - 必须走 ImeContainer
    - 不能进 Task 栈

WindowToken 决定的是：
**这个窗口“在语义上属于谁”，以及“它不可能被挂到哪里”。**

#### 匹配 DisplayArea

Token 决定“归谁”，Type 决定“在屏幕的哪个区域层级”

DisplayArea 是 **Display 内的逻辑分区**，不是最终父容器，而是 **候选区域**

``` scss
DisplayContent
└── DisplayArea.Root
    ├── SystemUI Area
    ├── TaskDisplayArea
    └── ImeContainer
```

**WindowType 决定：**

- Z-order 范围
- 是否参与 Insets
- 属于系统区还是应用区

“匹配 DisplayArea” 实际做了什么

核心调用（语义）：

``` java
DisplayArea targetArea =
    displayContent.findAreaForWindowType(type, token);
```

匹配结果不是 WindowState，而是：一个 DisplayArea（区域级容器）

几个典型匹配结果

- 普通应用窗口

  ``` scss
  TYPE_BASE_APPLICATION
  → TaskDisplayArea
  
  ```

- IME

  ``` scss
  TYPE_INPUT_METHOD
  → ImeContainer
  ```

- StatusBar / NavBar

  ``` scss
  TYPE_STATUS_BAR / TYPE_NAVIGATION_BAR
  → SystemUI DisplayArea
  ```

- Wallpaper

  ``` scss
  TYPE_WALLPAPER
  → WallpaperWindowToken（特殊）
  ```

此时只确定“区域”，还没决定“具体挂在哪个节点”，WindowType 决定的是：

- **这个窗口“属于 Display 的哪一个逻辑区域”。**

#### 选择具体容器

DisplayPolicy 是 **设备 / 场景定制入口**，尤其重要于：车载/TV/多屏，它掌握：

- SystemUI 布局
- 窗口层级策略
- Insets 规则

DisplayPolicy 在 addWindow 中的位置，在找到 DisplayArea 后：

``` java
WindowContainer parent =
    displayPolicy.getParentWindowContainerForWindow(win, area);
```

DisplayPolicy 是如何“选父容器”的

- 应用窗口

  ``` text
  DisplayArea = TaskDisplayArea
  Token = ActivityRecord
  → parent = ActivityRecord
  ```

  最终结构:

  ``` scss
  Task
  └── ActivityRecord
      └── WindowState
  ```

  

- Diag/Panel

  ``` text
  DisplayArea = TaskDisplayArea
  Token = ActivityRecord
  Type = APPLICATION_PANEL
  → parent = ActivityRecord
  ```

  最终结构:

- IME

  ``` text
  DisplayArea = ImeContainer
  → parent = ImeContainer
  ```

- SystemUI

  ``` text
  DisplayArea = SystemUI Area
  → parent = 对应的 SystemWindowToken
  ```

  
