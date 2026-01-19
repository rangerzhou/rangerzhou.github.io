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

壁纸动画 window_animation，leash 挂到了 WallpaperWindowToken 的上面

App 动画 app_transition，leash 挂到了 Task上面



















