---
title: Android - PackageManagerService 简析
date: 2022-01-12 12:33:17
tags:
categories: Android
copyright: true
password:
---



>PackageManagerService（PKMS）是 Android 系统中的核心服务之一，负责应用程序的安装、卸载、信息查询等工作，本文简要分析 PKMS 的启动和安装应用过程，源码基于 android-12.1.0_r4；

<!--more-->

## 1 概述

Android 系统启动时，会启动 PKMS，此服务负责扫描系统中特定的目录，寻找里面的 APK 格式文件，并对这些文件进行解析，然后得到应用程序相关信息，会全面解析应用程序的 AndroidManifest.xml，得到 Activity / Service / BroadcastReceiver / ContentProvider 等信息，最后完成应用程序的安装。



## 2 PKMS 启动

PKMS 属于 system_server 进程，在 Zygote 启动 system_server 的时候在 SystemServer.main() 中启动了近百个系统服务；

### 2.1 SystemServer.main()

``` java
// SystemServer.java
    public static void main(String[] args) {
        new SystemServer().run();
    }

    private void run() {
        // Start services.
        try {
            t.traceBegin("StartServices");
            startBootstrapServices(t); // 启动引导服务
            startCoreServices(t); // 启动核心服务
            startOtherServices(t); // 启动其他服务
        }

    private void startBootstrapServices(@NonNull TimingsTraceAndSlog t) {
        ...
        Installer installer = mSystemServiceManager.startService(Installer.class); // 1.启动 installer
        // Only run "core" apps if we're encrypting the device.
        // 2.如果设备加密，只运行核心 app
        String cryptState = VoldProperties.decrypt().orElse("");
        if (ENCRYPTING_STATE.equals(cryptState)) {
            Slog.w(TAG, "Detected encryption in progress - only parsing core apps");
            mOnlyCore = true;
        } else if (ENCRYPTED_STATE.equals(cryptState)) {
            Slog.w(TAG, "Device encrypted - only parsing core apps");
            mOnlyCore = true;
        }
        t.traceBegin("StartPackageManagerService");
        try { // 3.启动 PKMS
            Watchdog.getInstance().pauseWatchingCurrentThread("packagemanagermain");
            mPackageManagerService = PackageManagerService.main(mSystemContext, installer,
                    domainVerificationService, mFactoryTestMode != FactoryTest.FACTORY_TEST_OFF,
                    mOnlyCore);
        } finally {
            Watchdog.getInstance().resumeWatchingCurrentThread("packagemanagermain");
        }
        mFirstBoot = mPackageManagerService.isFirstBoot();
        // 4.如果设备没有加密，启动 OtaDexOptService 服务
        if (!mOnlyCore) {
            boolean disableOtaDexopt = SystemProperties.getBoolean("config.disable_otadexopt",
                    false);
            if (!disableOtaDexopt) {
                t.traceBegin("StartOtaDexOptService");
                try {
                    Watchdog.getInstance().pauseWatchingCurrentThread("moveab");
                    OtaDexoptService.main(mSystemContext, mPackageManagerService);
                } catch (Throwable e) {
                    ...
```

上述代码主要做了四件事：

- 启动 installer：阻塞等待 installer 启动完成，以便有机会创建具有适当权限的关键目录，比如 */data/user*；
- 检查设备是否加密：如果加密了，则只解析 core 应用，并配置 `mOnlyCore = true`，后续会多次使用该变量进行条件判断；
- 初始化 PKMS：调用 PKMS.main() 初始化 PKMS；
- 启动 OtaDexOptService 服务：如果设备没有加密则启动 dex 服务；

``` java
// SystemServer.java
    private void startOtherServices(@NonNull TimingsTraceAndSlog t) {
        ...
        if (!mOnlyCore) {
            try {
                // 5.如果设备没有加密，执行 performDexOptUpgrade，完成 dex 优化
                mPackageManagerService.updatePackagesIfNeeded();
            }
        try { // 6.执行 performFstrimIfNeeded，完成磁盘维护
            mPackageManagerService.performFstrimIfNeeded();
        }
        // 7.PKMS 准备就绪
        t.traceBegin("MakePackageManagerServiceReady");
        mPackageManagerService.systemReady();
        t.traceEnd();
```

在 `startOtherServices()` 中继续有 PKMS 的相关操作：

