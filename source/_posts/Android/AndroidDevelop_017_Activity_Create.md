---
title: Android - Activity 创建
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

## handleResumeActivity() 分析

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
            // 1.获得一个 View 对象，实际上是 DecorView，setContentView把 view 添加到 mContentParent，
            // mContentParent 是 PhoneWindow.mDecor 的一部分，
            View decor = r.window.getDecorView();
            decor.setVisibility(View.INVISIBLE);
            ViewManager wm = a.getWindowManager(); // 2.获得 ViewManager 对象，实际上是 WindowManagerImpl 对象
            WindowManager.LayoutParams l = r.window.getAttributes();
            a.mDecor = decor;
            l.type = WindowManager.LayoutParams.TYPE_BASE_APPLICATION;
            l.softInputMode |= forwardBit;
            if (r.mPreserveWindow) {
                a.mWindowAdded = true;
                r.mPreserveWindow = false;
                // Normally the ViewRoot sets up callbacks with the Activity
                // in addView->ViewRootImpl#setView. If we are instead reusing
                // the decor view we have to notify the view root that the
                // callbacks may have changed.
                ViewRootImpl impl = decor.getViewRootImpl();
                if (impl != null) {
                    impl.notifyChildRebuilt();
                }
            }
            if (a.mVisibleFromClient) {
                if (!a.mWindowAdded) {
                    a.mWindowAdded = true;
                    wm.addView(decor, l); // 3.把上面获取的 decor 对象添加到 ViewManager 中，调用 WindowManagerImpl.addView
                } else {
                    // The activity will get a callback for this {@link LayoutParams} change
                    // earlier. However, at that time the decor will not be set (this is set
                    // in this method), so no action will be taken. This call ensures the
                    // callback occurs with the decor set.
                    a.onWindowAttributesChanged(l);
                }
            }
            ...
        Looper.myQueue().addIdleHandler(new Idler());
    }
```

