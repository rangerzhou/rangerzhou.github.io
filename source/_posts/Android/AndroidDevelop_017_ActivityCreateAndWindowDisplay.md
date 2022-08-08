---
title: Android - Activity 创建及窗口显示
date: 2022-02-20 22:16:06
tags:
categories: Android
copyright: true
password:
---



>Activity 创建及窗口显示分析；

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
        // 执行 Activity 的 performResume 方法
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
// getWindowManager()
    private WindowManager mWindowManager;
    public WindowManager getWindowManager() {
        return mWindowManager;
    }
```

以上有 3 个主要工作：

-   getDecorView()：获取一个 View 对象 decor，其实是一个 DecorView，我们知道在 onCreate() 中会 setContentView()，是把一个 View 添加到 mContentParent，而 mContentParent 是 DecorView[PhoneWindow.mDecor] 的一部分；
-   getWindowManager()：返回一个 WindowManager 对象（继承自 ViewManager），实际上是 WindowManagerImpl 对象；
-   addView()：把上面获取的 decor 对象添加到 ViewManager 中，实际上调用的是 WindowManagerImpl.addView()；

### 1.1 setContentView() - Window 来源

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

<font color=red>**返回了一个 Window 对象，属于 Activity**</font>，Window 是一个抽象类，这个 Window 到底是什么需要看 Activity 创建的流程，我们回到 `ActivityThread.performLaunchActivity()`：

#### 1.1.1 performLaunchActivity - Window/WindowManager 是什么

``` java
// ActivityThread.java
    private Activity performLaunchActivity(ActivityClientRecord r, Intent customIntent) {
        ActivityInfo aInfo = r.activityInfo;
        ...
        // Activity 中的 getContext 函数返回的就是这个 ContextImpl 对象
        ContextImpl appContext = createBaseContextForActivity(r);
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
                    window = r.mPendingRemoveWindow; // 待删除的窗口
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
            synchronized (mResourcesManager) {
                mActivities.put(r.token, r);
            }...
                    mInstrumentation.callActivityOnCreate(activity, r.state); // 最终调用 Activity.onCreate()
                }
                ...
        return activity;