- 执行 dex 优化；
- 完成磁盘维护；
- PKMS 准备就绪；



### 2.2 PKMS.main()

``` java
    public static PackageManagerService main(Context context, Installer installer,
            @NonNull DomainVerificationService domainVerificationService, boolean factoryTest,
            boolean onlyCore) {
        PackageManagerServiceCompilerMapping.checkProperties(); // 1.检查 package 编译相关属性
        Injector injector = new Injector(
                ...
                (i, pm) -> PermissionManagerService.create(context,
                        i.getSystemConfig().getAvailableFeatures()),
                (i, pm) -> new UserManagerService(context, pm,
                        new UserDataPreparer(installer, installLock, context, onlyCore),
                        lock),
                (i, pm) -> new Settings(Environment.getDataDirectory(),
                        RuntimePermissionsPersistence.createInstance(),
                        i.getPermissionManagerServiceInternal(),
                        domainVerificationService, lock),
                ...
                (i, pm) -> new PackageInstallerService(
                        i.getContext(), pm, i::getScanningPackageParser),
                ...
        PackageManagerService m = new PackageManagerService(injector, onlyCore, factoryTest,
                Build.FINGERPRINT, Build.IS_ENG, Build.IS_USERDEBUG, Build.VERSION.SDK_INT,
                Build.VERSION.INCREMENTAL);// 2.调用 PKMS 构造函数
        // 3.注册 PMS/PMN 到 servicemanager
        ServiceManager.addService("package", m);
        final PackageManagerNative pmn = m.new PackageManagerNative();
        ServiceManager.addService("package_native", pmn);
```

创建了一个 Injector 对象，其中使用 Singleton 的模式初始化了很多变量，传递到 PKMS 的构造函数中；

### 2.3 PKMS 构造函数

``` java
// PackageManagerService.java
    public PackageManagerService(Injector injector, boolean onlyCore, boolean factoryTest,
            final String buildFingerprint, final boolean isEngBuild,
            final boolean isUserDebugBuild, final int sdkVersion, final String incrementalVersion) {
        mLock = injector.getLock();
        // mInstallLock 用来保护所有安装 APK 的访问权限，此操作通常涉及繁重的磁盘数据读写等操作，并且是单线程操作，故有时候会处理很慢
        // 此锁不会在已经持有 mLock 锁的情况下获得，反之，在已经持有 mInstallLock 锁的情况下，立即获取 mLock 是安全的
        mInstallLock = injector.getInstallLock();
        LockGuard.installLock(mLock, LockGuard.INDEX_PACKAGES);
        // 阶段1：BOOT_PROGRESS_PMS_START
        EventLog.writeEvent(EventLogTags.BOOT_PROGRESS_PMS_START, SystemClock.uptimeMillis());
            // 阶段2：BOOT_PROGRESS_PMS_SYSTEM_SCAN_START
            EventLog.writeEvent(EventLogTags.BOOT_PROGRESS_PMS_SYSTEM_SCAN_START,
                    startTime);
            // 阶段3:BOOT_PROGRESS_PMS_DATA_SCAN_START
            if (!mOnlyCore) {
                EventLog.writeEvent(EventLogTags.BOOT_PROGRESS_PMS_DATA_SCAN_START, SystemClock.uptimeMillis());
            // 阶段4：BOOT_PROGRESS_PMS_SCAN_END
            EventLog.writeEvent(EventLogTags.BOOT_PROGRESS_PMS_SCAN_END, SystemClock.uptimeMillis());
            // 阶段5：BOOT_PROGRESS_PMS_READY
            EventLog.writeEvent(EventLogTags.BOOT_PROGRESS_PMS_READY, SystemClock.uptimeMillis());
```

PKMS 构造函数分为了 5 个阶段：

- BOOT_PROGRESS_PMS_START：构造 DisplayMetrics 保存分辨率信息，创建 mPermissionManager 进行管理权限，创建 mSettings 来保存安装包信息；
- BOOT_PROGRESS_PMS_SYSTEM_SCAN_START：扫描系统 apk（system/vendor/product 等目录），清除安装时的临时文件和其他不需要的信息；
- BOOT_PROGRESS_PMS_DATA_SCAN_START：扫描 data 目录 apk，
- BOOT_PROGRESS_PMS_SCAN_END：OTA 升级后首次启动要清除不必要的缓存数据，
- BOOT_PROGRESS_PMS_READY

