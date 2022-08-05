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

## 2. setContentView() 分析 - 1

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
// Window.java
public abstract class Window {
```

返回了一个 Window 对象，属于 Activity，Window 是一个抽象类，这个 Window 到底是什么需要看 Activity 创建的流程，我们回到 `ActivityThread.performLaunchActivity()`：

## 3. performLaunchActivity() 分析

``` java
// ActivityThread.java
    private Activity performLaunchActivity(ActivityClientRecord r, Intent customIntent) {
        ActivityInfo aInfo = r.activityInfo;
        ...
        ContextImpl appContext = createBaseContextForActivity(r); // Activity 中的 getContext 函数返回的就是这个 ContextImpl 对象
        Activity activity = null;
        try {
            java.lang.ClassLoader cl = appContext.getClassLoader(); // 获取  ClassLoader
            activity = mInstrumentation.newActivity(
                    cl, component.getClassName(), r.intent); // 根据类名通过反射机制获取 Activity
            ...
        try {
            Application app = r.packageInfo.makeApplication(false, mInstrumentation);
            ...
                Window window = null;
                if (r.mPendingRemoveWindow != null && r.mPreserveWindow) {
                    window = r.mPendingRemoveWindow;
                    r.mPendingRemoveWindow = null;
                    r.mPendingRemoveWindowManager = null;
                }
                ...
                activity.attach(appContext, this, getInstrumentation(), r.token,
                        r.ident, app, r.intent, r.activityInfo, title, r.parent,
                        r.embeddedID, r.lastNonConfigurationInstances, config,
                        r.referrer, r.voiceInteractor, window, r.configCallback,
                        r.assistToken, r.shareableActivityToken);
                ...
                    mInstrumentation.callActivityOnCreate(activity, r.state); // 最终调用 Activity.onCreate()
                }
                ...
        return activity;
```

先是通过反射创建 Activity，然后 `makeApplication()` 获取 Application 对象，调用 `activity.attach()`，最后调用 `Instrumentation.callActivityOnCreate()` 执行到 `Activity.onCreate()` 方法，其他流程在 [APP 启动流程分析](http://rangerzhou.top/2021/11/05/Android/AndroidDevelop_011_startActivity/) 中已经分析过了，这里重点看一下 `attach()` 函数：

``` java
// Activity.java
    private Window mWindow;
    final void attach(...) {
        attachBaseContext(context); // 保存当前 ContextImpl

        mFragments.attachHost(null /*parent*/);
        // 创建 PhoneWindow
        mWindow = new PhoneWindow(this, window, activityConfigCallback);
        mWindow.setWindowControllerCallback(mWindowControllerCallback);
        mWindow.setCallback(this);
        mWindow.setOnWindowDismissedCallback(this);
        mWindow.getLayoutInflater().setPrivateFactory(this);
        ...
        // 设置 PhoneWindow 的 WindowManager
        mWindow.setWindowManager(
                (WindowManager)context.getSystemService(Context.WINDOW_SERVICE),
                mToken, mComponent.flattenToString(),
                (info.flags & ActivityInfo.FLAG_HARDWARE_ACCELERATED) != 0);
        if (mParent != null) {
            mWindow.setContainer(mParent.getWindow());
        }
        mWindowManager = mWindow.getWindowManager(); // 保存 PhoneWindow 的 WindowManager 到 Activity 的 mWindowManager
        ...
```

可以看到这个 Window 其实是一个 PhoneWindow 对象，是 Activity 的一个成员变量，<font color=red>**即 Activity.mWindow 是一个 PhoneWindow 对象**</font>，继续看 `setWindowManager()`：

``` java
// PhoneWindow.java
public class PhoneWindow extends Window implements MenuBuilder.Callback {
// Window.java
    private WindowManager mWindowManager;
    public void setWindowManager(WindowManager wm, IBinder appToken, String appName,
            boolean hardwareAccelerated) {
        mAppToken = appToken;
        mAppName = appName;
        mHardwareAccelerated = hardwareAccelerated;
        if (wm == null) {
            wm = (WindowManager)mContext.getSystemService(Context.WINDOW_SERVICE);
        }
        mWindowManager = ((WindowManagerImpl)wm).createLocalWindowManager(this);
    }
```

PhoneWindow 继承自 Window，`setWindowManager()` 是在父类 Window 中定义的，又继续调用 `WindowManagerImpl.createLocalWindowManager()`：

``` java
// WindowManagerImpl.java
    public WindowManagerImpl createLocalWindowManager(Window parentWindow) {
        return new WindowManagerImpl(mContext, parentWindow, mWindowContextToken);
    }
```

<font color=red>**所以 Window.mWindowManager 其实是一个 WindowManagerImpl 对象**</font>，继续回到 `setContentView()`；

## 4. setContentView() 分析 - 2

``` java
// Activity.java
    public void setContentView(View view) {
        getWindow().setContentView(view);
        initWindowDecorActionBar(); // 初始化 ActionBar
    }
```

通过分析 `performLaunchActivity()` 得知 getWindow 返回的是一个 PhoneWindow 对象，

``` java
// PhoneWindow.java
    ViewGroup mContentParent;
    public void setContentView(View view) {
        setContentView(view, new ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT));
    }
    public void setContentView(View view, ViewGroup.LayoutParams params) {
        if (mContentParent == null) { // mContentParent 是 mDecor 本身，或者是 mDecor 的一部分
            installDecor(); // 创建 PhoneWindow.mDecor(DecorView类型)，获取 mContentParent
        } else if (!hasFeature(FEATURE_CONTENT_TRANSITIONS)) {}
        ...
            mContentParent.addView(view, params); // 把 view 添加到 ViewGroup 中
        mContentParent.requestApplyInsets();
        final Callback cb = getCallback();
        if (cb != null && !isDestroyed()) {
            cb.onContentChanged();
        }
        mContentParentExplicitlySet = true;
    }
```

mContentParent 是一个 ViewGroup，继承自 View，从名字可知它除了是一个 View，还是一个 Group，里面包含了其他 View，上面代码主要有 2 个工作：

- installDecor()：创建 PhoneWindow.mDecor(DecorView 类型)，获取 mContentParent；
- addView()：把传入的 view 添加到 mContentParent 这个 ViewGroup 中；

先来看一下 installDecor()；

### 4.1 installDecor() 创建 DecorView

``` java
// PhoneWindow.java
    private DecorView mDecor;
    private void installDecor() {
        mForceDecorInstall = false;
        if (mDecor == null) {
            mDecor = generateDecor(-1); // 创建 DecorView mDecor，继承自 FrameLayout
            ...
        } else {
            mDecor.setWindow(this); // 已经存在 DecorView，直接传入 PhoneWindow
        }
        if (mContentParent == null) {
            mContentParent = generateLayout(mDecor); // 得到 ViewGroup 对象 mContentParent，处理标题栏显示等
        ...
                mTitleView = findViewById(R.id.title); // 创建标题栏
```

首先通过 `generateDecor()` 创建 DecorView，并通过 `setWindow()` 把 PhoneWindow 对象传递给 DecorView.mWindow，如果已经存在 DecorView，则直接通过 `setWindow()` 把 PhoneWindow 传递过去，然后通过 `generateLayout()`加载布局文件到 DecorView 中；

先来看一下创建 DecorView：

```java
// PhoneWindow.java
    protected DecorView generateDecor(int featureId) {
        Context context;
        ...
        return new DecorView(context, featureId, this, getAttributes());
    }
// DecorView.java
    private PhoneWindow mWindow;
    DecorView(Context context, int featureId, PhoneWindow window,
            WindowManager.LayoutParams params) {
        super(context);
        ...
        setWindow(window);
    }
    void setWindow(PhoneWindow phoneWindow) {
        mWindow = phoneWindow;
        ...
```

 这里虽然创建了 DecorView，但是此时的 DecorView 还是一个空白的 FrameLayout；

继续看 `generateLayout()` 获取 ViewGropu 对象：

``` java
// PhoneWindow.java
    protected ViewGroup generateLayout(DecorView decor) {
        int layoutResource;
        int features = getLocalFeatures(); // 获取当前 window 正在实现的功能
        // 判断 features，决定 layoutResource 值
        ...
                layoutResource = R.layout.screen_title_icons;
        mDecor.startChanging(); // 开始改变 DecorView
        mDecor.onResourcesLoaded(mLayoutInflater, layoutResource); // 加载布局
        // ID_ANDROID_CONTENT 定义在 Window 中：com.android.internal.R.id.content
        // contentParent 是 PhoneWindow.mDecor 的一部分
        ViewGroup contentParent = (ViewGroup)findViewById(ID_ANDROID_CONTENT);

        mDecor.finishChanging(); // 停止改变 DecorView，停止后调用 drawableChanged 方法更新 DecorView
        return contentParent;
```

根据条件获取对应标题栏的资源 ID，然后调用 `onResourcesLoaded()` 把标题栏加入 PhoneWindow 的 mDecor(DecorView) 中，最后获取并返回 contentParent 这个 ViewGroup 对象；

``` java
// DecorView.java
    void onResourcesLoaded(LayoutInflater inflater, int layoutResource) {
        ...
        final View root = inflater.inflate(layoutResource, null);
            addView(root, 0, new ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT));
        ...
    }
```

可以看到 `onResuourcesLoaded()` 的目的是

