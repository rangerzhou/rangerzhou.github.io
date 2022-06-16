---
title: Android - APP 启动流程分析
date: 2021-11-05 20:52:15
tags:
categories: Android
copyright: true
password: zr.

---



> 想要优化 APP 的启动时间，必须要了解 APP 的启动流程，本文从 startActivity() 开始分析 APP 的启动流程；
>
> 

<!--more-->

# 1. 相关代码路径

| Layer     | Path                                                         |
| --------- | ------------------------------------------------------------ |
| framework | frameworks/base/core/java/android/app/Activity.java          |
|           | frameworks/base/core/java/android/app/Instrumentation.java   |
|           | frameworks/base/core/java/android/app/ActivityTaskManager.java |

# 2. APP 启动整体流程

点击 Launcher 中的 icon 可以启动 APP，APP 启动流程分为如下阶段：

- Launcher 通过 Binder 向 system_server 进程中的 ATMS 发起 startActivity 请求
- system_server 中的 AMS 通过 socket 向 zygote 发起创建进程请求
- zygote 进程 fork 出 app 子进程
- app 子进程通过 Binder 向 system_server 进程发起 attachApplication 请求
- system_server 进程通过 Binder 向 app 进程发送 scheduleLaunchActivity 请求
- app 进程的 binder 线程（ApplicationThread）收到请求后通过 Binder 向 app 主线程发送 LAUNCH_ACTIVITY 消息
- app 主线程收到 Message 后通过反射机制创建目标 Activity，并回调 Activity.onCreate() 等方法
- app 正式启动，进入 Activity 生命周期，执行 onCreate/onStart/onResume，UI 渲染结束进入 app 主界面

## 2.1 Launcher 通信 system_server - Binder

### 2.1.1 Activity

Launcher 中点击 icon 后最终会执行到 Activity.startActivity()，以此为入口分析 startActivity() 流程；

``` java
// Activity.java
    @Override
    public void startActivity(Intent intent) {
        this.startActivity(intent, null);
    }
    @Override
    public void startActivity(Intent intent, @Nullable Bundle options) {
        if (mIntent != null && mIntent.hasExtra(AutofillManager.EXTRA_RESTORE_SESSION_TOKEN)
                && mIntent.hasExtra(AutofillManager.EXTRA_RESTORE_CROSS_ACTIVITY)) {
            ...
        }
        if (options != null) {
            startActivityForResult(intent, -1, options);
        } else {
            startActivityForResult(intent, -1);
        }
    }
    public void startActivityForResult(@RequiresPermission Intent intent, int requestCode) {
        startActivityForResult(intent, requestCode, null);
    }
    public void startActivityForResult(@RequiresPermission Intent intent, int requestCode, @Nullable Bundle options) {
        ...
            Instrumentation.ActivityResult ar =
                mInstrumentation.execStartActivity(this, mMainThread.getApplicationThread(), mToken, this, intent, requestCode, options);
            if (ar != null) {
                mMainThread.sendActivityResult(mToken, mEmbeddedID, requestCode, ar.getResultCode(), ar.getResultData());
            ...
    }
```

有多种启动 activity 的方法，但是最终都是调用 mInstrumentation.execStartActivity()。

### 2.1.2 Instrumentation

``` java
// Instrumentation.java
public ActivityResult execStartActivity(
            Context who, IBinder contextThread, IBinder token, Activity target,
            Intent intent, int requestCode, Bundle options) {
        ...
        try {
            intent.migrateExtraStreamToClipData(who);
            intent.prepareToLeaveProcess(who);
            int result = ActivityTaskManager.getService().startActivity(whoThread,
                    who.getOpPackageName(), who.getAttributionTag(), intent,
                    intent.resolveTypeIfNeeded(who.getContentResolver()), token,
                    target != null ? target.mEmbeddedID : null, requestCode, 0, null, options);
        ...
    }
```

获取 ATMS，并执行其中的 startActivity()

### 2.1.3 ActivityTaskManager