#### 2.3.1 第一阶段 BOOT_PROGRESS_PMS_START

``` java
// PackageManagerService.java
    public PackageManagerService(...) {
        // 阶段1：BOOT_PROGRESS_PMS_START
        EventLog.writeEvent(EventLogTags.BOOT_PROGRESS_PMS_START, SystemClock.uptimeMillis());
        mOnlyCore = onlyCore; // 标注是否只加载
        mMetrics = injector.getDisplayMetrics(); // 保存分辨率等信息
        mInstaller = injector.getInstaller();
        mPermissionManager = injector.getPermissionManagerServiceInternal(); // 用来进行权限管理
        mSettings = injector.getSettings(); // mSettings 保存安装包信息
        // 
        mSettings.addSharedUserLPw("android.uid.system", Process.SYSTEM_UID,
                ApplicationInfo.FLAG_SYSTEM, ApplicationInfo.PRIVATE_FLAG_PRIVILEGED);
        mSettings.addSharedUserLPw("android.uid.phone", RADIO_UID,...);
        mSettings.addSharedUserLPw("android.uid.log", LOG_UID,...);
        mSettings.addSharedUserLPw("android.uid.nfc", NFC_UID,...);
        mSettings.addSharedUserLPw("android.uid.bluetooth", BLUETOOTH_UID,...);
        mSettings.addSharedUserLPw("android.uid.shell", SHELL_UID,...);
        mSettings.addSharedUserLPw("android.uid.se", SE_UID,...);
        mSettings.addSharedUserLPw("android.uid.networkstack", NETWORKSTACK_UID,...);
        mSettings.addSharedUserLPw("android.uid.uwb", UWB_UID,...);
        // 用于处理 dex 优化
        mPackageDexOptimizer = injector.getPackageDexOptimizer();
        mDexManager = injector.getDexManager();
```

利用 Injector 初始化一些实例，构造 DisplayMetrics，用于保存分辨率；创建 Installer 用于与 installd 交互；创建 mPermissionManager 进行权限管理；构造 Settings 类，保存安装包信息，清除路径不存在的孤立应用，给 mSettings 添加 system/phone/log/nfc/bluetooth/shell/se/networkstack/uwb 9 种 shareUserId 到 mSettings（**sharedUserId 属性相同的 package 可以运行在同一个进程中，或者相互读取资源**），Settings 可以看做是一个数据动态管理类，它主要会管理 packages.xml 文件中的信息；构造 PackageDexOptimizer 及 DexManager 类，处理 dex 优化；重点看一下 Settings 类：

``` java
// frameworks/base/services/core/java/com/android/server/pm/Settings.java
    Settings(File dataDir, RuntimePermissionsPersistence runtimePermissionsPersistence,
            LegacyPermissionDataProvider permissionDataProvider,
            @NonNull DomainVerificationManagerInternal domainVerificationManager,
            @NonNull PackageManagerTracedLock lock)  {
        mPackages = new WatchedArrayMap<>();
        ...
        mSettingsFilename = new File(mSystemDir, "packages.xml");
        mBackupSettingsFilename = new File(mSystemDir, "packages-backup.xml");
        mPackageListFilename = new File(mSystemDir, "packages.list");
        FileUtils.setPermissions(mPackageListFilename, 0640, SYSTEM_UID, PACKAGE_INFO_GID);

        final File kernelDir = new File("/config/sdcardfs");
        mKernelMappingFilename = kernelDir.exists() ? kernelDir : null;

        // Deprecated: Needed for migration
        mStoppedPackagesFilename = new File(mSystemDir, "packages-stopped.xml");
        mBackupStoppedPackagesFilename = new File(mSystemDir, "packages-stopped-backup.xml");
```

初始化一些变量指向的路径：

- mSettingsFilename：指向 */data/system/packages.xml*，记录了系统中所有安装应用的基本信息；
- mBackupSettingsFilename：指向 */data/system/packages-backup.xml*，是 packages.xml 的备份；
- mPackageListFilename：指向 */data/system/packages.list*，保存了应用的数据目录和 UID 等信息；
- mStoppedPackagesFilename：指向 */data/system/packages-stopped.xml*，记录系统中所有被强制停止运行的应用的信息；
- mBackupStoppedPackagesFilename：指向 */data/system/packages-stopped-backup.xml*，是 packages-stopped.xml 的备份；

