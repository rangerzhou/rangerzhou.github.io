---
title: Android - Activity 的显示
date: 2022-02-20 22:16:06
tags:
categories: Android
copyright: true
password: zr.
---



>Activity 创建分析；

<!--more-->

在 [APP 启动流程分析](http://rangerzhou.top/2021/11/05/Android/AndroidDevelop_011_startActivity/) 中得知，启动 APP 的 Activity 最后会调用到 `ActivityTaskSupervisor.realStartActivityLocked()`，最终在 ActivityThread 中先后调用了 `handleLaunchActivity() -> performLaunchActivity()` 和 `handleResumeActivity() -> performResumeActivity()`，

- performLaunchActivity()：作用是在 `Instrumentation.newActivity()` 函数中根据 Activity 的类名通过通过反射机制创建对应的 Activity，然后通过 `Instrumentation.callActivityOnCreate() -> Activity.performCreate() -> Activity.onCreate()` 调用 Activity 的 onCreate () 函数；
- performResumeActivity()：通过 `Activity.performResume() -> Instrumentation.callActivityOnResume() -> Activity.onResume()` 调用 Activity 的 onResume() 函数；



但是 `handleResumeActivity()` 除了调用 `performResumeActivity()` 之外，还有其他重要工作，接下来开始分析；

## 1. handleResumeActivity() 分析

``` java
// ActivityThread.java
    public void handleResumeActivity(ActivityClientRecord r, boolean finalStateRequest,
            boolean isForward, String reason) {
        ...
        if (!performResumeActivity(r, finalStateRequest, reason)) {
            return;
        }
        ...
        final Activity a = r.activity;
        ...
        if (r.window == null && !a.mFinished && willBeVisible) {
            r.window = r.activity.getWindow();
            // 1.获得一个 View 对象，实际上是 DecorView，setContentView 把 view 添加到 mContentParent，
            // mContentParent 是 PhoneWindow.mDecor 的一部分，
            View decor = r.window.getDecorView();
            decor.setVisibility(View.INVISIBLE);
            ViewManager wm = a.getWindowManager(); // 2.获得 ViewManager 对象，实际上是 WindowManagerImpl 对象
            WindowManager.LayoutParams l = r.window.getAttributes();
            a.mDecor = decor;
            ...
            if (a.mVisibleFromClient) {
                if (!a.mWindowAdded) {
                    a.mWindowAdded = true;
                    wm.addView(decor, l); // 3.把上面获取的 decor 对象添加到 ViewManager 中，调用 WindowManagerImpl.addView
                } else {
            ...
        Looper.myQueue().addIdleHandler(new Idler());
    }
```

以上有 3 个主要工作：

-   getDecorView()：获取一个 View 对象 decor，其实是一个 DecorView，我们知道在 onCreate() 中会 setContentView()，是把一个 View 添加到 mContentParent，而 mContentParent 是 PhoneWindow.mDecor 的一部分；
-   getWindowManager()：获得一个 ViewManager 对象，实际上是 WindowManagerImpl 对象；
-   addView()：把上面获取的 decor 对象添加到 ViewManager 中，实际上调用的是 WindowManagerImpl.addView()；

## 2. setContentView() 分析

Activity 中有 3 个 setContentView() 方法，选取其中一个：

``` java
// Activity.java
    public void setContentView(View view) {
        getWindow().setContentView(view);
        initWindowDecorActionBar(); // 初始化 ActionBar
    }
```

先来看一下 `getWindow()` 返回什么：

``` java
// Activity.java
    private Window mWindow;
    public Window getWindow() {
        return mWindow;
    }
```

返回了一个 Window 对象，