``` java
// ActivityTaskManager.java
	public static IActivityTaskManager getService() {
        return IActivityTaskManagerSingleton.get();
    }

    @UnsupportedAppUsage(trackingBug = 129726065)
    private static final Singleton<IActivityTaskManager> IActivityTaskManagerSingleton =
            new Singleton<IActivityTaskManager>() {
                @Override
                protected IActivityTaskManager create() {
                    final IBinder b = ServiceManager.getService(Context.ACTIVITY_TASK_SERVICE);
                    return IActivityTaskManager.Stub.asInterface(b);
                }
            };
```

getService() 返回的是 `IActivityTaskManager.Stub.asInterface(b);`，这是一个远程调用模式，是 AIDL 生成的 IActivityTaskManager.java 中的 stub 类中的 asInterface() 方法，先通过 ACTIVITY_TASK_SERVICE 获取 ATMS 的 IBinder 对象 b，再通过 asInterface(b) 获取 ATMS 的代理对象，接下来进入 ATMS 中；



## 2.2 ATMS

### 2.2.1 ActivityTaskManagerService

``` java
// ActivityTaskManagerService.java
    public final int startActivity(IApplicationThread caller, String callingPackage,
            String callingFeatureId, Intent intent, String resolvedType, IBinder resultTo,
            String resultWho, int requestCode, int startFlags, ProfilerInfo profilerInfo,
            Bundle bOptions) {
        return startActivityAsUser(caller, callingPackage, callingFeatureId, intent, resolvedType,
                resultTo, resultWho, requestCode, startFlags, profilerInfo, bOptions,
                UserHandle.getCallingUserId());
    }
    public int startActivityAsUser(IApplicationThread caller, String callingPackage,
            String callingFeatureId, Intent intent, String resolvedType, IBinder resultTo,
            String resultWho, int requestCode, int startFlags, ProfilerInfo profilerInfo,
            Bundle bOptions, int userId) {
        return startActivityAsUser(caller, callingPackage, callingFeatureId, intent, resolvedType,
                resultTo, resultWho, requestCode, startFlags, profilerInfo, bOptions, userId,
                true /*validateIncomingUser*/);
    }
    private int startActivityAsUser(IApplicationThread caller, String callingPackage,
            @Nullable String callingFeatureId, Intent intent, String resolvedType,
            IBinder resultTo, String resultWho, int requestCode, int startFlags,
            ProfilerInfo profilerInfo, Bundle bOptions, int userId, boolean validateIncomingUser) {
        ...
        // TODO: Switch to user app stacks here.
        return getActivityStartController().obtainStarter(intent, "startActivityAsUser")
                .setCaller(caller)
                .setCallingPackage(callingPackage)
                .setCallingFeatureId(callingFeatureId)
                .setResolvedType(resolvedType)
                .setResultTo(resultTo)
                .setResultWho(resultWho)
                .setRequestCode(requestCode)
                .setStartFlags(startFlags)
                .setProfilerInfo(profilerInfo)
                .setActivityOptions(bOptions)
                .setUserId(userId)
                .execute();

    }
```

通过 obtailStarter() 获取 ActivityStarter 对象并设置一些参数，最终调用到 ActivityStarter.execute()

### 2.2.2 ActivityStarter

``` java
// ActivityStarter.java
int execute() {
        try {
            ...
                res = resolveToHeavyWeightSwitcherIfNeeded();
                if (res != START_SUCCESS) {
                    return res;
                }
                res = executeRequest(mRequest);
                ...
```

根据前面提供的请求参数解析必要的信息，

``` java
// ActivityStarter.java
	private int executeRequest(Request request) {
        ...
        final ActivityRecord r = new ActivityRecord.Builder(mService)
                ...      
        mLastStartActivityResult = startActivityUnchecked(r, sourceRecord, voiceSession,
                request.voiceInteractor, startFlags, true /* doResume */, checkedOptions,
                inTask, inTaskFragment, restrictedBgActivity, intentGrants);
        ...
        return mLastStartActivityResult;
    }
```



