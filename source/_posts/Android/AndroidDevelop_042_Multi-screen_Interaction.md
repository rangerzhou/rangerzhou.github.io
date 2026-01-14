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

# 初级版本

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

# 高级版本

- 带动画
- 带松手后自动移动
- 解决已知问题

## 3 创建镜像图层

图层建立要求：

- 比 DefaultTaskDisplayArea 高
- 比 Status/Navagationbar 底
- `DisplayContent.getWindowingLayer()` 正好满足

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

## 4 图层偏移

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

获取原图层，用于下面进行偏移处理；

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
// DisplayContent.java
public void startMoveCurrentScreenTask(int x, int y) {
    if (copyTaskBuffer != null) {
        // 获取屏幕宽度
        int width = getDisplayInfo().logicalWidth;
        Matrix matrix = new Matrix();
        // 屏幕1
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
    - 一句话总结：真实 Task 的偏移会影响镜像 Task，然后在对镜像 Task 偏移的时候要加上原 Task 的偏移以对冲；

修改后的方案：

``` java
// DisplayContent.java
public void startMoveCurrentScreenTask(int x, int y) {
    if (copyTaskBuffer != null) {
        // 获取屏幕宽度
        int width = getDisplayInfo().logicalWidth;
        Matrix matrix = new Matrix();
        // 屏幕2
        matrix.reset();
        matrix.postTranslate(-(width - x), 0);
        t.setMatrix(realWindowStateBuffer, matrix, new float[9]);
        // 屏幕1
        matrix.reset();
        matrix.postTranslate(x + (width -x), 0);
        t.setMatrix(copyTaskBuffer, matrix, new float[9]);

        t.apply();
    }
}
```

先对移动到屏幕 2 的原 Task 进行偏移，然后在对镜像 Task 偏移的时候加上原 Task 的偏移进行对冲；

## 5 黑屏处理

``` java
// DisplayContent.java
void ensureOtherDisplayActivityVisible(DisplayContent other) {
    ActivityRecord topActivity = other.getTopActivity(false, false);
    if (topActivity != null) {
        topActivity.mLaunchTaskBehind = true;
    }
}


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
+                ensureOtherDisplayActivityVisible;
                mRootWindowContainer.moveRootTaskToDisplay(...);
        ...
```

在 `moveRootTaskToDisplay()` 之前调用；

## 6 松手自动移动及动画效果

``` java
// DoubleScreenMovePoinerEventListener.java
case MotionEvent.ACTION_UP:
+    if (shouldBeginMove) {
+        int deltaX = mPoint0LastX - mPoint0FirstX;
+        mDisplayContent.startAutoMove(deltaX, deltaX > 100);
+    }

// DisplayContent.java
void startAutoMove(int offsetX, boolean toOther) {
    int width = getDisplayInfo().logicalWidth;
    int end = toOther ? width : 0;
    // 动画
    ValueAnimator valueAnimator = ValueAnimator.ofInt(offsetX, endX);
    valueAnimator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener(){
        @Override
        public void onAnimationUpdate(ValueAnimator animation) {
            // 获取当前偏移，currentX 慢慢增长到 endX
            int currentX = (int)animation.getAnimatedValue();
            startMoveCurrentScreenTask(currentX, 0);
        }
    });
    // 设置加速度（可选）
    valueAnimator.setInterpolator(new AccelerateInterpolator(1.f));
    valueAnimator.setDuration(500);
    valueAnimator.start();
}
```

手势抬起时触发自动移动，并且加一个动画效果；

## 7 移动后冻屏

移动Task 到屏幕2之后，屏幕1出现冻屏

首先 dumpsys SurfaceFlinger，查看 HWC 信息，窗口显示正常，继续 dumpsys input，查看 Dispatcher State 信息，查看 Display:0 - Windows 信息，看到确实有我们移动过的窗口信息，继续触摸屏幕，然后过滤 InputDispatcher 日志，查看 `findTouchedWindowTargetsLocked` 信息，发现确实是找到了图库窗口，原因是我们添加了两个 SurfaceControl，解决方案就是动画结束时移除图层；

``` java
// DisplayContent.java
void startAutoMove(int offsetX, boolean toOther) {
    int width = getDisplayInfo().logicalWidth;
    int end = toOther ? width : 0;
    // 动画
    ValueAnimator valueAnimator = ValueAnimator.ofInt(offsetX, endX);
    valueAnimator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener(){
        @Override
        public void onAnimationUpdate(ValueAnimator animation) {
            // 获取当前偏移
            int currentX = (int)animation.getAnimatedValue();
            startMoveCurrentScreenTask(currentX, 0);
        }
    });

    // 移除图层
    valueAnimator.addListener(new AnimatorListenerAdapter(){
        @Override
+        public void onAnimationEnd(Animator animation){
+            super.onAnimationEnd(animation);
+            if (copyTaskSc != null && copyTaskBuffer != null){
+                SurfaceControl.Transaction t = mWmService.mTransactionFactory.get();
+                t.remove(copyTaskBuffer);
+                t.remove(copyTaskSc);
+                t.apply();
+                copyTaskBuffer = null;
+                copyTaskSc = null;
+            }
            
+        }
    })
    
    // 设置加速度（可选）
    valueAnimator.setInterpolator(new AccelerateInterpolator(1.f));
    valueAnimator.setDuration(500);
    valueAnimator.start();
}
```

<font color=red>**冻屏经验：如果 `dumpsys SurfaceFlinger` 看不出来问题，就看 `dumpsys input` 信息；**</font>

## 8 回到原屏幕

有了上面的代码，如果移动距离不大于 100，我们期望的结果是回到原屏幕，但是当前效果却是窗口回到原始位置后消失，而且屏幕2也没有显示，按理说拖动时已经触发了 task 移动到屏幕2，原因是这样的，拖动时确实已经把原 Task 移动到了屏幕2，但是手指抬起的时候，我们做了动画，因为此时移动的 GAP 没有到 100，所以 `startAutoMove(toOther)` 中的 toOther 参数为false，那么 endX 就为 0，再调用 `startMoveCurrentScreenTask(0, 0)` 的时候，对 realWindowStateBuffer 的偏移就设置为了 -width，也就是移动到了屏幕之外，所以屏幕 2 中也看不到这个 Task；

解决方案：

``` java
// DisplayContent.java
public void doTestMoveTaskToOtherDisplay() {
    // 记录 TaskId 之用于回到原屏幕时恢复偏移
+   mCurrentRootTaskId = rootTaskId;
    mRootWindowContainer.moveRootTaskToDisplay();
}
//
void startAutoMove(int offsetX, boolean toOther) {
    valueAnimator.addListener(new AnimatorListenerAdapter(){
        @Override
        public void onAnimationEnd(Animator animation){
            super.onAnimationEnd(animation);
            SurfaceControl.Transaction t = mWmService.mTransactionFactory.get();
            
            // 拖动不满 100 时回到原屏幕，并且恢复偏移（恢复偏移是为了回原屏幕之后能正常显示）
+            if (!toOther) {
+                mRootWindowContainer.moveRootTaskToDisplay(mCurrentTaskId, mDisplayId, true);
+                Matrix matrix = new Matrix();
+                matrix.reset();
+                t.setMatrix(realWindowStateBuffer, matrix, new float[9]);
+            }
            
            if (copyTaskSc != null && copyTaskBuffer != null){
                
                t.remove(copyTaskBuffer);
                t.remove(copyTaskSc);
                t.apply();
                copyTaskBuffer = null;
                copyTaskSc = null;
            }
            
        }
    })
```

- 拖动不满足 GAP 时再把 Task 移回原屏幕
- 恢复偏移，否则移回之后因为 Task 在屏幕外，会显示黑屏

## 9 移动后下层 ActivityRecord 复位

通过之前的源码，虽然显示都正常，但是记得我们之前设置了 `mLaunchTaskBehind`，所以在 winScope 其实可以看到设置了 `mLaunchTaskBehind = true` 的 Activity 的右侧顶部的`` Invisible due to` 信息是不正确的，显示是被遮挡，但是其实应该显示 `Hidden by parrent xxx`，所以我们应该在动画结束时恢复之前设置的 `mLaunchTaskBehind = false`

``` java
// DisplayContent.java
+ActivityRecord mCurrentBehindActivity;
void ensureOtherDisplayActivityVisible(DisplayContent other) {
    ActivityRecord topActivity = other.getTopActivity(false, false);
    if (topActivity != null) {
+        mCurrentBehindActivity = topActivity;
        topActivity.mLaunchTaskBehind = true;
    }
}

+void resetState() {
+    if (mCurrentBehindActiviy != null) {
+        mCurrentBehindActivity.mLaunchTaskBehind = false;
+        // 调用系统方法重新设置 activity 的 visible
+        mRootWindowContainer.ensureActivitiesVisible(null, 0, false);
+    }
+}

// DisplayContent.java
void startAutoMove(int offsetX, boolean toOther) {
    valueAnimator.addListener(new AnimatorListenerAdapter(){
        @Override
        public void onAnimationEnd(Animator animation){
            super.onAnimationEnd(animation);
            SurfaceControl.Transaction t = mWmService.mTransactionFactory.get();
            
            // 拖动不满 100 时回到原屏幕，并且恢复偏移（恢复偏移是为了回原屏幕之后能正常显示）
            if (!toOther) {
                mRootWindowContainer.moveRootTaskToDisplay(mCurrentTaskId, mDisplayId, true);
                Matrix matrix = new Matrix();
                matrix.reset();
                t.setMatrix(realWindowStateBuffer, matrix, new float[9]);
+            } else {
+                resetState();
+            }
        }
    })
```



## 10 闪屏一帧

原因是当我们移动 Task 到屏幕 2 的时候，Task 已经在屏幕 2 了，所以屏幕 2 会正常渲染显示，随后我们又继续拖动进而对图层做了偏移，所以就又回到拖动的位置，解决方案就是在移动 Task 到屏幕 2 之前，先设置一个偏移，让移动到屏幕 2 的 Task 偏移到屏幕外面；

``` java
// DisplayContent.java
public void doTestMoveTaskToOtherDisplay() {
    // 记录 TaskId 之用于回到原屏幕时恢复偏移
    mCurrentRootTaskId = rootTaskId;
    startMoveCurrentScreenTask(0, 0);
    mRootWindowContainer.moveRootTaskToDisplay();
}
```



# 问题总结

- 镜像 Task 偏移问题
    - MirrorSurface 中 Task 受原 Task 偏移的影响
    - 补偿偏移即可
- 移动时屏幕 2 黑屏
    - Task 已移动到屏幕 2，但是界面未完全移动时无内容显示导致黑屏
    - 设置原屏幕 2 中顶部 ActivityRecord 的 `mLaunchTaskBehind = true` 即可
- 移动后屏幕 1 冻屏
    - 移动后镜像图层只是进行了偏移，但是在 Input 层面还是覆盖在顶部的
    - 移动后，在动画结束后移除镜像图层及其根图层即可
- 不满足 GAP 距离时回到原屏幕时窗口消失
    - 做动画时当 toOther 为 false，endX 为 0，动画中设置了 `startMoveCurrentScreenTask(currentX, 0)`，最终是到了 `startMoveCurrentScreenTask(0, 0)`，导致屏幕 1 中的镜像 Task 偏移 `Width`，屏幕 2 中的真实 Task 偏移 `-Width`，所以两个屏幕的 Task 都不可见
    - 不满 GAP 时把真实 Task 通过 `moveRootTaskToDisplay()` 移回屏幕 1，并且通过 `matrix.reset()` 恢复偏移
- 移动后原顶部 Activity Visible 状态没有复位
    - 为了解决移动时黑屏的问题时把屏幕 2 原顶部 ActivityRecord 的 `mLaunchTaskBehind = true` 设置为了 true
    - 在动画结束时通过 `resetState()` 恢复 顶部 ActivityRecord 的 `mLaunchTaskBehind = false` 即可
- 移动刚开始时闪屏一帧
    - 移动 Task 到屏幕 2 后屏幕 2 对 Task 的渲染使之显示，随后拖动时设置了偏移所以又回到跟手状态；
    - 在移动 Task 到屏幕 2 之前，先对移动的 Task 进行偏移，使之偏移到屏幕之外即可

