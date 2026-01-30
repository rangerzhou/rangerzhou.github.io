---
title: Android - 动画专题
date: 2025-05-25 23:19:18
tags:
categories: Android
copyright: true
password:
published: false
---

> WMS 动画专题。

<!--more-->



动画类型

- 本地动画
- 远程动画

Leash 的 Surface 图层特点

- 把需要进行动画的子节点都挂到这个 leash 节点



# 窗口动画

为窗口添加动画，比如 Activity 内打开一个 TYPE_APPLICATION_OVERLAY 窗口，窗口渐变显示和渐变退出的动画。

定义动画

``` xml
<!--exit.xml-->
<set xmlns:android="http://schemas.android.com/apk/res/android">
    <alpha android:fromAlpha="1.0" andrid:toAlpha="0.0" android:duration="1000" />
</set>
<!--enter.xml-->
<set xmlns:android="http://schemas.android.com/apk/res/android">
    <alpha android:fromAlpha="0.0" andrid:toAlpha="1.0" android:duration="1000" />
</set>

<!--style.xml-->
<style name="MyWindow">
    <item name="android:windowEnterAnimation">@anim/enter</item>
    <item name="android:windowExitAnimation">@anim/exit</item>
</style>
```

使用动画

``` java
WindowManager.LayoutParams mLayoutParams;
mLayoutParams = new WindowManager.LayoutParams();
mLayoutParams.type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
mLayoutParams.windowAnimations = R.style.MyWindow;
```

点击打开窗口后，会发现有动画了，通过查看 WinScope，发现有一个 window_animation 类型的 leash 挂载到了 WindowState 的上面，在 WindowToken 的下面。

查找动画流程的方法：根据 winscope 中的 animation-leash 信息，直接在源码中搜索，发现是在 `SurfaceAnimator.createAnimationLeash()` 中设置的，然后在这个方法里打印堆栈信息；

从 commitFinishDrawingLocked() 开始

## 总结

- 在 `commitFinishDrawingLocked()` 开始，逐步调用到 `SurfaceAnimator.createAnimationLeash()`
- 创建 leash 图层，挂在 WindowToken 下面，WindowState 上面
- 动画结束后，通过回调，开始执行退出动画
- 

# 应用切换动画

常见 proto log：`WM_DEBUG_REMOTE_ANIMATIONS/WM_DEBUG_ANIM WM_DEBUG_APP_TRANSITIONS_ANIM/WM_DEBUG_APP_TRANSITIONS/WM_DEBUG_STARTING_WINDOW/WM_DEBUG_STATES/WM_SHOW_SURFACE_ALLOC`



andrid 手机，从桌面点击图标打开短信应用，这个过程中抓取了 WinScope，显示有5个动画： 

- 壁纸动画（<font color=red>**壁纸稍微动一下（视差效果）**</font>）：挂载在 WallpaperWindowToken 之上的 Surface `animation-leash of window_animation`

    ``` scss
    Leaf:0:1#8
    └── Surface leash-animation of window_animation
      ├── WallpaperWindowToken
        ├── ImageWallpaper
          ├── ImageWallpaper
            ├── Wallpaper BBQ wrapper
    ```

    

- Launcher 动画（<font color=red>**Launcher 缩小消失**</font>）：挂载在 DefaultTaskDisplayArea 之下，Launcher Task 之上的 Surface `animation-leash of app_transition`

    ``` scss
    DefaultTaskDisplayArea
    └── Surface leash-animation of app_transition
      ├── Task(Launcher)
        ├── ActivityRecord
          ├── SplashScreen WindowState
    ```

    

- APP 打开动画（<font color=red>**短信整体（带着 SplashScreen）放大跳出来**</font>）：挂载在 DefaultTaskDisplayArea 之下，短信 Task（Task 的 ActivityRecord 的 WindowState 是短信的 SplashScreen 图层） 之上的 Surface `animation-leash of app_transition`

    ``` scss
    DefaultTaskDisplayArea
    └── Surface leash-animation of app_transition
      ├── Task(短信)
        ├── ActivityRecord
          ├── SplashScreen WindowState
    ```

    

