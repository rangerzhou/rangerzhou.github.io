---
title: Android - 多屏互动项目总结
date: 2025-08-25 22:26:18
tags:
categories: Android
copyright: true
password:
published: false
---

> 多屏互动项目总结

<!--more-->

初级版本

- 实现对于全局双指移动策略监听
- 实现对 display 的寻找和移动

## 1 全局事件监听 Listener

全局事件监听，用来监听双指或者三指事件

``` java
package com.android.server.wm;

import android.view.MotionEvent;
import android.view.WindowManagerPolicyConstants;

public class DoubleScreenMovePointerEventListener implements WindowManagerPolicyConstants.PointerEventListener {
    boolean shouldBeginMove = false;
    int mPoint0FirstX = 0;
    int mPoint1FirstX = 0;

    int mPoint0LastX = 0;
    int mPoint1LastX = 0;
    int START_GAP = 20;
    private final WindowManagerService mService;
    private final DisplayContent mDisplayContent;

    public DoubleScreenMovePointerEventListener(WindowManagerService mService, DisplayContent mDisplayContent) {
        this.mService = mService;
        this.mDisplayContent = mDisplayContent;
    }

    @Override
    public void onPointerEvent(MotionEvent motionEvent) {
        android.util.Log.i("DoubleScreenTouch","motionEvent = " + motionEvent);
        switch (motionEvent.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN:
                if (motionEvent.getPointerCount() > 2) {
                    // 这里是为了模拟器调试方便，因为模拟器不支持 3指
                    android.util.Log.i("DoubleScreen","按下手指大于2，不移动");
                    shouldBeginMove = false;
                }
                if (motionEvent.getPointerCount() == 2) {
                    // 记录初试 X 坐标
                    if (mPoint0FirstX == 0 && mPoint1FirstX == 0) {
                        mPoint0FirstX = (int)motionEvent.getX(0);
                        mPoint1FirstX = (int)motionEvent.getX(1);
                    }
                }
                break;
            case MotionEvent.ACTION_MOVE:
                if (motionEvent.getPointerCount() == 2) {
                    // 一旦移动距离超出阈值，就开始移动顶部 Task
                    if (!shouldBeginMove && motionEvent.getX(0)  - mPoint0FirstX > START_GAP &&
                        motionEvent.getX(1)  - mPoint1FirstX > START_GAP) {
                        android.util.Log.i("DoubleScreen","开始双指移动……");
                        shouldBeginMove = true;
                        mDisplayContent.doTestMoveTaskToOtherDisplay();
                    }

                    mPoint0LastX = (int)motionEvent.getX(0);
                    mPoint1LastX = (int)motionEvent.getX(1);
                }
                break;
            case MotionEvent.ACTION_POINTER_UP:
            case MotionEvent.ACTION_UP:
                shouldBeginMove = false;
                mPoint0FirstX = mPoint1FirstX =0;
                android.util.Log.i("DoubleScreen","Up 事件，停止移动");
                break;
        }
    }

}
```

Listener 写完后还要在 DisplayContent 的构造函数中注册：

``` java
// DisplayContent.java
mDoubleScreenMoveListener = new DoubleScreenMovePointerEventListener(mWmService, this);
registerPointerEventListener(mDoubleScreenMoveListener);
```

## 2 移动 Task

``` java
// DisplayContent.java
final DoubleScreenMovePointerEventListener mDoubleScreenMoveListener;

public void doTestMoveTaskToOtherDisplay() {
    // 1.查找 Display
    DisplayContent otherDisplay = null;
    if (mRootWindowContainer.getChildCount() == 2) {
        otherDisplay = (mRootWindowContainer.getChildAt(0) == this) ? mRootWindowContainer.getChildAt(1):mRootWindowContainer.getChildAt(0);
    }

    
    if (otherDisplay!= this && otherDisplay!= null) {
        int rootTaskId = 0;
        try {
            // 2.获取顶部 Task
            Task rootTask = getTopRootTask(); // 获取 top 的 Task
            if (rootTask.isActivityTypeHome()) {
                android.util.Log.i("", "rootTask 是 Launcher，不移动")
                return;
            }
            rootTaskId =rootTask.mTaskId;
            // 3.移动 Task 到另一个屏幕
            mRootWindowContainer.moveRootTaskToDisplay(rootTaskId,otherDisplay.mDisplayId,true);
        }catch (Exception e) {
            android.util.Log.i("DoubleScreen","doTestMoveTaskToOtherDisplay Exception",e);
        }
    }
}
```

- DisplayContent 是 RootWindowContainer 的 child，所以从 RootWindowContainer 查找另一个 Display
- 获取顶部的 Task
- 移动 Task 到另一个屏幕



