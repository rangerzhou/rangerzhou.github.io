---
title: Android - 冻屏问题分析
date: 2024-07-01 22:25:39
tags:
categories: Android
copyright: true
password:
---

> Android 冻屏问题分析。
>

<!--more-->

现象：屏幕任何点击、滑动都没有反应；

使用 `adb shell dumpsys SurfaceFlinger` 查看到有一个透明的应用层级，把其他层级覆盖了

解决：

改法1（DisplayPolicy 中修改）：
在 DisplayPolicy.validateAddingWindowLw() 中 return 之前，

``` java
// DisplayPolicy.validateAddingWindowLw()
if(attrs.type == TYPE_APPLICATION_OVERLAY && "com.example.xxx".equals(attrs.packageName)) {
    return WindowManagerGlobal.ADD_DUPLICATE_ADD;
}
```

这种方式会导致应用 crash；



改法2（WindowManagerGlobal.addView() 中修改）：

``` java
// WindowManagerGlobal.addView()
if(((WindowManager.LayoutParams)params).type == TYPE_APPLICATION_OVERLAY && "com.example.xxx".equals(ActivityThread.currentPackageName())) {
    android.util.Log.e("tag", "xxx")
    return;
}
```

> ActivityThread.currentPackageName() 静态获取包名 API

Patch：

``` java
diff --git a/core/java/android/view/WindowManagerGlobal.java b/core/java/android/view/WindowManagerGlobal.java
index aae930edb729..e8b09a7fee93 100644
--- a/core/java/android/view/WindowManagerGlobal.java
+++ b/core/java/android/view/WindowManagerGlobal.java
@@ -20,6 +20,7 @@ import android.animation.ValueAnimator;
 import android.annotation.NonNull;
 import android.annotation.Nullable;
 import android.app.ActivityManager;
+import android.app.ActivityThread;
 import android.compat.annotation.UnsupportedAppUsage;
 import android.content.ComponentCallbacks2;
 import android.content.Context;
@@ -312,7 +313,11 @@ public final class WindowManagerGlobal {
         if (!(params instanceof WindowManager.LayoutParams)) {
             throw new IllegalArgumentException("Params must be WindowManager.LayoutParams");
         }
-
+        if (((WindowManager.LayoutParams) params).type == WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
+        && "com.example.mysystemdialog".equals(ActivityThread.currentPackageName())) {
+            android.util.Log.e("test22","com.example.mysystemdialog show fullscreen transparent TYPE_APPLICATION_OVERLAY window,so denied this window");
+            return;
+        }
         final WindowManager.LayoutParams wparams = (WindowManager.LayoutParams) params;
         if (parentWindow != null) {
             parentWindow.adjustLayoutParamsForSubWindow(wparams);

```

