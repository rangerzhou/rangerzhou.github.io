---
title: Android - 系统窗口的添加过程
date: 2022-02-27 14:25:36
tags:
categories: Android
copyright: true
password:
---



>Android 系统窗口的添加过程，源码基于 android-12.1.0_r4；

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
            return ComponentName.unflattenFromString(mContext.getResources().getString(
                    com.android.internal.R.string.config_systemUIServiceComponent));
        }
```





``` xml
// frameworks/base/core/res/res/values/config.xml
    <string name="config_systemUIServiceComponent" translatable="false"
            >com.android.systemui/com.android.systemui.SystemUIService</string>
```



``` java
// SystemUIService.java
    public void onCreate() {
        super.onCreate();

        // Start all of SystemUI
        ((SystemUIApplication) getApplication()).startServicesIfNeeded(); // 1
```



``` java
// SystemUIApplication.java
    public void startServicesIfNeeded() { // SystemUIService.onCreate() 中调用
        // 获取 SystemUI 中所有服务类名
        String[] names = SystemUIFactory.getInstance().getSystemUIServiceComponents(getResources());
        startServicesIfNeeded(/* metricsPrefix= */ "StartServices", names);
    }
```



``` java
// SystemUIFactory.java
    public String[] getSystemUIServiceComponents(Resources resources) {
        return resources.getStringArray(R.array.config_systemUIServiceComponents);
    }
```

SystemUI 所有的服务定义在 config_systemUIServiceComponents 里，状态栏对应 StatusBar 这个；

``` xml
// frameworks/base/packages/SystemUI/res/values/config.xml
    <string-array name="config_systemUIServiceComponents" translatable="false">
        <item>com.android.systemui.util.NotificationChannels</item>
        <item>com.android.systemui.keyguard.KeyguardViewMediator</item>
        <item>com.android.systemui.recents.Recents</item>
        <item>com.android.systemui.volume.VolumeUI</item>
        <item>com.android.systemui.statusbar.phone.StatusBar</item>
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
                SystemUI obj = mComponentHelper.resolveSystemUI(clsName);
                if (obj == null) {
                    // 利用反射获取服务对象
                    Constructor constructor = Class.forName(clsName).getConstructor(Context.class);
                    obj = (SystemUI) constructor.newInstance(this);
                }
                mServices[i] = obj;
            } catch (...) {
                throw new RuntimeException(ex);
            }

            if (DEBUG) Log.d(TAG, "running: " + mServices[i]);
            mServices[i].start(); // 启动服务
            ...

        mServicesStarted = true;
    }
```

这里启动 StatusBar 这个服务

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