## 3 创建镜像图层

图层建立要求：

- 比 DefaultTaskDisplayArea 高
- 比 Status/Navagationbar 底
- DisplayContent.getWindowingLayer() 正好满足

``` java
// DisplayContent.java
+    SurfaceControl copyTaskSc = null;
+    SurfaceControl copyTaskBuffer = null;
    public void doTestMoveTaskToOtherDisplay() {
    SurfaceControl.Transaction t = mWmService.mTransactionFactory.get();
    // 1.创建我们自己的根图层
+   if (copyTaskSc == null) { //创建一个rootTaskCopy图层主要用来放置镜像Task画面
+       copyTaskSc =  makeChildSurface(null)
+           .setName("rootTaskCopy")
+           .setParent(getWindowingLayer())
+           .build();
+    }
    // 2.创建镜像图层
+   if (copyTaskBuffer == null) {
+       copyTaskBuffer = SurfaceControl.mirrorSurface(rootTask.getSurfaceControl);
+   }
+   // 3.设置 copyTaskBuffer 的父容器为 copyTaskSc
+   t.reparent(copyTaskBuffer,copyTaskSc);
    // 显示 Surface
+   t.show(copyTaskSc);
+   t.show(copyTaskBuffer);
+   t.apply();
         
```

- 创建自己的根图层并挂载到 `getWindowingLayer()` 下（非必须，不创建根图层也可以）；
- 创建镜像图层；
- 创建事务对象，用于批量处理 Surface 的修改，所有对 Surface 的修改（如位置、大小、层级等）都会在这个事务中暂存，最后一次性提交；

## 4 动画移动

``` java
// DoubleScreenMovePointerEventListener.java
case MotionEvent.ACTION_MOVE:
if (motionEvent.getPointerCount() == 2) {
    // 一旦移动距离超出阈值，就开始移动顶部 Task
    if (!shouldBeginMove && motionEvent.getX(0)  - mPoint0FirstX > START_GAP &&
        motionEvent.getX(1)  - mPoint1FirstX > START_GAP) {
        android.util.Log.i("DoubleScreen","开始双指移动……");
        shouldBeginMove = true;
        mDisplayContent.doTestMoveTaskToOtherDisplay();
    }

    mPoint0LastX = (int)motionEvent.getX(0);
    mPoint1LastX = (int)motionEvent.getX(1);
+   if (shouldBeginMove) {
+       int deltaX = mPoint0LastX - mPoint0FirstX;
+       mDisplayContent.startMoveCurrentScreenTask(deltaX,0);
+   }
}
break;
```

判断需要移动，就调用 DisplayContent 中的方法；

``` java

public void startMoveCurrentScreenTask(int x, int y) {
    if (copyTaskBuffer != null) {
        // 获取屏幕宽度
        int width = getDisplayInfo().logicalWidth;
        // 屏幕1
        Matrix matrix = new Matrix();
        matrix.reset();
        matrix.postTranslate(x, 0);
        t.setMatrix(copyTaskBuffer, matrix, new float[9]);
        
        // 屏幕2
        matrix.reset();
        matrix.postTranslate(-(width - x), 0);
        t.setMatrix(realWindowStateBuffer, matrix, new float[9]);
        
        t.apply();
    }
}
```

如果按照上面代码偏移，效果是 mirrorTask 会向左偏移 ，通过 winscope 中 SF 层级中的 Mirror 的 Task 和原始 Task 的 position 值

- MirrorRoot 的 position 为 559
- MirrorRoot - Task 的 position 为 -322
- 真实 Task 的 position 为 -881
- `-881 + 559=-322`
    - 拖动时，真实 Task 在其层级中已经存在一套本地偏移；
    - 由于之前做了 `mirrorSurface` 操作，镜像 Task 继承了真实 Task 在父容器下的本地 transform；
    - 当再对 MirrorRoot 施加 559 的平移时，这个平移会叠加到子 Task 上；
    - 因此最终镜像 Task 在 Display 中的位置，是 **原有本地偏移 + MirrorRoot 的平移 = -322 + 559（等价于从 -881 推到 -322）**。





``` java

// DisplayContent.java
    SurfaceControl copyTaskSc = null;
    SurfaceControl copyTaskBuffer = null;
+    SurfaceControl realWindowStateBuffer = null;
     public void doTestMoveTaskToOtherDisplay() {
     SurfaceControl.Transaction t = mWmService.mTransactionFactory.get();
     Task rootTask = getTopRootTask();
     // 获取真实图层
     realWindowStateBuffer = rootTask.getSurfaceControl();
```