``` java
// ActiviyStarter.java
	private int startActivityUnchecked(final ActivityRecord r, ActivityRecord sourceRecord,
            IVoiceInteractionSession voiceSession, IVoiceInteractor voiceInteractor,
            int startFlags, boolean doResume, ActivityOptions options, Task inTask,
            TaskFragment inTaskFragment, boolean restrictedBgActivity,
            NeededUriGrants intentGrants) {
        ...
            result = startActivityInner(r, sourceRecord, voiceSession, voiceInteractor,
                    startFlags, doResume, options, inTask, inTaskFragment, restrictedBgActivity,
                    intentGrants);
            ...
        return result;
    }
```



``` java
// ActivityStarter.java
	int startActivityInner(final ActivityRecord r, ActivityRecord sourceRecord,
            IVoiceInteractionSession voiceSession, IVoiceInteractor voiceInteractor,
            int startFlags, boolean doResume, ActivityOptions options, Task inTask,
            TaskFragment inTaskFragment, boolean restrictedBgActivity,
            NeededUriGrants intentGrants) {
        ...
        mTargetRootTask.startActivityLocked(mStartActivity,
                topRootTask != null ? topRootTask.getTopNonFinishingActivity() : null, newTask,
                isTaskSwitch, mOptions, sourceRecord);
            ...
                mRootWindowContainer.resumeFocusedTasksTopActivities(
                        mTargetRootTask, mStartActivity, mOptions, mTransientLaunch);
            }
        }
        ...
        return START_SUCCESS;
    }
```

startActivityLocked()：判断当前 activity 是否可见以及是否需要为其新建 Task，根据不同情况将 ActivityRecord 加入到对应的 Task 栈顶中；

resumeFocusedTasksTopActivities()：将所有聚焦的 Task 的所有 Activity 恢复运行，因为有些刚加入的 Activity 是处于暂停状态的，判断传入的 targetRootTask 是否等于当前栈顶的 Task，不管是否相等，后续都是调用栈顶 Task 的 **resumeTopActivityUncheckedLocked()** 方法；

``` java
// RootWindowContainer.java
	boolean resumeFocusedTasksTopActivities(
            Task targetRootTask, ActivityRecord target, ActivityOptions targetOptions,
            boolean deferPause) {
        ...
                final Task focusedRoot = display.getFocusedRootTask();
                if (focusedRoot != null) {
                    result |= focusedRoot.resumeTopActivityUncheckedLocked(target, targetOptions);
                } else if (targetRootTask == null) {
                    ...
        return result;
    }
```



``` java
// Task.java
	boolean resumeTopActivityUncheckedLocked(ActivityRecord prev, ActivityOptions options) {
        return resumeTopActivityUncheckedLocked(prev, options, false /* skipPause */);
    }
    boolean resumeTopActivityUncheckedLocked(ActivityRecord prev, ActivityOptions options,
            boolean deferPause) {
        ...
        boolean someActivityResumed = false;
        try {
            // Protect against recursion.
            mInResumeTopActivity = true;

            if (isLeafTask()) {
                if (isFocusableAndVisible()) {
                    someActivityResumed = resumeTopActivityInnerLocked(prev, options, deferPause);
                }
            ...
        return someActivityResumed;
    }
```



``` java
// Task.java
	private boolean resumeTopActivityInnerLocked(ActivityRecord prev, ActivityOptions options,
            boolean deferPause) {
        ...
        final boolean[] resumed = new boolean[1];
        final TaskFragment topFragment = topActivity.getTaskFragment();
        resumed[0] = topFragment.resumeTopActivity(prev, options, deferPause);
        ...
    }
```



``` java
// TaskFragment.java    
	final boolean resumeTopActivity(ActivityRecord prev, ActivityOptions options,
            boolean deferPause) {
        ...
        // 将发起者置为 pause 状态，也就是 mainactivity 置为 onPause 状态
        boolean pausing = !deferPause && taskDisplayArea.pauseBackTasks(next);
        ...
        if (next.attachedToProcess()) { // Activity 已经附加到进程，恢复页面并更新栈
			...
        } else {
            ...
            mTaskSupervisor.startSpecificActivity(next, true, true); 
        }
```

