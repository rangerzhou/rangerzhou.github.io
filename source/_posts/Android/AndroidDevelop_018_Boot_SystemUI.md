---
title: Android - SystemUI 启动
date: 2022-02-27 14:25:36
tags:
categories: Android
copyright: true
password:
---



>Android SystemUI 启动流程，源码基于 android-12.1.0_r4；

<!--more-->

SystemUI 启动

``` java
// SystemServer.java
    private void startOtherServices(@NonNull TimingsTraceAndSlog t) {
        t.traceBegin("StartSystemUI");
        try {
            startSystemUi(context, windowManagerF);
        }
    private static void startSystemUi(Context context, WindowManagerService windowManager) {
        PackageManagerInternal pm = LocalServices.getService(PackageManagerInternal.class);
        Intent intent = new Intent();
        intent.setComponent(pm.getSystemUiServiceComponent()); // 设置 SystemUIService Component
        intent.addFlags(Intent.FLAG_DEBUG_TRIAGED_MISSING);
        //Slog.d(TAG, "Starting service: " + intent);
        context.startServiceAsUser(intent, UserHandle.SYSTEM); // 启动服务
        windowManager.onSystemUiStarted();
    }
        public ComponentName getSystemUiServiceComponent() {
            // 根据 config_systemUIServiceComponent 获取服务组件
            return ComponentName.unflattenFromString(mContext.getResources().getString(
                    com.android.internal.R.string.config_systemUIServiceComponent));
        }
```

根据 config_systemUIServiceComponent 获取 SystemUIService 服务，并通过 `startServiceAsUser()` 启动服务；

``` xml
// frameworks/base/core/res/res/values/config.xml
    <string name="config_systemUIServiceComponent" translatable="false"
            >com.android.systemui/com.android.systemui.SystemUIService</string>
```

进程启动后会执行到 `ActivityThread.main()` 方法中，然后调用 `thread.attach()`，attach 通过 binder 调用 `AMS.attachApplication() -> attachApplicationLocked() -> thread.bindApplication()`，然后发送 Handler 消息 BIND_APPLICATION，主线程 looper 收到后调用 `handleBinderApplication()`，接下来从这里分析；

``` java
// ActivityThread.java
    static final class AppBindData {
        LoadedApk info;
    }
    private void handleBindApplication(AppBindData data) {
        // 创建 LoadedApk
        data.info = getPackageInfoNoCheck(data.appInfo, data.compatInfo);
        Application app;
            app = data.info.makeApplication(data.restrictedBackupMode, null); // 创建 Application
            if (!data.restrictedBackupMode) {
                if (!ArrayUtils.isEmpty(data.providers)) {
                    installContentProviders(app, data.providers); // 创建 COntentProvider
                }
            }
            try {
                mInstrumentation.callApplicationOnCreate(app); // 调用 Application.onCreate() 方法
            }
```

data 是 AppBindData 对象，所以 data.info 则是 LoadedApk 对象，主要工作：

- getPackageInfoNoCheck()：创建 LoadedApk；
- makeApplication()：创建 Application；
- 调用 Application.onCreate()；



``` java
// ActivityThread.java
    final ArrayMap<String, WeakReference<LoadedApk>> mPackages = new ArrayMap<>();
    public final LoadedApk getPackageInfoNoCheck(ApplicationInfo ai,
            CompatibilityInfo compatInfo) {
        return getPackageInfo(ai, compatInfo, null, false, true, false);
    }
    private LoadedApk getPackageInfo(ApplicationInfo aInfo, CompatibilityInfo compatInfo,
            ClassLoader baseLoader, boolean securityViolation, boolean includeCode,
            boolean registerPackage) {
        final boolean differentUser = (UserHandle.myUserId() != UserHandle.getUserId(aInfo.uid));
        synchronized (mResourcesManager) {
            WeakReference<LoadedApk> ref;
            ...
            LoadedApk packageInfo = ref != null ? ref.get() : null;
            ...
            packageInfo = // 创建 LoadedApk 对象
                    new LoadedApk(this, aInfo, compatInfo, baseLoader,
                            securityViolation, includeCode
                            && (aInfo.flags & ApplicationInfo.FLAG_HAS_CODE) != 0, registerPackage);

            if (mSystemThread && "android".equals(aInfo.packageName)) {
                packageInfo.installSystemApplicationInfo(aInfo,
                        getSystemContext().mPackageInfo.getClassLoader());
            }

            if (differentUser) {
                // Caching not supported across users
            } else if (includeCode) { // 传入的参数为 true
                mPackages.put(aInfo.packageName,
                        new WeakReference<LoadedApk>(packageInfo)); // 把 LoadedApk 的弱引用添加到 mPackages 中
            } else {...}
            return packageInfo;
        }
    }
```