随后在 PKMS 中调用 Settings.readLPw() 对 packages.xml 进行解析

``` java
// PackageManagerService.java 
            mFirstBoot = !mSettings.readLPw(mInjector.getUserManagerInternal().getUsers(true, false, false));
// Settings.java
    boolean readLPw(@NonNull List<UserInfo> users) {
        ...
                    // packages-backup.xml两个目录同时存在，则删除 packages.xml
                    mSettingsFilename.delete();
                // 如果 packages-backup.xml 没数据，则读取 packages.xml 中的数据
                str = new FileInputStream(mSettingsFilename);
            }
            final TypedXmlPullParser parser = Xml.resolvePullParser(str); // xml 解析器，解析 packages.xml

            ...
            while ((type = parser.next()) != XmlPullParser.END_DOCUMENT
                    && (type != XmlPullParser.END_TAG || parser.getDepth() > outerDepth)) {
                if (type == XmlPullParser.END_TAG || type == XmlPullParser.TEXT) {
                    continue;
                }
                // 根据 XML 的各个节点进行各种操作，例如读取权限、shared-user等
                String tagName = parser.getName();
                if (tagName.equals("package")) {
                    readPackageLPw(parser, users);
                } else if (tagName.equals("permissions")) {
                    mPermissions.readPermissions(parser);
                } else if (tagName.equals("permission-trees")) {
                    mPermissions.readPermissionTrees(parser);
                } else if (tagName.equals("shared-user")) {
                    readSharedUserLPw(parser, users);
                ...
```



#### 2.3.2 第二阶段 BOOT_PROGRESS_PMS_SYSTEM_SCAN_START

``` java
// PackageManagerService.java
    public PackageManagerService(...) {
            long startTime = SystemClock.uptimeMillis(); // 记录扫描开始时间

            EventLog.writeEvent(EventLogTags.BOOT_PROGRESS_PMS_SYSTEM_SCAN_START, startTime); // 进入第二阶段
            ...
                scanDirTracedLI(partition.getOverlayFolder(), ...); // vender/product/system_ext 下的 overlay 目录
            scanDirTracedLI(frameworkDir, ...); // system/framework
                    scanDirTracedLI(partition.getPrivAppFolder(), ...); // /xxx/priv-app 目录
                scanDirTracedLI(partition.getAppFolder(), ...); // /xxx/app 目录
            mSettings.pruneSharedUsersLPw();
            final long systemScanTime = SystemClock.uptimeMillis() - startTime; // 计算 system app 扫描时间
            final int systemPackagesCount = mPackages.size(); // system app 数量
```

调用 scanDirTracedLI() 扫描 system/vendor/product 等等目录下的 overlay/priv-app/app 目录；



#### 2.3.3 第三阶段 BOOT_PROGRESS_PMS_DATA_SCAN_START

``` java
             
            if (!mOnlyCore) {
                EventLog.writeEvent(EventLogTags.BOOT_PROGRESS_PMS_DATA_SCAN_START,
                        SystemClock.uptimeMillis()); // 进入第三阶段
                scanDirTracedLI(mAppInstallDir, 0, scanFlags | SCAN_REQUIRE_KNOWN, 0,
                        packageParser, executorService);
            }
                // 确保 userdata 分区上的系统应用都实际出现
                for (int i = 0; i < mExpectingBetter.size(); i++) {
                            final AndroidPackage newPkg = scanPackageTracedLI(
                                    scanFile, reparseFlags, rescanFlags, 0, null);
                final long dataScanTime = SystemClock.uptimeMillis() - systemScanTime - startTime;
                final int dataPackagesCount = mPackages.size() - systemPackagesCount;
```

第三阶段主要工作就是处理 data 目录的应用信息，及时更新，去除不必要的数据；

#### 2.3.4 第四阶段 BOOT_PROGRESS_PMS_SCAN_END



``` java
// PKMS.java
            EventLog.writeEvent(EventLogTags.BOOT_PROGRESS_PMS_SCAN_END,
                    SystemClock.uptimeMillis());
```

OTA 升级后首次启动要清除不必要的缓存数据、权限等默认项，更新后要清理相关数据，更新 packages.xml；

#### 2.3.5 第五阶段 BOOT_PROGRESS_PMS_READY

