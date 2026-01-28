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



- window_animation
    - 壁纸动画，leash 挂到了 `WallpaperWindowToken` 的上面
- app_transition，挂在 `DefaultTaskDisplayArea` 下面
    - Launcher 关闭动画：挂在 `ActivityRecord  的 Task 上面`
    - APP 打开动画：展示 Splash Screen 的 Window 的时候，挂在 `ActivityRecord  的 Task 上面`
    - 
- 



andrid 手机，从桌面点击图标打开短信应用，这个过程中抓取了 WinScope，显示有5个动画： 

- 壁纸动画：挂载在 WallpaperWindowToken 之上的 Surface `animation-leash of window_animation`

    ``` scss
    Leaf:0:1#8
    └── Surface leash-animation of window_animation
      ├── WallpaperWindowToken
        ├── ImageWallpaper
          ├── ImageWallpaper
            ├── Wallpaper BBQ wrapper
    ```

    

- Launcher 动画：挂载在 DefaultTaskDisplayArea 之下，Launcher Task 之上的 Surface `animation-leash of app_transition`

    ``` scss
    DefaultTaskDisplayArea
    └── Surface leash-animation of app_transition
      ├── Task(Launcher)
        ├── ActivityRecord
          ├── SplashScreen WindowState
    ```

    

- APP 打开动画：挂载在 DefaultTaskDisplayArea 之下，短信 Task（Task 的 ActivityRecord 的 WindowState 是短信的 SplashScreen 图层） 之上的 Surface `animation-leash of app_transition`

    ``` scss
    DefaultTaskDisplayArea
    └── Surface leash-animation of app_transition
      ├── Task(短信)
        ├── ActivityRecord
          ├── SplashScreen WindowState
    ```

    

- 挂载在短信 ActivityRecord 和短信 Activity WindowState 之间的 Surface `animation-leash of starting_reveal` 图层，而且这个图层和 SplashScreen 所在 WindowState 的图层是同级的

    ``` scss
    Task
    └── ActivityRecord（短信主页 Activity）
      ├── Surface leash-animation of starting_reveal
        ├── App 主 WindowState（短信主页）
      ├── SplashScreen WindowState
    ```

    

- 挂载在短信 ActivityRecord 和短信 SplashScreen WindowState 之间的 Surface `animation-leash of window_animation` 图层

    ``` scss
    Task 
    └── ActivityRecord（短信主页 Activity）
      ├── App 主 WindowState（短信主页）
      ├── Surface leash-animation of window_animation
        ├── SplashScreen WindowState
    ```

    

