判断当前(栈顶) Activity 是否与已有的进程关联，如果已经关联，就在该进程中恢复页面，否则就需要在 startSpecificActivity() 重新启动目标 Activity，

``` java
// ActivityTaskSupervisor.java
    void startSpecificActivity(ActivityRecord r, boolean andResume, boolean checkConfig) {
        // Is this activity's application already running?
        final WindowProcessController wpc =
                mService.getProcessController(r.processName, r.info.applicationInfo.uid);

        boolean knownToBeDead = false;
        if (wpc != null && wpc.hasThread()) {
            try {
                realStartActivityLocked(r, wpc, andResume, checkConfig); // 1
                return;
            ...
        final boolean isTop = andResume && r.isTopRunningActivity();
        mService.startProcessAsync(r, knownToBeDead, isTop, isTop ? "top-activity" : "activity"); // 2
    }
```

首先判断待启动的 activity 所在的 application 是否在运行，如果已经运行就直接启动，否则启动新进程

### realStartActivityLocked()

``` java
// ActivityTaskSupervisor.java
	boolean realStartActivityLocked(ActivityRecord r, WindowProcessController proc,
            boolean andResume, boolean checkConfig) throws RemoteException {
        ...
                // Create activity launch transaction.
                final ClientTransaction clientTransaction = ClientTransaction.obtain(
                        proc.getThread(), r.appToken);
                ...
                // Set desired final state.
                final ActivityLifecycleItem lifecycleItem;
                if (andResume) {
                    lifecycleItem = ResumeActivityItem.obtain(isTransitionForward);
                } else {
                    lifecycleItem = PauseActivityItem.obtain();
                }
                // 用于指定事务执行完后客户端应该处于的最终状态，理解为发送给客户端的请求
                clientTransaction.setLifecycleStateRequest(lifecycleItem);

                // Schedule transaction.
                mService.getLifecycleManager().scheduleTransaction(clientTransaction);
                ...
        return true;
    }
```



``` java
// ClientLifecycleManager.java
    void scheduleTransaction(ClientTransaction transaction) throws RemoteException {
        final IApplicationThread client = transaction.getClient();
        transaction.schedule();
        ...
    }
```



``` java
// CLientTransaction.java
    private IApplicationThread mClient;
    public void schedule() throws RemoteException {
        mClient.scheduleTransaction(this);
    }
```

mCLient 是 IApplicationThread 对象，IApplicationThread 是一个 AIDL 接口，所以会调用到服务端的 scheduleTransaction() 中，此时我们实在 system_server 进程，所以对应的服务端就是 app 所在的客户端，对应的实现在 ActivityThread 中

``` java
// ActivityThread.java
        public void scheduleTransaction(ClientTransaction transaction) throws RemoteException {
            ActivityThread.this.scheduleTransaction(transaction);
        }
```

ActivityThread.java 继承了 ClientTransactionHandler，

``` java
// ClientTransactionHandler.java
	void scheduleTransaction(ClientTransaction transaction) {
        transaction.preExecute(this);
        sendMessage(ActivityThread.H.EXECUTE_TRANSACTION, transaction);
    }
    abstract void sendMessage(int what, Object obj);
```



``` java
// ClientTransaction.java
	public void preExecute(android.app.ClientTransactionHandler clientTransactionHandler) {
        if (mActivityCallbacks != null) {
            final int size = mActivityCallbacks.size();
            for (int i = 0; i < size; ++i) {
                mActivityCallbacks.get(i).preExecute(clientTransactionHandler, mActivityToken);
            }
        }
        if (mLifecycleStateRequest != null) {
            mLifecycleStateRequest.preExecute(clientTransactionHandler, mActivityToken);
        }
    }
```