GC 回收内存；

#### 2.3.6 总结

- 第一阶段：创建 Settings 对象，读取 */data/system/packages.xml* 和 */data/system/packages-backup.xml*，并把解析结果存储到 Settings 对象；

- 第二阶段：扫描 system/vendor/product 等目录下的 overlay/priv-app/app 目录；
- 第三阶段：扫描 */data/* 目录；
- 第四阶段：把第二阶段、第三阶段扫描的结果写入 packages.xml，更新 packages.xml；
- 第五阶段：GC 回收内存；

### 2.4 APK 扫描

扫描 apk 总结下来分为两步，

- 扫描 APK，解析 AndroidManifest.xml 文件，得到清单文件各个标签内容；
- 解析清单文件的信息由 Package 保存，从该类的成员变量可看出，和 Android 四大组件相关的信息分别由 activites、receivers、providers、services 保存，由于一个 APK 可声明多个组件，因此 activites 和 receivers 等均声明为 ArrayList；

### 2.5 APK 安装

调用流程（从点击 apk 文件开始）：

- **PackageInstallerActivity**.bindUi()：弹出一个 Alert，点击安装调用到 startInstall()；
- startInstall()：使用 startActivity() 启动 **InstallInstalling**，随后执行 onCreate()，onResume()，
- InstallInstalling.onResume()：调用 **InstallingAsyncTask**.execute()，执行到 InstallingAsyncTask.onPostExecute()，又调用了 PackageInstaller.Session.commit()；
- **PackageInstaller**.Session.commit()：在其中又通过 **IPC 跨进程**调用到 system_server 进程的 **PackageInstallerSession** 服务的 commit()；
- **PackageInstallerSession**.dispatchSessionSealed()：发送 handle 消息 <font color=blue>**MSG_ON_SESSION_SEALED**</font>；
- **PackageInstallerSession**.handleMessage()：收到消息调用 handleSessionSealed() 发送 <font color=blue>**MSG_STREAM_VALIDATE_AND_COMMIT**</font> 消息，再调用 handleStreamValidateAndCommit() 发送 <font color=blue>**MSG_INSTALL**</font> 消息，然后调用 handleInstall()；
- **PackageInstallerSession**.verify() -> verifyNonStaged() -> prepareForVerification() -> makeVerificationParamsLocked() -> install() -> installNonStaged() -> PKMS.installStage()；
- **PackageManagerService**.installStage()：发送 Handle 消息 INIT_COPY；
- PKMS.PackageHandler.handlerMessage() -> doHandleMessage()；
- PKMS.HandlerParams.startCopy() -> handleStartCopy()，handleReturnCode()；
- PKMS.InstallParams.handleReturnCode()；
- processPendingInstall()；
  - PKMS.FileInstallArgs.copyApk() -> doCopyApk()；
  - **PackageManagerServiceUtils**.copyPackage()：先 copy apk 到 */data/app/base.apk* 下，再 copy so 文件，然后回到 processPendingInstall() 继续往下执行；
- **PackageManagerService**.processInstallRequestsAsync()：调用 installPackagesTracedLI()；
- installPackagesTracedLI()：调用 installPackagesLI() 安装解析 apk；
- installPackagesLI()
  - preparePackageLI()：准备，分析当前安装状态，解析包并初始验证；
  - scanPackageTracedLI()：根据准备阶段解析的包信息上下文，进一步解析；
    - scanPackageLI -> **PackageParser2**.parsePackage()：到这里又到了扫描 apk 的环节，后续步骤参考扫描总结；
  - reconcilePackagesLocked()：验证扫描后的包信息和系统状态，确保安装成功；
  - CommitRequest()：提交扫描的包、更新系统状态；
- **PackageManagerService**.executePostCommitSteps()：安装完成后，准备 app 数据、执行 dex 优化；
  - prepareAppDataAfterInstallLIF() -> prepareAppData() -> prepareAppDataLeaf() -> Installer.createAppData() -> **Installd**.createAppData()：最终通过 IPC 操作跨进程调用到 init 进程启动的守护进程 Installd 中，后续不再分析；
  - performDexOpt()：执行 dex 优化；