创建 LoadedApk 对象，并把它的弱引用添加到 mPackages 这个 ArrayMap 中，最后返回 pacakgeInfo；

``` java
// LoadedApk.java
    public LoadedApk(ActivityThread activityThread, ApplicationInfo aInfo,
            CompatibilityInfo compatInfo, ClassLoader baseLoader,
            boolean securityViolation, boolean includeCode, boolean registerPackage) {

        mActivityThread = activityThread;
        setApplicationInfo(aInfo);
        mPackageName = aInfo.packageName;
        mBaseClassLoader = baseLoader;
        mSecurityViolation = securityViolation;
        mIncludeCode = includeCode;
        mRegisterPackage = registerPackage;
        mDisplayAdjustments.setCompatibilityInfo(compatInfo);
        mAppComponentFactory = createAppFactory(mApplicationInfo, mBaseClassLoader); // 创建 AppComponentFactory 对象
    }
```

LoadedApk 对象构造函数中创建了 AppComponentFactory 对象；



接下来看一下 makeApplication()；

``` java
// LoadedApk.java
    public Application makeApplication(boolean forceDefaultAppClass,
            Instrumentation instrumentation) {
        if (mApplication != null) {
            return mApplication;
        }
        Application app = null;
        String appClass = mApplicationInfo.className;
        try {
            final java.lang.ClassLoader cl = getClassLoader();
            ...
            // 创建 Application 的 Context
            ContextImpl appContext = ContextImpl.createAppContext(mActivityThread, this);
            ...
            // 通过 Instrumentation 创建 Application
            app = mActivityThread.mInstrumentation.newApplication(cl, appClass, appContext);
            appContext.setOuterContext(app);
        } catch (Exception e) {...}
        mActivityThread.mAllApplications.add(app);
        mApplication = app;
        ...
        return app;
    }
```

又调用了 Instrumentation.newApplication()；

``` java
// Instrumentation.java
    public Application newApplication(ClassLoader cl, String className, Context context)
            throws InstantiationException, IllegalAccessException, 
            ClassNotFoundException {
        // getFactory 返回 AppComponentFactory 对象（在 AndroidManifest.xml 中配置，如未配置则返回 AppComponentFactory.DEFAULT）
        // 随后调用 androidx.core.app.AppComponentFactory.instantiateApplication 创建 Application 对象
        Application app = getFactory(context.getPackageName())
                .instantiateApplication(cl, className);
        app.attach(context);
        return app;
    }
```

先执行 getFactory() 获取 AppComponentFactory 对象，再执行 instantiateApplication() 获取 Application 对象；

``` java
// Instrumentation.java
    private AppComponentFactory getFactory(String pkg) {
        ...
        LoadedApk apk = mThread.peekPackageInfo(pkg, true);
        // This is in the case of starting up "android".
        if (apk == null) apk = mThread.getSystemContext().mPackageInfo;
        return apk.getAppFactory();
    }
```

getFactory() 通过 LoadedApk.getAppFactory() 来获取 AppComponentFactory 对象；

``` java
// LoadedApk.java
    private AppComponentFactory mAppComponentFactory;
    public AppComponentFactory getAppFactory() {
        return mAppComponentFactory;
    }
```

getAppFactory() 返回 AppComponentFactory 对象，前面讲到在 LoadedApk 的构造函数中通过 `LoadedApk.createAppFactory()` 创建了这个对象，