``` java
// ActivityThread.java
    final H mH = new H();
    void sendMessage(int what, Object obj) {
        sendMessage(what, obj, 0, 0, false);
    }
    private void sendMessage(int what, Object obj, int arg1, int arg2, boolean async) {
        if (DEBUG_MESSAGES) {
            Slog.v(TAG,
                    "SCHEDULE " + what + " " + mH.codeToString(what) + ": " + arg1 + " / " + obj);
        }
        Message msg = Message.obtain();
        msg.what = what;
        msg.obj = obj;
        msg.arg1 = arg1;
        msg.arg2 = arg2;
        if (async) {
            msg.setAsynchronous(true);
        }
        mH.sendMessage(msg);
    }
```

mH 是 H 类，

``` java
// ActivityThread.java
        public void handleMessage(Message msg) {
            if (DEBUG_MESSAGES) Slog.v(TAG, ">>> handling: " + codeToString(msg.what));
            switch (msg.what) {
                case EXECUTE_TRANSACTION:
                    final ClientTransaction transaction = (ClientTransaction) msg.obj;
                    mTransactionExecutor.execute(transaction);
                    if (isSystem()) {
                        // Client transactions inside system process are recycled on the client side
                        // instead of ClientLifecycleManager to avoid being cleared before this
                        // message is handled.
                        transaction.recycle();
                    }
                    // TODO(lifecycler): Recycle locally scheduled transactions.
                    break;
```



``` java
// TransactionExecutor.java
	public void execute(ClientTransaction transaction) {
        if (DEBUG_RESOLVER) Slog.d(TAG, tId(transaction) + "Start resolving transaction");

        final IBinder token = transaction.getActivityToken();
        ...
        executeCallbacks(transaction);

        executeLifecycleState(transaction);
        mPendingActions.clear();
        if (DEBUG_RESOLVER) Slog.d(TAG, tId(transaction) + "End resolving transaction");
    }
```



``` java
// TransactionExecutor.java
	public void executeCallbacks(ClientTransaction transaction) {
        final List<ClientTransactionItem> callbacks = transaction.getCallbacks();
        ...      
        final int size = callbacks.size();
        for (int i = 0; i < size; ++i) {
            ...
            if (postExecutionState != UNDEFINED && r != null) {
                // Skip the very last transition and perform it by explicit state request instead.
                final boolean shouldExcludeLastTransition =
                        i == lastCallbackRequestingState && finalState == postExecutionState;
                cycleToPath(r, postExecutionState, shouldExcludeLastTransition, transaction);
            }
        }
    }
```



``` java
// TransactionExecutor.java
	private void cycleToPath(ActivityClientRecord r, int finish, boolean excludeLastState,
            ClientTransaction transaction) {
        final int start = r.getLifecycleState();
        ...
        final IntArray path = mHelper.getLifecyclePath(start, finish, excludeLastState);
        performLifecycleSequence(r, path, transaction);
    }
```



``` java
// TransactionExecutor.java
    private void performLifecycleSequence(ActivityClientRecord r, IntArray path,
            ClientTransaction transaction) {
        ...
            switch (state) {
                case ON_CREATE:
                    mTransactionHandler.handleLaunchActivity(r, mPendingActions,
                            null /* customIntent */);
                    break;
```



``` java
// ActivityThread.java
    public Activity handleLaunchActivity(ActivityClientRecord r,
            PendingTransactionActions pendingActions, Intent customIntent) {
        ...
        final Activity a = performLaunchActivity(r, customIntent);
```



``` java
// ActivityThread.java
    private Activity performLaunchActivity(ActivityClientRecord r, Intent customIntent) {
        ...
                r.activity = activity;
                if (r.isPersistable()) {
                    mInstrumentation.callActivityOnCreate(activity, r.state, r.persistentState);
                } else {
                    mInstrumentation.callActivityOnCreate(activity, r.state);
                }
```



``` java
// Instrumentation.java
    public void callActivityOnCreate(Activity activity, Bundle icicle) {
        prePerformCreate(activity);
        activity.performCreate(icicle); // 进入 Activity 内部
        postPerformCreate(activity);
    }
// Activity.java
    final void performCreate(Bundle icicle) {
        performCreate(icicle, null);
    }
    final void performCreate(Bundle icicle, PersistableBundle persistentState) {
        ...
        if (persistentState != null) {
            onCreate(icicle, persistentState);
        } else {
            onCreate(icicle);
        }
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        ...
```