- 回到 **PackageManagerService**.processInstallRequestsAsync()，继续往下调用 restoreAndPostInstall()；
- restoreAndPostInstall()：使用 handler 发送 POST_INSTALL 消息；
- handlePackagePostInstall()：处理 POST_INSTALL 消息，发送 ACTION_PACKAGE_ADDED 等广播，调用 notifyInstallObserver() -> PackageInstallObserver2.onPackageInstalled()，发送安装成功的通知；



apk 的安装原理其实就是把 apk 文件 copy 到对应的目录：

- 把 apk 拷贝到 */data/app/packagename/*，可以直接把 apk 拷贝出来点击安装，比如查看微信的 apk 文件：

  ``` shell
  $ adb shell pm list packages -f com.tencent.mm
  package:/data/app/~~upY4pffUA2R84QfD_Ce7UA==/com.tencent.mm-RrcnDRXvQ_Luk8HcYou__g==/base.apk=com.tencent.mm
  ```

- 开辟存放应用程序文件数据的目录 */data/data/packagename/(db, cache)*，包括应用的 so 库，缓存文件等待；

- 将 apk 中的 dex 文件安装到 */data/dalvik-cache* 目录下；



<font color=red>**待补充时序图**</font>

### 2.6 权限扫描

PKMS 的构造函数中会获取 SystemConfig 对象，在 SystemConfig 的构造函数中会调用 readAllPermissions() 从 */system/etc/permissions/*、*/system/etc/sysconfig* 中的各种 xml 文件进行扫描，把 xml 中的标签转换成对应的数据结构，供之后权限管理使用；



## 3 总结

### 3.1 构造函数总结

- 第一阶段：创建 mSettings 对象，读取 */data/system/packages.xml* 和 */data/system/packages-backup.xml*，并把解析结果存储到 mSettings 对象，代表上次启动时的应用包信息；

- 第二阶段：扫描 system/vendor/product 等目录下的 overlay/priv-app/app 目录的 apk（系统 app）；
- 第三阶段：扫描 */data/* 目录 apk（用户安装的 app）；
- 第四阶段：根据第二阶段、第三阶段扫描的结果更新 packages.xml；
- 第五阶段：GC 回收内存；

开机时间有很大一部分是耗费在这五个阶段，还有一大部分是耗费在随后的 dex 优化上；

### 3.2 APK 扫描总结

- 调用路径：
  - **PKMS**.scanDirTracedLI() -> ：被 PKMS 构造函数调用，<font color=blue>**开启扫描 apk**</font>起点；
  - scanDirLI() -> ：收集 apk，提交文件并行解析；
  - **ParallelPackageParser**.submit() -> ：提交文件并行解析
  - parsePackage() -> PackageParser2.parsePackage() -> ParsingPackageUtils.parsePackage() -> ：进行 apk 解析，区分传入的是目录还是 apk，最终都是调用到 ParsingPackageUtils.parseMonolithicPackage()；
  - **ParsingPackageUtils**.parseMonolithicPackage() -> ：解析给定的 apk 文件，具体调用 parseBaseApk() 去解析；
  - parseBaseApk()：
  - parseBaseApkTags()：<font color=blue>**解析 Manifest.xml**</font>；
    - parseBaseApkTag()：解析非 application 标签，比如 permission / uses-feature / attribution 等；
    - parseBaseApplication()：<font color=blue>**针对 application 标签进行全面解析**</font>，例如 activity / receiver / service / provider；
  - 返回最终解析结果给 ParsedPackage 对象，然后又回到 PKMS.scanDirLI()，调用 addForInitLI()；
  - commitReconciledScanResultLocked()：内部调用 commitPackageSettings()
  - commitPackageSettings()：<font color=blue>**包信息记录在了 PKMS 的属性中**</font>；
- 小结：对所有存在 apk 的目录进行扫描，解析所有 apk 的 AndroidManifest.xml，最后把包扫描结果提交到 PKMS 的各个属性中；

### 3.3 apk 安装总结

- PackageInstallerActivity 点击安装
- APK 用写入 Session 把包信息和 APK 安装操作都提交到了 PKMS；
- IPC 跨进程让 PKMS 执行 copy、扫描、解析；
- system_server 进程的 Installer IPC 跨进程到 Installd 进程（具有 root 权限，8.0 以前好像用的 socket 通信）准备用户目录 */data/user/* ，执行 dex 优化；
- 最后发送安装结果通知 UI 层；





[reference](https://cloud.tencent.com/developer/article/1900466)