- starting_reveal（<font color=red>**准备好“揭开”帘子，露出后面的短信主页**</font>）：挂载在短信 ActivityRecord 和短信 Activity WindowState 之间的 Surface `animation-leash of starting_reveal` 图层，而且这个图层和 SplashScreen 所在 WindowState 的图层是同级的

    ``` scss
    Task
    └── ActivityRecord（短信主页 Activity）
      ├── Surface leash-animation of starting_reveal
        ├── App 主 WindowState（短信主页）
      ├── SplashScreen WindowState
    ```

    

- splash screen 移除（<font color=red>**帘子（SplashScreen）自己执行淡出/缩放动画，彻底离开舞台**</font>）：挂载在短信 ActivityRecord 和短信 SplashScreen WindowState 之间的 Surface `animation-leash of window_animation` 图层

    ``` scss
    Task 
    └── ActivityRecord（短信主页 Activity）
      ├── App 主 WindowState（短信主页）
      ├── Surface leash-animation of window_animation
        ├── SplashScreen WindowState
    ```




<font color=blue>**针对第二步和第五步，能看到 SplashScreen 的显示和移除，为什么一个是 app_transition，一个是 window_animation？**</font>

这是由于 **动画的发起者和作用域** 不同决定的：

- 第 2 步：`app_transition`（应用间切换动画）

    - **本质**：这是由 `Launcher` 退出、`短信 Task` 进入的“整体大转场”。

    - **为什么叫这个名字**：在 WMS 中，当发生 Activity 切换时，系统会创建一个 `RemoteAnimationAdapter`。这时生成的 Leash（控制杠杆）通常被标记为 `app_transition`，因为它代表的是 **Task 或 ActivityRecord 级别** 的宏观过渡。它负责把短信的整个 Task 作为一个整体进行位移或缩放。

    - **SplashScreen 的角色**：此时 SplashScreen 已经在短信的 Task 里了，所以它会跟着这个 `app_transition` 的 Leash 一起动（比如从图标处放大的效果）。

- 第 5 步：`window_animation`（窗口级动画）

    - **本质**：这是 SplashScreen **自身消失** 的动画。
    - **为什么叫这个名字**：当短信应用的第一帧（真正的内容）绘制完成后，SplashScreen 完成了使命，需要“功成身退”。此时的动画不再是应用间的切换，而是 **同一个 Activity 内部，两个窗口状态之间的平滑过渡**。
    - **逻辑**：系统通过 `SplashScreenView#remove()` 触发消失逻辑，WMS 为这个特定的 WindowState（SplashScreen）单独创建一个 Leash 来执行退出（通常是淡出或缩放）。在代码层级，这类针对特定 Window 的动画常被归类为 `window_animation`。

<font color=blue>**什么时候是 window_animation / app_transition / starting_reveal？**</font>

这三者代表了 Android 动画框架中不同的层级和职责：

- App Transition (应用过渡)
    - **触发时机**：跨 Activity、跨 Task 切换时。
    - **作用对象**：通常挂载在 `Task` 或 `ActivityRecord` 级别。
    - **特点**：它是“外层壳子”的动画。比如你看到的第 2 步（Launcher 逻辑）和第 3 步（短信进入逻辑）。
- Window Animation (窗口动画)
    - **触发时机**：特定窗口（WindowState）的显示、隐藏、移除，或者是不涉及 Activity 切换的窗口变化（如弹窗弹出）。
    - **作用对象**：挂载在 `WindowState` 级别。
    - **特点**：它是“内层元素”的动画。你看到的第 5 步正是为了让 SplashScreen 消失时不显得突兀，单独给它加的特效。
- Starting Reveal (启动揭露)
    - **触发时机**：这是 **Android 12+ SplashScreen 体系** 特有的机制。
    - **作用对象**：处于 Activity 层次结构中间，用来衔接“启动图”和“真实内容”。
    - **特点**：
        - 它的存在是为了实现 **“揭露”效果**（Reveal Effect）。
        - 当 SplashScreen 还在上面盖着，而下面的 `App 主 WindowState` 准备好了，系统会通过这个 Leash 同步两者的状态。
        - 你看到的第 4 步正是起到了“承重墙”的作用：它确保在 SplashScreen 消失的过程中，底下的主界面能以正确的节奏显示出来。