``` java
// LoadedApk.java
    private AppComponentFactory createAppFactory(ApplicationInfo appInfo, ClassLoader cl) {
        if (mIncludeCode && appInfo.appComponentFactory != null && cl != null) {
            try {
                return (AppComponentFactory)
                        cl.loadClass(appInfo.appComponentFactory).newInstance();
            } catch (InstantiationException | IllegalAccessException | ClassNotFoundException e) {
                Slog.e(TAG, "Unable to instantiate appComponentFactory", e);
            }
        }
        return AppComponentFactory.DEFAULT;
    }
```

如果 appInfo.appComponentFactory 不等于 null，通过 ClassLoader 加载对应的类创建实例，否则返回 AppComponentFactory.DEFAULT，那么 AppComponentFactory 是什么呢？

``` java

public class AppComponentFactory {
    public @NonNull ClassLoader instantiateClassLoader(...
    public @NonNull Application instantiateApplication(@NonNull ClassLoader cl,
            @NonNull String className)
            throws InstantiationException, IllegalAccessException, ClassNotFoundException {
        return (Application) cl.loadClass(className).newInstance();
    }
    public @NonNull Activity instantiateActivity(...
    public @NonNull BroadcastReceiver instantiateReceiver(...
    public @NonNull ContentProvider instantiateProvider(...
    public static final AppComponentFactory DEFAULT = new AppComponentFactory();
```





进入 SystemUIService#onCreate()

``` java
// SystemUIService.java
    public void onCreate() {
        super.onCreate();

        // Start all of SystemUI
        ((SystemUIApplication) getApplication()).startServicesIfNeeded(); // 1
```

调用 SystemUIApplication#startServicesIfNeeded()

``` java
// SystemUIApplication.java
    public void startServicesIfNeeded() { // SystemUIService.onCreate() 中调用
        // 获取 SystemUI 中所有服务类名
        String[] names = SystemUIFactory.getInstance().getSystemUIServiceComponents(getResources());
        startServicesIfNeeded(/* metricsPrefix= */ "StartServices", names);
    }
```

获取所有 SystemUI 中的服务组件，并在后续依次启动；

``` java
// SystemUIFactory.java
    public String[] getSystemUIServiceComponents(Resources resources) {
        return resources.getStringArray(R.array.config_systemUIServiceComponents);
    }
```

config_systemUIServiceComponents 定义了 SystemUI 的子类组件，状态栏对应 StatusBar 这个；

``` xml
<!--frameworks/base/packages/SystemUI/res/values/config.xml-->
    <string-array name="config_systemUIServiceComponents" translatable="false">
        <item>com.android.systemui.util.NotificationChannels</item>
        <item>com.android.systemui.keyguard.KeyguardViewMediator</item>
        <item>com.android.systemui.recents.Recents</item>
        <item>com.android.systemui.volume.VolumeUI</item>
        <item>com.android.systemui.statusbar.phone.StatusBar</item> <!--状态栏-->
        <item>com.android.systemui.usb.StorageNotification</item>
        <item>com.android.systemui.power.PowerUI</item>
        <item>com.android.systemui.media.RingtonePlayer</item>
        <item>com.android.systemui.keyboard.KeyboardUI</item>
        <item>com.android.systemui.shortcut.ShortcutKeyDispatcher</item>
        <item>@string/config_systemUIVendorServiceComponent</item>
        <item>com.android.systemui.util.leak.GarbageMonitor$Service</item>
        <item>com.android.systemui.LatencyTester</item>
        <item>com.android.systemui.globalactions.GlobalActionsComponent</item>
        <item>com.android.systemui.ScreenDecorations</item>
        <item>com.android.systemui.biometrics.AuthController</item>
        <item>com.android.systemui.SliceBroadcastRelayHandler</item>
        <item>com.android.systemui.statusbar.notification.InstantAppNotifier</item>
        <item>com.android.systemui.theme.ThemeOverlayController</item>
        <item>com.android.systemui.accessibility.WindowMagnification</item>
        <item>com.android.systemui.accessibility.SystemActions</item>
        <item>com.android.systemui.toast.ToastUI</item>
        <item>com.android.systemui.wmshell.WMShell</item>
    </string-array>
```

根据 config_systemUIServiceComponents 获取**包含继承自 SystemUI 的子类名**的数组，作为参数传入 startServicesIfNeeded()；