最终调用到 onCreate() 方法，开始执行 APP 的代码，app 进程已启动的情况流程完结，startActivity() 成功，接下来看 app 进程未启动的情况。











### startProcessAsync()

``` java
// ActivityTaskManagerService.java
	void startProcessAsync(ActivityRecord activity, boolean knownToBeDead, boolean isTop,
            String hostingType) {
        try {
            if (Trace.isTagEnabled(TRACE_TAG_WINDOW_MANAGER)) {
                Trace.traceBegin(TRACE_TAG_WINDOW_MANAGER, "dispatchingStartProcess:"
                        + activity.processName);
            }
            // 发布消息以启动进程，以避免在持有 ATMS 锁的情况下调用 AMS 可能出现死锁
            final Message m = PooledLambda.obtainMessage(ActivityManagerInternal::startProcess,
                    mAmInternal, activity.processName, activity.info.applicationInfo, knownToBeDead,
                    isTop, hostingType, activity.intent.getComponent());
            mH.sendMessage(m);
        } finally {
            Trace.traceEnd(TRACE_TAG_WINDOW_MANAGER);
        }
    }
```

进入 ActivityManagerInternal::startProcess()

``` java
// ActivityManagerInternal.java
public abstract class ActivityManagerInternal {
    public abstract void startProcess(String processName, ApplicationInfo info,
            boolean knownToBeDead, boolean isTop, String hostingType, ComponentName hostingName);
```

是个抽象类，AMS.LocalService 继承了它，

``` java
// ActivityManagerService.java
	public final class LocalService extends ActivityManagerInternal
            implements ActivityManagerLocal {
        ...
        public void startProcess(String processName, ApplicationInfo info, boolean knownToBeDead,
                boolean isTop, String hostingType, ComponentName hostingName) {
            ...
                synchronized (ActivityManagerService.this) {
                    // 如果该进程被称为 top app，则设置一个提示，以便在该进程启动时，可以立即申请最高优先级，
                    // 以避免在附加 top app 的进程之前，cpu 被其他进程抢占
                    startProcessLocked(processName, info, knownToBeDead, 0 /* intentFlags */,
                            new HostingRecord(hostingType, hostingName, isTop),
                            ZYGOTE_POLICY_FLAG_LATENCY_SENSITIVE, false /* allowWhileBooting */,
                            false /* isolated */);
                ...
```



``` java
// ActivityManagerService.java
	final ProcessRecord startProcessLocked(String processName,
            ApplicationInfo info, boolean knownToBeDead, int intentFlags,
            HostingRecord hostingRecord, int zygotePolicyFlags, boolean allowWhileBooting,
            boolean isolated) {
        return mProcessList.startProcessLocked(processName, info, knownToBeDead, intentFlags,
                hostingRecord, zygotePolicyFlags, allowWhileBooting, isolated, 0 /* isolatedUid */,
                null /* ABI override */, null /* entryPoint */,
                null /* entryPointArgs */, null /* crashHandler */);
    }
```