```

主要工作：

- 创建 Activity 对应的 ContextImpl 对象；
- 获取应用所使用的 ClassLoader 对象，用于创建 Activity 对象；
- 调用 Instrumentation.newActivity() 通过反射机制创建 Activity 对象；
- **调用 Activity.attach() 方法**；
- 通过 Instrumentation.callActivityOnCreate() 调用 Activity.onCreate() 方法；
- 将当前 Activity 所对应的 ActivityClientRecord 对象添加到 mActivities 数组；

其他流程在 [APP 启动流程分析](http://rangerzhou.top/2021/11/05/Android/AndroidDevelop_011_startActivity/) 中已经分析过了，这里重点看一下 `attach()` 函数：

``` java
// Activity.java
    private Window mWindow;
    final void attach(...) {
        // 保存上一步创建的 ContextImpl 到属性 mBase 中，这样 ContextImpl 就可以调用 Activity 了
        attachBaseContext(context);

        mFragments.attachHost(null /*parent*/);
        // 创建 PhoneWindow
        mWindow = new PhoneWindow(this, window, activityConfigCallback);
        mWindow.setWindowControllerCallback(mWindowControllerCallback);
        mWindow.setCallback(this);
        mWindow.setOnWindowDismissedCallback(this);
        mWindow.getLayoutInflater().setPrivateFactory(this);
        ...
        // 设置 PhoneWindow 的 WindowManager，关联 WindowManager
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

### 1.2 setContentView() - DecorView 来源

``` java
// Activity.java
    public void setContentView(View view) {
        getWindow().setContentView(view);
        initWindowDecorActionBar(); // 初始化 ActionBar
    }
```

通过分析 `performLaunchActivity()` 得知 `getWindow()` 返回的是一个 PhoneWindow 对象，

``` java
// PhoneWindow.java
    ViewGroup mContentParent;
    public void setContentView(View view) {
        setContentView(view, new ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT));
    }
    public void setContentView(View view, ViewGroup.LayoutParams params) {
        if (mContentParent == null) { // mContentParent 是 mDecor 本身，或者是 mDecor 的一部分
            installDecor(); // 1.创建 PhoneWindow.mDecor(DecorView类型)，获取 mContentParent
        } else if (!hasFeature(FEATURE_CONTENT_TRANSITIONS)) {}
        ...
        if (hasFeature(FEATURE_CONTENT_TRANSITIONS)) {
        } else {
            mLayoutInflater.inflate(layoutResID, mContentParent); // 使用 LayoutInflater 工具解析并生成视图
        }
            mContentParent.addView(view, params); // 2.把 view 添加到 ViewGroup 中
        mContentParent.requestApplyInsets();
        final Callback cb = getCallback();
        if (cb != null && !isDestroyed()) {
            cb.onContentChanged();
        }
        mContentParentExplicitlySet = true;
    }
```

mContentParent 是一个 ViewGroup，继承自 View，从名字可知它除了是一个 View，还是一个 Group，里面包含了其他 View，上面代码主要有 2 个工作：

- installDecor()：创建 DecorView[PhoneWindow.mDecor]，加载布局到 DecorView，获取 mContentParent；
- 使用 LayoutInflater 工具解析并生成视图；
- addView()：把传入的 view 添加到 mContentParent 这个 ViewGroup 中；

先来看一下 installDecor()；

#### 1.2.1 installDecor() -创建安装 DecorView

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
                mTitleView = findViewById(R.id.title); // 获取标题栏
```

-   首先通过 `generateDecor()` <font color=red>**创建 DecorView**</font>，它是 Activity 的跟视图，并把 PhoneWindow 对象传递给 DecorView；
-   然后通过 `generateLayout()` <font color=red>**加载布局文件到 DecorView 中，从 DecorView 中获取并返回 mContentParent**</font>，比如 LinearLayout/RelativeLayout/FrameLayout 等，是 DecorView 的子视图；

先来看一下创建 DecorView；

##### a. generateDecor() - 创建 DecorView

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

**创建 DecorView**，并通过 `setWindow()` **把 PhoneWindow 对象传递给 DecorView.mWindow**，如果已经存在 DecorView，则直接通过 `setWindow()` 把 PhoneWindow 传递过去，  这里虽然创建了 DecorView，但是此时的 DecorView 还是一个空白的 FrameLayout（DecorView 继承自 FrameLayout）；

继续看 `generateLayout()` 获取 ViewGropu 对象；

##### b. generateLayout() - 加载布局到 DecorView

``` java
// PhoneWindow.java
    protected ViewGroup generateLayout(DecorView decor) {
        TypedArray a = getWindowStyle(); // 1.从主题文件获取样式信息
        if (a.getBoolean(R.styleable.XXX, false)) {
            requestFeature(XXX); // 2.根据样式信息请求 requestFeature
        int layoutResource;
        int features = getLocalFeatures(); // 3.获取当前 window 正在实现的功能
        // 判断 features，根据主题格式，决定 layoutResource 值
        ...
                layoutResource = R.layout.screen_simple;
        mDecor.startChanging(); // 开始改变 DecorView
        mDecor.onResourcesLoaded(mLayoutInflater, layoutResource); // 4.加载布局到 DecorView 中
        // ID_ANDROID_CONTENT 定义在 Window 中：com.android.internal.R.id.content
        // 5.contentParent 是 PhoneWindow.mDecor 的一部分
        ViewGroup contentParent = (ViewGroup)findViewById(ID_ANDROID_CONTENT);

        mDecor.finishChanging(); // 停止改变 DecorView，停止后调用 drawableChanged 方法更新 DecorView
        return contentParent;
```

-   从主题文件获取样式信息，根据样式信息调用 requestFeature()；
-   通过 `getLocalFeatures()` 获取 requestFeature() 的功能；
-   根据功能获取对应的资源 ID，然后调用 `onResourcesLoaded()` 根据样式加载对应的布局到 PhoneWindow.mDecor(DecorView) 中；
-   最后从 DecorView 中通过 `findViewById()` 获取并返回 id 为 `R.id.content` 的 View （contentParent ）给到 `PhoneWindow.mContentParent`；

看一个布局例子：*frameworks/base/core/res/res/layout/screen_simple.xml*

``` xml
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:fitsSystemWindows="true"
    android:orientation="vertical">
    <ViewStub android:id="@+id/action_mode_bar_stub"
              android:inflatedId="@+id/action_mode_bar"
              android:layout="@layout/action_mode_bar"
              android:layout_width="match_parent"
              android:layout_height="wrap_content"
              android:theme="?attr/actionBarTheme" />
    <FrameLayout
         android:id="@android:id/content"
         android:layout_width="match_parent"
         android:layout_height="match_parent"
         android:foregroundInsidePadding="false"
         android:foregroundGravity="fill_horizontal|top"
         android:foreground="?android:attr/windowContentOverlay" />
</LinearLayout>
```

**onResourcesLoaded()** 分析：

``` java
// DecorView.java
    // This is the caption view for the window, containing the caption and window control
    // buttons. The visibility of this decor depends on the workspace and the window type.
    // If the window type does not require such a view, this member might be null.
    private DecorCaptionView mDecorCaptionView;
    void onResourcesLoaded(LayoutInflater inflater, int layoutResource) {
        ...
        // 创建 DecorCaptionView（装饰标题视图）
        mDecorCaptionView = createDecorCaptionView(inflater);
        // 加载传入的 layoutResource 成为根视图
        final View root = inflater.inflate(layoutResource, null);
        if (mDecorCaptionView != null) {// 判断 DecorCaptionView 是否为空
            if (mDecorCaptionView.getParent() == null) {
                // 如果 mDecorCaptionView 没有父布局，就添加 mDecorCaptionView 到 DecorView 的最后一项
                addView(mDecorCaptionView,
                        new ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT));
            }
            // 添加 root 到 DecorCaptionView 的最后一项
            mDecorCaptionView.addView(root,
                    new ViewGroup.MarginLayoutParams(MATCH_PARENT, MATCH_PARENT)); // 加入标题栏
        } else {

            // Put it below the color views.
            // 添加 root 到 DecorView 的第一项
            addView(root, 0, new ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT));
        }
        mContentRoot = (ViewGroup) root;// 将 root 视图作为 DecorView 的 mContentRoot（一个ViewGroup）
        initializeElevation();
    }
```

DecorCaptionView 的注释意思是 DecorCaptionView 是窗口的标题视图，包含标题和窗口控制按钮，这种 decor 的可见性取决于工作空间和窗口类型，如果窗口类型不需要这样的视图，则 mDecorCaptionView 可能为空，所以要进行判空操作；

可以看到 `onResuourcesLoaded()` 的目的是加载传入的 layoutResource 成为跟视图，然后把跟视图添加到 DecorView 中；

接下来看一下 `findViewById()`；

``` java
// Window.java
    public <T extends View> T findViewById(@IdRes int id) {
        return getDecorView().findViewById(id); // PhoneWindow 实现 getDecorView，返回 PhoneWindow.mDecor
    }
// PhoneWindow.java
    public final @NonNull View getDecorView() {
        if (mDecor == null || mForceDecorInstall) {
            installDecor();
        }
        return mDecor; // 返回 DecorView
    }
```

可见 `findViewById()` 都是从 DecorView 中查找 View，所以返回的 contentParent 是 DecorView 的一部分，<font color=red>**即 mContentParent 是 DecorView 的一部分**</font>；

#### 1.2.2 addView - 添加 view 到 ContentParent

`installDecor()` 创建 DecorView、加载布局到 DecorView，获取 ContentParent 后，下一步就是调用 `ContentParent.addView()` 把 View 添加到 mContentParent 这个 ViewGroup 中；

``` java
// ViewGroup.java
    public void addView(View child, int index) {
        ...
        LayoutParams params = child.getLayoutParams();
        ...
        addView(child, index, params);
    }
    public void addView(View child, int index, LayoutParams params) {
        ...
        requestLayout();
        invalidate(true);
        addViewInner(child, index, params, false);
    }
```

这里就不详细分析了，继续回到 `handleResumeActivity()` 中；

## 2. WMI.addView(DecorView)

先回忆一下为什么分析 setContentView()，因为在分析 `handleResumeActivity()` 时遇到了 DecorView、Window、WindowManager 等不熟悉的对象，但是这些对象的来源和 `setContentView()` 有关，所以就转而分析 `setContentView()` 了；

``` java
// ActivityThread.java
    public void handleResumeActivity(ActivityClientRecord r, boolean finalStateRequest,
            boolean isForward, String reason) {
        ...
            ViewManager wm = a.getWindowManager();
                    wm.addView(decor, l); // 把获取的 DecorView 添加到 ViewManager 中，调用 WindowManagerImpl.addView
                } else {
            ...
        Looper.myQueue().addIdleHandler(new Idler());
    }
```

上文得知 wm 是 WindowManagerImpl 实例，所以继续调用到 `WindowManagerImpl.addView()`；

``` java
// WindowManagerImpl.java
    private final WindowManagerGlobal mGlobal = WindowManagerGlobal.getInstance();
    public void addView(@NonNull View view, @NonNull ViewGroup.LayoutParams params) {
        applyTokens(params);
        mGlobal.addView(view, params, mContext.getDisplayNoVerify(), mParentWindow,
                mContext.getUserId());
    }
```

这个 `mGlobal` 是一个 WindowManagerGlobal 对象，

``` java
// WindowManagerGlobal.java
    private final ArrayList<View> mViews = new ArrayList<View>();
    private final ArrayList<ViewRootImpl> mRoots = new ArrayList<ViewRootImpl>();
    private final ArrayList<WindowManager.LayoutParams> mParams =
            new ArrayList<WindowManager.LayoutParams>();

    public void addView(View view, ViewGroup.LayoutParams params,
            Display display, Window parentWindow, int userId) {
        ...
        ViewRootImpl root;
        View panelParentView = null;

        synchronized (mLock) {
            ...
            root = new ViewRootImpl(view.getContext(), display); // 创建 ViewRootImpl

            view.setLayoutParams(wparams);

            mViews.add(view); // 保存 DecorView 实例
            mRoots.add(root); // 保存 root 到 mRoots 这个 ArrayList 中
            mParams.add(wparams); // 保存布局配置信息

            // do this last because it fires off messages to start doing things
            try {
                // 传入的 view 是 PhoneWindow.mDecor(DecorView 对象)，从 ActivityThread.handleResumeActivity 中的 addView 传过来的
                root.setView(view, wparams, panelParentView, userId); // 把视图添加到窗口
            } catch (RuntimeException e) {
                ...
```

new 了一个 ViewRootImpl 对象，来看看 ViewRootImpl 的构造函数；

### 2.1 ViewRootImpl 构造函数

``` java
// ViewRootImpl.java
    public ViewRootImpl(Context context, Display display) {
        this(context, display, WindowManagerGlobal.getWindowSession(), false /* useSfChoreographer */);
    }
    public ViewRootImpl(@UiContext Context context, Display display, IWindowSession session,
            boolean useSfChoreographer) {
        mContext = context;
        // Session 负责 Activity 到 WMS 的通信，和 W 对象反向
        mWindowSession = session; // 把 WMS.openSession 返回的 IWindowSession 对象传递给 ViewRootImpl.mWindowSession
        mDisplay = display;
        mBasePackageName = context.getBasePackageName();
        mThread = Thread.currentThread(); // 把当前创建 ViewRootImpl 的线程传递给 ViewRootImpl.mThread
        ...
        mWidth = -1;
        mHeight = -1;
        ...
        mWindow = new W(this); // W extends IWindow.Stub，负责 WMS 到 Activity 的通信
        mAttachInfo = new View.AttachInfo(mWindowSession, mWindow, display, this, mHandler, this,
                context);
        ...
        mChoreographer = useSfChoreographer
                ? Choreographer.getSfInstance() : Choreographer.getInstance();
        mDisplayManager = (DisplayManager)context.getSystemService(Context.DISPLAY_SERVICE);
        mInsetsController = new InsetsController(new ViewRootInsetsControllerHost(this));
        ...
```

构造函数传递了一个 `WindowManagerGlobal.getWindowSession()` 作为参数，

``` java
// WindowManagerGlobal.java
    private static IWindowSession sWindowSession;
    public static IWindowSession getWindowSession() {
        synchronized (WindowManagerGlobal.class) {
            if (sWindowSession == null) {
                try {
                    InputMethodManager.ensureDefaultInstanceForDefaultDisplayIfNecessary();
                    IWindowManager windowManager = getWindowManagerService(); // 获取 WMS 代理
                    sWindowSession = windowManager.openSession(
                            new IWindowSessionCallback.Stub() {
                                @Override
                                public void onAnimatorScaleChanged(float scale) {
                                    ValueAnimator.setDurationScale(scale);
                                }
                            });
                ...
            return sWindowSession;
// 获取 WMS 的 binder 代理对象
    public static IWindowManager getWindowManagerService() {
        synchronized (WindowManagerGlobal.class) {
            if (sWindowManagerService == null) {
                sWindowManagerService = IWindowManager.Stub.asInterface(
                        ServiceManager.getService("window"));
                ...
            return sWindowManagerService;
```

`getWindowManagerService()` 获取 WMS 的 binder 代理 sWindowManagerService，所以 `openSession()` 的实现在 WMS 中：

``` java
// WindowManagerService.java
    public IWindowSession openSession(IWindowSessionCallback callback) {
        return new Session(this, callback);
    }
// Session.java
class Session extends IWindowSession.Stub implements IBinder.DeathRecipient {
    public Session(WindowManagerService service, IWindowSessionCallback callback) {
        mService = service;
```

总结 ViewRootImpl 构造函数：

-   ViewRootImpl 通过 `WindowManagerGlobal.getWindowSession()` 先通过 binder 通信 **获取 WMS 的代理**；
-   调用 WMS.openSession() 得到一个 IWindowSession 对象（Session 继承自 IWindowSession.Stub），支持 Binder 通信，且属于服务端；
-   把 IWindowSession 传递给 `ViewRootImpl.mWindowSession` ，Session 持有 WMS 对象，这样 Activity 就可以<font color=red>**通过 mWindowSession 和 WMS 通信**</font>（为什么不直接使用 WMS 的代理通信呢？）；
-   创建 W 对象，W 继承 IWindow.Stub，会通过 `ViewRootImpl.setView()` 传递到 WMS 中以创建 Activity 对应的 WindowState，<font color=red>**W 也负责 WMS 到 Activity 的通信**</font>；

### 2.2 ViewRootImpl.setView()

``` java
// ViewRootImpl.java
    public void setView(View view, WindowManager.LayoutParams attrs, View panelParentView,
            int userId) {
        synchronized (this) {
            if (mView == null) {
                mView = view; // 1. 保存传入的 view 参数到 ViewRootImpl.mView，view 指向 PhoneWindow.mDecor(DecorView)
                ...
                // 2. 使用 ViewRootImpl.mChoreographer 的 Handler 发送一个 MSG_DO_SCHEDULE_CALLBACK 消息
                requestLayout();
                ...
                try {
                    ...
                    // 3. 把 W 对象 mWindow 传递到 WMS 以创建 WindowState
                    res = mWindowSession.addToDisplayAsUser(mWindow, mWindowAttributes,
                            getHostVisibility(), mDisplay.getDisplayId(), userId,
                            mInsetsController.getRequestedVisibilities(), inputChannel, mTempInsets,
                            mTempControls);
                    ...
                view.assignParent(this); // 其中会设置 mParent，在 View.requestLayout() 时会用到
```

传入的参数 view 就是 DecorView，保存到 ViewRootImpl.mView；

- requestLayout()：Activity 视图首次显示之前，调用请求重新布局；
- addToDisplayAsUser()：

#### 2.2.1 VRI.requestLayout() - 请求布局

``` java
// ViewRootImpl.java
    public void requestLayout() {
        if (!mHandlingLayoutInLayoutRequest) {
            checkThread(); // 检查当前线程是否是创建 ViewRootImpl 的线程， 所以一般情况下子线程无法更新 UI 就是因为这里
            mLayoutRequested = true;
            scheduleTraversals(); // 发送一个消息
        }
    }
    void checkThread() {
        if (mThread != Thread.currentThread()) {
            throw new CalledFromWrongThreadException(
                    "Only the original thread that created a view hierarchy can touch its views.");
        }
    }
```

有个 checkThread() 函数，从前面 ViewRootImpl 构造函数可知这里的 mThread 是创建 ViewRootImpl 的线程，所以这里判断当前线程和创建 ViewRootImpl 的线程是否是同一线程，如果不是，则抛出异常提示只有创建它的线程才能更新它的 View，所以通常说的<font color=red>**子线程不能更新 UI 就是这个原因，但是在 ViewRootImpl 创建出来之前 UI 的更新没有线程限制，因为 checkThread() 不会被执行**</font>；

``` java
// ViewRootImpl.java
    final TraversalRunnable mTraversalRunnable = new TraversalRunnable();
    void scheduleTraversals() {
        if (!mTraversalScheduled) {
            mTraversalScheduled = true;
            mTraversalBarrier = mHandler.getLooper().getQueue().postSyncBarrier(); // 设置同步屏障
            // 向 Choreographer 注册一个 VSYNC 信号回调处理，以执行视图的 Traversal 相关逻辑
            mChoreographer.postCallback(
                    Choreographer.CALLBACK_TRAVERSAL, mTraversalRunnable, null);
            notifyRendererOfFramePending();
            pokeDrawLockIfNeeded();
        }
    }
```

主要工作：

- 发送同步消息屏障，保障异步消息优先执行，后续会对消息添加异步标志；
- 向 Choreographer 注册一个 VSYNC 信号回调处理，以执行视图的 Traversal 相关逻辑；
- 当回调时，会执行类型为 TraversalRunnable 的 run() 方法；

``` java
// Choreographer.java
    public void postCallback(int callbackType, Runnable action, Object token) { // 发送回调事件
        postCallbackDelayed(callbackType, action, token, 0);
    }

    public void postCallbackDelayed(int callbackType,
            Runnable action, Object token, long delayMillis) {
        ...
        postCallbackDelayedInternal(callbackType, action, token, delayMillis);
    }

    private void postCallbackDelayedInternal(int callbackType,
            Object action, Object token, long delayMillis) {
        ...
        synchronized (mLock) {
            final long now = SystemClock.uptimeMillis(); // 从开机到现在的毫秒数
            final long dueTime = now + delayMillis;
            // 添加类型为 callbackType 的 CallbackQueue（将要执行的回调封装而成）
            mCallbackQueues[callbackType].addCallbackLocked(dueTime, action, token);

            if (dueTime <= now) {
                scheduleFrameLocked(now); // 立即执行
            } else { // 异步回调延迟执行
                Message msg = mHandler.obtainMessage(MSG_DO_SCHEDULE_CALLBACK, action);
                msg.arg1 = callbackType;
                msg.setAsynchronous(true); // 把消息设置为异步
                mHandler.sendMessageAtTime(msg, dueTime);
            }
        }
    }
```

根据传入的 Runnable 构建 CallbackRecord 对象：

``` java
// Choreographer.java
        public void addCallbackLocked(long dueTime, Object action, Object token) {
            CallbackRecord callback = obtainCallbackLocked(dueTime, action, token);
            CallbackRecord entry = mHead;
            if (entry == null) {
                mHead = callback;
                return;
            }
            if (dueTime < entry.dueTime) {
                callback.next = entry;
                mHead = callback;
                return;
            }
            while (entry.next != null) {
                if (dueTime < entry.next.dueTime) {
                    callback.next = entry.next;
                    break;
                }
                entry = entry.next;
            }
            entry.next = callback;
        }
```

最终都是执行到 `scheduleFrameLocked()`；

``` java
// Choreographer.java
    private void scheduleFrameLocked(long now) {
        if (!mFrameScheduled) {
            mFrameScheduled = true;
            if (USE_VSYNC) {
                if (DEBUG_FRAMES) {
                    Log.d(TAG, "Scheduling next frame on vsync.");
                }

                // If running on the Looper thread, then schedule the vsync immediately,
                // otherwise post a message to schedule the vsync from the UI thread
                // as soon as possible.
                if (isRunningOnLooperThreadLocked()) { // 当运行在 Looper 线程，则立刻调度 vsync
                    scheduleVsyncLocked();
                } else { // 切换到主线程，调度 vsync
                    Message msg = mHandler.obtainMessage(MSG_DO_SCHEDULE_VSYNC);
                    msg.setAsynchronous(true);
                    mHandler.sendMessageAtFrontOfQueue(msg);
                }
            } else { // 如果没有 VSYNC 的同步，则发送消息刷新画面
                final long nextFrameTime = Math.max(
                        mLastFrameTimeNanos / TimeUtils.NANOS_PER_MS + sFrameDelay, now);
                if (DEBUG_FRAMES) {
                    Log.d(TAG, "Scheduling next frame in " + (nextFrameTime - now) + " ms.");
                }
                Message msg = mHandler.obtainMessage(MSG_DO_FRAME);
                msg.setAsynchronous(true);
                mHandler.sendMessageAtTime(msg, nextFrameTime);
            }
        }
    }

    private final class FrameHandler extends Handler {
        public FrameHandler(Looper looper) {
            super(looper);
        }

        @Override
        public void handleMessage(Message msg) {
            switch (msg.what) {
                case MSG_DO_FRAME: // 刷新当前这一帧
                    doFrame(System.nanoTime(), 0, new DisplayEventReceiver.VsyncEventData());
                    break;
                case MSG_DO_SCHEDULE_VSYNC: // 做 VSYNC 的信号同步
                    doScheduleVsync();
                    break;
                case MSG_DO_SCHEDULE_CALLBACK: // 将当前任务加入执行队列
                    doScheduleCallback(msg.arg1);
                    break;
            }
        }
    }
```



``` java
// Choreographer.java
    void doFrame(long frameTimeNanos, int frame,
            DisplayEventReceiver.VsyncEventData vsyncEventData) {
            // 顺序执行几种类型的事件回调处理
            doCallbacks(Choreographer.CALLBACK_INPUT, frameTimeNanos, frameIntervalNanos);
            doCallbacks(Choreographer.CALLBACK_ANIMATION, frameTimeNanos, frameIntervalNanos);
            doCallbacks(Choreographer.CALLBACK_INSETS_ANIMATION, frameTimeNanos, frameIntervalNanos);
            doCallbacks(Choreographer.CALLBACK_TRAVERSAL, frameTimeNanos, frameIntervalNanos);
            doCallbacks(Choreographer.CALLBACK_COMMIT, frameTimeNanos, frameIntervalNanos);
```

按照顺序执行几种类型的事件回调，这里我们要分析的是 CALLBACK_TRAVERSAL 类型，在 `scheduleTraversals()` 中传入；

``` java
// Choreographer.java
    void doCallbacks(int callbackType, long frameTimeNanos, long frameIntervalNanos) {
        CallbackRecord callbacks;
        synchronized (mLock) {
        try {
            Trace.traceBegin(Trace.TRACE_TAG_VIEW, CALLBACK_TRACE_TITLES[callbackType]);
            for (CallbackRecord c = callbacks; c != null; c = c.next) {
                if (DEBUG_FRAMES) {
                    Log.d(TAG, "RunCallback: type=" + callbackType
                            + ", action=" + c.action + ", token=" + c.token
                            + ", latencyMillis=" + (SystemClock.uptimeMillis() - c.dueTime));
                }
                c.run(frameTimeNanos);
            }
        }

// Choreographer.java
    private static final class CallbackRecord {
        public CallbackRecord next;
        public long dueTime;
        public Object action; // Runnable or FrameCallback
        public Object token;

        @UnsupportedAppUsage(maxTargetSdk = Build.VERSION_CODES.R, trackingBug = 170729553)
        public void run(long frameTimeNanos) {
            if (token == FRAME_CALLBACK_TOKEN) {
                ((FrameCallback)action).doFrame(frameTimeNanos);
            } else {
                ((Runnable)action).run();
            }
        }
    }
```

`CallbackRecord.run()` 直接运行封装的 `Runnable.run()`，而 `scheduleTraversals()` 中传入的 Runnable 是 TraversalRunnable，所以这里回调执行到 `TraversalRunnable.run()`；

``` java
// ViewRootImpl.java
    final class TraversalRunnable implements Runnable {
        @Override
        public void run() {
            doTraversal();
        }
    }
    final TraversalRunnable mTraversalRunnable = new TraversalRunnable();
```

调用 `doTraversal()`；

``` java
// ViewRootImpl.java
    void doTraversal() {
        if (mTraversalScheduled) {
            mTraversalScheduled = false;
            mHandler.getLooper().getQueue().removeSyncBarrier(mTraversalBarrier); // 移除同步屏障

            if (mProfile) {
                Debug.startMethodTracing("ViewAncestor");
            }

            performTraversals();

            if (mProfile) {
                Debug.stopMethodTracing();
                mProfile = false;
            }
        }
    }
```

做了两件事：

- 移除同步消息屏障；
- 调用 `performTraversals()` ；

``` java
// ViewRootImpl.java
    private void performTraversals() {
```

`performTraversals()` 方法执行了测量（measure）、布局（layout）、绘制（draw）三大流程，此文暂不分析；

#### 2.2.2 Session.addToDisplayAsUser()

``` java
// Session.java
    final WindowManagerService mService;
    public int addToDisplayAsUser(IWindow window, WindowManager.LayoutParams attrs,
            int viewVisibility, int displayId, int userId, InsetsVisibilities requestedVisibilities,
            InputChannel outInputChannel, InsetsState outInsetsState,
            InsetsSourceControl[] outActiveControls) {
        return mService.addWindow(this, window, attrs, viewVisibility, displayId, userId,
                requestedVisibilities, outInputChannel, outInsetsState, outActiveControls);
    }
```

mService 是 WMS 对象，直接调用 `WMS.addWindow()`；

``` java
// WindowManagerService.java
    final HashMap<IBinder, WindowState> mWindowMap = new HashMap<>();
    public int addWindow(Session session, IWindow client, ...) {
        ...
        WindowState parentWindow = null; // WindowState 对象
        final int callingUid = Binder.getCallingUid();
        final int callingPid = Binder.getCallingPid();
        final long origId = Binder.clearCallingIdentity();
        final int type = attrs.type;

        synchronized (mGlobalLock) {
            ...
            if (type >= FIRST_SUB_WINDOW && type <= LAST_SUB_WINDOW) {
                // 1. 以 token 为 key 从 mWindowMap 中获取 WindowState 对象
                parentWindow = windowForClientLocked(null, attrs.token, false);
                ...
            }
            ...
            ActivityRecord activity = null;
            final boolean hasParent = parentWindow != null;
            WindowToken token = displayContent.getWindowToken(
                    hasParent ? parentWindow.mAttrs.token : attrs.token);
            ...
            // 2. 以 parentWindow 创建 WindowState
            final WindowState win = new WindowState(this, session, client, token, parentWindow,
                    appOp[0], attrs, viewVisibility, session.mUid, userId,
                    session.mCanAddInternalSystemWindow);
            ...
            win.attach(); // 3. 调用 attach
            mWindowMap.put(client.asBinder(), win);
            ...
        return res;
    }
```

主要工作：

- 创建 WindowState 对象，用来描述与 W 对象所关联的 Activity 的窗口状态，并且以后会通过这个 W 对象来控制对应的 Activity 的窗口状态；
- 调用 WindowState.attach() ；

``` java
// WindowState.java
    final Session mSession;
    void attach() {
        mSession.windowAddedLocked();
    }
```

继续调用 `Session.windowAddedLocked()` ；

``` java
// Session.java
    SurfaceSession mSurfaceSession;
    void windowAddedLocked() {
        ...
        if (mSurfaceSession == null) {
            mSurfaceSession = new SurfaceSession(); // 创建 SurfaceSession 对象
            mService.mSessions.add(this);
            ...
        }
        mNumWindow++;
    }
```





















AMS、Activity、WMS建立连接的过程如下：

Activity 启动时，AMS 服务会在服务端创建一个 ActivityRecord 对象。
AMS 使用 ActivityRecord（实现接口 IApplicationToken）为参数请求 WMS，WMS 为 Activity 组件创建一个 AppWindowToken 对象。
ActivityRecord 对象被保存在 AppWindowToken 对象的成员变量 appToken 中。
于是，在启动完成该 Activity 组件后，WMS 获得了一个 ActivityRecord 对象和一个对应的 W 对象。
WMS 会根据 AppWindowToken 对象以及 W 对象，为 Activity 创建一个 WindowState 对象，并且将 AppWindowToken 对象保存在 WindowState 对象的mAppToken中。
每一个 Activity 组件，在 ActivityManagerService 服务内部都有一个对应的 ActivityRecord 对象，并且在 WindowManagerService 服务内部关联有一个AppWindowToken 对象。