``` java
// SystemUIApplication.java
    private void startServicesIfNeeded(String metricsPrefix, String[] services) {
        if (mServicesStarted) {
            return;
        }
        mServices = new SystemUI[services.length];
        ...
        final int N = services.length;
        for (int i = 0; i < N; i++) {
            String clsName = services[i];
            if (DEBUG) Log.d(TAG, "loading: " + clsName);
            log.traceBegin(metricsPrefix + clsName);
            long ti = System.currentTimeMillis();
            try {
                SystemUI obj = mComponentHelper.resolveSystemUI(clsName); // 将类名转换为类的实例
                if (obj == null) { // 如果为空则利用反射获取服务类的实例
                    Constructor constructor = Class.forName(clsName).getConstructor(Context.class);
                    obj = (SystemUI) constructor.newInstance(this);
                }
                mServices[i] = obj;
            } catch (...) {
                throw new RuntimeException(ex);
            }

            if (DEBUG) Log.d(TAG, "running: " + mServices[i]);
            mServices[i].start(); // 启动服务
            if (mBootCompleteCache.isBootComplete()) {
                mServices[i].onBootCompleted();
            }
            ...
        mServicesStarted = true;
    }
```

遍历 SystemUI 子类对象，根据类名通过反射获取子类实例，将实例赋值给 mServices 数组，并执行子类 `start()` 方法，这里以 StatusBar 为例；

``` java
// StatusBar.java
    public void start() {
        mScreenLifecycle.addObserver(mScreenObserver);
        mWakefulnessLifecycle.addObserver(mWakefulnessObserver);
        mUiModeManager = mContext.getSystemService(UiModeManager.class);
        mBypassHeadsUpNotifier.setUp();
        if (mBubblesOptional.isPresent()) {
            mBubblesOptional.get().setExpandListener(mBubbleExpandListener);
        }

        mStatusBarSignalPolicy.init();
        mKeyguardIndicationController.init();

        mColorExtractor.addOnColorsChangedListener(mOnColorsChangedListener);
        mStatusBarStateController.addCallback(mStateListener,
                SysuiStatusBarStateController.RANK_STATUS_BAR);
        // 获取 WindowManagerImpl
        mWindowManager = (WindowManager) mContext.getSystemService(Context.WINDOW_SERVICE);
        mDreamManager = IDreamManager.Stub.asInterface(
                ServiceManager.checkService(DreamService.DREAM_SERVICE));

        mDisplay = mContext.getDisplay();
        mDisplayId = mDisplay.getDisplayId();
        updateDisplaySize();
        mStatusBarHideIconsForBouncerManager.setDisplayId(mDisplayId);

        // start old BaseStatusBar.start().
        mWindowManagerService = WindowManagerGlobal.getWindowManagerService(); // 获取 IWindowManager.Stub.Proxy
        mDevicePolicyManager = (DevicePolicyManager) mContext.getSystemService(
                Context.DEVICE_POLICY_SERVICE);

        mAccessibilityManager = (AccessibilityManager)
                mContext.getSystemService(Context.ACCESSIBILITY_SERVICE);

        mKeyguardUpdateMonitor.setKeyguardBypassController(mKeyguardBypassController);
        mBarService = IStatusBarService.Stub.asInterface(
                ServiceManager.getService(Context.STATUS_BAR_SERVICE));

        mKeyguardManager = (KeyguardManager) mContext.getSystemService(Context.KEYGUARD_SERVICE);
        mWallpaperSupported = mWallpaperManager.isWallpaperSupported();

        RegisterStatusBarResult result = null;
        try {
            result = mBarService.registerStatusBar(mCommandQueue);
        } catch (RemoteException ex) {
            ex.rethrowFromSystemServer();
        }
        // 创建状态栏 View，并将其添加到 WindowManager
        createAndAddWindows(result);
```



``` java
// StatusBar.java
    // 创建状态栏 View, 并将其添加到 WindowManager
    public void createAndAddWindows(@Nullable RegisterStatusBarResult result) {
        makeStatusBarView(result); // 根据布局文件 super_status_bar.xml 创建 StatusBarWindowView
        mNotificationShadeWindowController.attach();

        mStatusBarWindowController.attach(); // 将 StatusBarWindowView 添加到 WindowManager
    }
```