``` java
// ProcessList.java
	ProcessRecord startProcessLocked(String processName, ApplicationInfo info,
            boolean knownToBeDead, int intentFlags, HostingRecord hostingRecord,
            int zygotePolicyFlags, boolean allowWhileBooting, boolean isolated, int isolatedUid,
            String abiOverride, String entryPoint, String[] entryPointArgs, Runnable crashHandler) {
        long startTime = SystemClock.uptimeMillis();
        ProcessRecord app;
        ...
        final boolean success =
                startProcessLocked(app, hostingRecord, zygotePolicyFlags, abiOverride);
        checkSlow(startTime, "startProcess: done starting proc!");
        return success ? app : null;
    }

    boolean startProcessLocked(ProcessRecord app, HostingRecord hostingRecord,
            int zygotePolicyFlags, String abiOverride) {
        return startProcessLocked(app, hostingRecord, zygotePolicyFlags,
                false /* disableHiddenApiChecks */, false /* disableTestApiChecks */,
                abiOverride);
    }

    boolean startProcessLocked(ProcessRecord app, HostingRecord hostingRecord,
            int zygotePolicyFlags, boolean disableHiddenApiChecks, boolean disableTestApiChecks,
            String abiOverride) {
        if (app.isPendingStart()) {
            return true;
        }
        long startTime = SystemClock.uptimeMillis(); // 记录启动时间
        ...
            return startProcessLocked(hostingRecord, entryPoint, app, uid, gids,
                    runtimeFlags, zygotePolicyFlags, mountExternal, seInfo, requiredAbi,
                    instructionSet, invokeWith, startTime);
        ...
    }

    boolean startProcessLocked(HostingRecord hostingRecord, String entryPoint, ProcessRecord app,
            int uid, int[] gids, int runtimeFlags, int zygotePolicyFlags, int mountExternal,
            String seInfo, String requiredAbi, String instructionSet, String invokeWith,
            long startTime) {
        ...
            try {
                final Process.ProcessStartResult startResult = startProcess(...);
                handleProcessStartedLocked(app, startResult.pid, startResult.usingWrapper,
                        startSeq, false);
            ...
```



``` java
    private Process.ProcessStartResult startProcess(HostingRecord hostingRecord, String entryPoint,
            ProcessRecord app, int uid, int[] gids, int runtimeFlags, int zygotePolicyFlags,
            int mountExternal, String seInfo, String requiredAbi, String instructionSet,
            String invokeWith, long startTime) {
        try {
            ...
            } else if (hostingRecord.usesAppZygote()) {
                final AppZygote appZygote = createAppZygoteForProcessIfNeeded(app);

                // We can't isolate app data and storage data as parent zygote already did that.
                startResult = appZygote.getProcess().start(...);
            } else {
                regularZygote = true;
                startResult = Process.start(...);
            }
            ...
```

最终都是调用到 Process.start() 方法

``` java
// Process.java
    public static final ZygoteProcess ZYGOTE_PROCESS = new ZygoteProcess();
    public static ProcessStartResult start(...) {
        return ZYGOTE_PROCESS.start(processClass, niceName, uid, gid, gids,
                    runtimeFlags, mountExternal, targetSdkVersion, seInfo,
                    abi, instructionSet, appDataDir, invokeWith, packageName,
                    zygotePolicyFlags, isTopApp, disabledCompatChanges,
                    pkgDataInfoMap, whitelistedDataInfoMap, bindMountAppsData,
                    bindMountAppStorageDirs, zygoteArgs);
    }
```

调用 ZygoteProcess.start()

``` java
// ZygoteProcess.java
	public final Process.ProcessStartResult start(...) {
        ...
            return startViaZygote(processClass, niceName, uid, gid, gids,
                    runtimeFlags, mountExternal, targetSdkVersion, seInfo,
                    abi, instructionSet, appDataDir, invokeWith, /*startChildZygote=*/ false,
                    packageName, zygotePolicyFlags, isTopApp, disabledCompatChanges,
                    pkgDataInfoMap, allowlistedDataInfoList, bindMountAppsData,
                    bindMountAppStorageDirs, zygoteArgs);
        ...
```



``` java
// ZygoteProcess.java
    private Process.ProcessStartResult startViaZygote(...)
        ...
        argsForZygote.add("--runtime-args");
        argsForZygote.add("--setuid=" + uid);
        argsForZygote.add("--setgid=" + gid);
        argsForZygote.add("--runtime-flags=" + runtimeFlags);
        if (mountExternal == Zygote.MOUNT_EXTERNAL_DEFAULT) {
            argsForZygote.add("--mount-external-default");
        } else if (mountExternal == Zygote.MOUNT_EXTERNAL_INSTALLER) {
            argsForZygote.add("--mount-external-installer");
        } else if (mountExternal == Zygote.MOUNT_EXTERNAL_PASS_THROUGH) {
            argsForZygote.add("--mount-external-pass-through");
        } else if (mountExternal == Zygote.MOUNT_EXTERNAL_ANDROID_WRITABLE) {
            argsForZygote.add("--mount-external-android-writable");
        }
		...
        argsForZygote.add("--target-sdk-version=" + targetSdkVersion);
        synchronized(mLock) {
            // The USAP pool can not be used if the application will not use the systems graphics
            // driver.  If that driver is requested use the Zygote application start path.
            return zygoteSendArgsAndGetResult(openZygoteSocketIfNeeded(abi)/*尝试打开 socket*/,
                                              zygotePolicyFlags,
                                              argsForZygote);
        }
    }
```



``` java
// ZygoteProcess.java
    private ZygoteState openZygoteSocketIfNeeded(String abi) throws ZygoteStartFailedEx {
        try {
            attemptConnectionToPrimaryZygote();

            if (primaryZygoteState.matches(abi)) {
                return primaryZygoteState;
            }

            if (mZygoteSecondarySocketAddress != null) {
                // The primary zygote didn't match. Try the secondary.
                attemptConnectionToSecondaryZygote();

                if (secondaryZygoteState.matches(abi)) {
                    return secondaryZygoteState;
                }
            }
        } catch (IOException ioe) {
            throw new ZygoteStartFailedEx("Error connecting to zygote", ioe);
        }

        throw new ZygoteStartFailedEx("Unsupported zygote ABI: " + abi);
    }
```





``` java
// ZygoteProcess.java
	private Process.ProcessStartResult zygoteSendArgsAndGetResult(
            ZygoteState zygoteState, int zygotePolicyFlags, @NonNull ArrayList<String> args)
            throws ZygoteStartFailedEx {
        ...
        String msgStr = args.size() + "\n" + String.join("\n", args) + "\n";
        ...
        return attemptZygoteSendArgsAndGetResult(zygoteState, msgStr);
    }
```

ZygoteState 是用于与 Zygote 通信的状态，

``` java
// ZygoteProcess.java 这是一个阻塞函数
	private Process.ProcessStartResult attemptZygoteSendArgsAndGetResult(
            ZygoteState zygoteState, String msgStr) throws ZygoteStartFailedEx {
        try {
            final BufferedWriter zygoteWriter = zygoteState.mZygoteOutputWriter;
            final DataInputStream zygoteInputStream = zygoteState.mZygoteInputStream;
			// socket 通信
            zygoteWriter.write(msgStr); // 写
            zygoteWriter.flush();

            // Always read the entire result from the input stream to avoid leaving
            // bytes in the stream for future process starts to accidentally stumble
            // upon.
            Process.ProcessStartResult result = new Process.ProcessStartResult();
            result.pid = zygoteInputStream.readInt(); // 读
            result.usingWrapper = zygoteInputStream.readBoolean();

            if (result.pid < 0) {
                throw new ZygoteStartFailedEx("fork() failed");
            }

            return result;
        } catch (IOException ex) {
            zygoteState.close();
            Log.e(LOG_TAG, "IO Exception while communicating with Zygote - "
                    + ex.toString());
            throw new ZygoteStartFailedEx(ex);
        }
    }
```



接下来进入 zygote

``` java

    Runnable runSelectLoop(String abiList) {
        ArrayList<FileDescriptor> socketFDs = new ArrayList<>();
        ArrayList<ZygoteConnection> peers = new ArrayList<>();

        socketFDs.add(mZygoteSocket.getFileDescriptor());
        peers.add(null);
        while (true) {
            ...
                        try {
                            ZygoteConnection connection = peers.get(pollIndex);
                            boolean multipleForksOK = !isUsapPoolEnabled()
                                    && ZygoteHooks.isIndefiniteThreadSuspensionSafe();
                            final Runnable command =
                                    connection.processCommand(this, multipleForksOK);
```











https://juejin.cn/post/7018015055108702221#heading-46
