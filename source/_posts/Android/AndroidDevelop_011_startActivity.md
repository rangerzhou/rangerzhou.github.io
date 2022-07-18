---
title: Android - APP 启动流程分析
date: 2021-11-05 20:52:15
tags:
categories: Android
copyright: true
password:

---



> APP 启动流程涉及到进程的创建、进程间通信、Socket 通信、Handler 线程通信，作为系统工程师了解 APP 的启动流程很有必要，本文从 startActivity() 开始分析 APP 的启动流程，代码基于 android-12.1.0_r4；
>

<!--more-->

## 1. 相关代码路径

| Layer     | Path                                                         |
| --------- | ------------------------------------------------------------ |
| framework | frameworks/base/core/java/android/app/Activity.java          |
|           | frameworks/base/core/java/android/app/Instrumentation.java   |
|           | frameworks/base/core/java/android/app/ActivityTaskManager.java |
|           | frameworks/base/services/core/java/com/android/server/wm/ActivityTaskManagerService.java |
|           | frameworks/base/services/core/java/com/android/server/am/ActivityManagerService.java |
|           | frameworks/base/services/core/java/com/android/server/wm/ActivityStarter.java |
|           | frameworks/base/services/core/java/com/android/server/wm/RootWindowContainer.java |
|           | frameworks/base/services/core/java/com/android/server/wm/Task.java |
|           | frameworks/base/services/core/java/com/android/server/wm/TaskFragment.java |
|           | frameworks/base/services/core/java/com/android/server/wm/ActivityTaskSupervisor.java |
|           | frameworks/base/services/core/java/com/android/server/wm/ClientLifecycleManager.java |
|           | frameworks/base/core/java/android/app/servertransaction/ClientTransaction.java |
|           | frameworks/base/core/java/android/app/ActivityThread.java    |
|           | frameworks/base/core/java/android/app/ClientTransactionHandler.java |
|           | frameworks/base/core/java/android/app/servertransaction/TransactionExecutor.java |
|           | frameworks/base/core/java/android/app/servertransaction/LaunchActivityItem.java |
|           | frameworks/base/core/java/android/app/AppComponentFactory.java |
|           | frameworks/base/services/core/java/com/android/server/am/ProcessList.java |
|           | frameworks/base/core/java/android/os/Process.java            |
|           | frameworks/base/core/java/android/os/ZygoteProcess.java      |
|           | frameworks/base/core/java/com/android/internal/os/ZygoteServer.java |
|           | frameworks/base/core/java/com/android/internal/os/ZygoteConnection.java |
|           | frameworks/base/core/java/com/android/internal/os/Zygote.java |
|           | frameworks/base/core/java/com/android/internal/os/ZygoteInit.java |
|           | frameworks/base/core/java/com/android/internal/os/RuntimeInit.java |
|           | frameworks/base/services/core/java/com/android/server/wm/RootWindowContainer.java |
|           | frameworks/base/core/jni/com_android_internal_os_Zygote.cpp  |


## 2. Launcher 向 system_server 发起请求(Binder)

### 2.1 Activity

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
            startActivityForResult(intent, -1); // -1 表示 Launcher 不需要知道 Activity 启动的结果
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

有多种启动 activity 的方法，但是最终都是调用 mInstrumentation.execStartActivity()，Instrumentation 主要用来监控应用程序和系统的交互。

### 2.2 Instrumentation

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

### 2.3 ActivityTaskManager

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



## 3. system_server 进程请求 Zygote 创建新进程(Socket)

### 3.1 ActivityTaskManagerService

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

### 3.2 ActivityStarter

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

## 4. App 进程已存在

### 4.1 ATS.realStartActivityLocked()

``` java
// ActivityTaskSupervisor.java
	boolean realStartActivityLocked(ActivityRecord r, WindowProcessController proc,
            boolean andResume, boolean checkConfig) throws RemoteException {
        ...
                // 创建 Activity 启动事务
                final ClientTransaction clientTransaction = ClientTransaction.obtain(
                        proc.getThread(), r.appToken);
                ...
                clientTransaction.addCallback(...); // 这里会给客户端用于创建 activity
                // Set desired final state.
                final ActivityLifecycleItem lifecycleItem; // 设置所需的最终状态
                if (andResume) { // 这里创建的是 ResumeActivityItem
                    lifecycleItem = ResumeActivityItem.obtain(isTransitionForward);
                } else {
                    lifecycleItem = PauseActivityItem.obtain();
                }
                // 用于指定事务执行完后客户端应该处于的最终状态，理解为发送给客户端的请求
                clientTransaction.setLifecycleStateRequest(lifecycleItem);

                // 调度一个事务
                mService.getLifecycleManager().scheduleTransaction(clientTransaction);
                ...
        return true;
    }
```

### 4.2 CLM.scheduleTransaction()

``` java
// ClientLifecycleManager.java
    void scheduleTransaction(ClientTransaction transaction) throws RemoteException {
        final IApplicationThread client = transaction.getClient();
        transaction.schedule();
        ...
    }
```

最终 ClientLifecycleManager 把创建 activity 事务提交给了客户端的 ApplicationThread 类。

### 4.3 ClientTransaction.schedule()[Binder]

``` java
// CLientTransaction.java
    private IApplicationThread mClient;
    public void schedule() throws RemoteException {
        mClient.scheduleTransaction(this);
    }
```

mCLient 是 IApplicationThread 对象，IApplicationThread 是一个 AIDL 接口，ApplicationThread 继承 IApplicationThread.Stub，所以会调用到服务端 ApplicationThread 的 scheduleTransaction() 中，此时我们是在 system_server 进程，所以对应的服务端就是 app 进程， 实现在 ActivityThread.ApplicationThread 中：

### 4.4 APP Binder 线程向主线程发送 EXECUTE_TRANSACTION[Handler]

``` java
// ActivityThread.java
        public void scheduleTransaction(ClientTransaction transaction) throws RemoteException {
            ActivityThread.this.scheduleTransaction(transaction);
        }
```

ActivityThread 继承 ClientTransactionHandler，最后对应的实现在 ClientTransactionHandler 中；

``` java
// ClientTransactionHandler.java
	void scheduleTransaction(ClientTransaction transaction) {
        transaction.preExecute(this);
        sendMessage(ActivityThread.H.EXECUTE_TRANSACTION, transaction);
    }
    abstract void sendMessage(int what, Object obj);
```

通过 handler 发送 EXECUTE_TRANSACTION 消息

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

mH 是 H 类，调用 ActivityThread.handleMessage() 处理；

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

### 4.5 TransactionExecutor

``` java
// TransactionExecutor.java
	public void execute(ClientTransaction transaction) {
        if (DEBUG_RESOLVER) Slog.d(TAG, tId(transaction) + "Start resolving transaction");

        final IBinder token = transaction.getActivityToken();
        ...
        // 该方法中通过遍历 transaction#callbacks 获取到 LaunchActivityItem，然后调用 onCreate 方法
        executeCallbacks(transaction);
		// 将请求的事务转为最终的生命周期
        executeLifecycleState(transaction);
        mPendingActions.clear();
        if (DEBUG_RESOLVER) Slog.d(TAG, tId(transaction) + "End resolving transaction");
    }
```

**executeCallbacks**

``` java
// TransactionExecutor.java
	public void executeCallbacks(ClientTransaction transaction) {
        final List<ClientTransactionItem> callbacks = transaction.getCallbacks();
        ...      
        final int size = callbacks.size();
        for (int i = 0; i < size; ++i) { // 遍历 ClientTransactionItem
            // 执行具体动作
            item.execute(mTransactionHandler, token, mPendingActions);
            item.postExecute(mTransactionHandler, token, mPendingActions);
            ...
        }
    }
```

在服务端提交事务的时候，通过 `clientTransaction.addCallback`方式将 LaunchActivityItem 添加到 mActivityCallbacks 里面，所以通过遍历  transaction#callbacks 获取到 LaunchActivityItem，然后调用 execute 方法。

**executeLifecycleState**

``` java
// TransactionExecutor.java
	private void executeLifecycleState(ClientTransaction transaction) {
        final ActivityLifecycleItem lifecycleItem = transaction.getLifecycleStateRequest();
        ...
        final IBinder token = transaction.getActivityToken();
        final ActivityClientRecord r = mTransactionHandler.getActivityClient(token); // 通过token获取到对应的 activityRecord
        ...
        // Cycle to the state right before the final requested state.
        // 循环到最终请求状态之前的状态
        cycleToPath(r, lifecycleItem.getTargetState(), true /* excludeLastState */, transaction);

        // Execute the final transition with proper parameters.
        // 使用适当的参数执行最终转换
        lifecycleItem.execute(mTransactionHandler, token, mPendingActions);
        lifecycleItem.postExecute(mTransactionHandler, token, mPendingActions);
    }
```

也是调用到 lifecycleItem.execute()

``` java
// LaunchActivityItem.java
    public void execute(ClientTransactionHandler client, IBinder token,
            PendingTransactionActions pendingActions) {
        Trace.traceBegin(TRACE_TAG_ACTIVITY_MANAGER, "activityStart");
        ActivityClientRecord r = client.getLaunchingActivity(token);
        client.handleLaunchActivity(r, pendingActions, null /* customIntent */);
        Trace.traceEnd(TRACE_TAG_ACTIVITY_MANAGER);
    }
```

回到 ActivityThread.handleLaunchActivity()

``` java
// TransactionExecutor.java
	private void cycleToPath(ActivityClientRecord r, int finish, boolean excludeLastState,
            ClientTransaction transaction) {
        final int start = r.getLifecycleState();
        // 计算活动的主要生命周期状态的路径，并使用从初始状态之后的状态开始的值填充
        // 比如 onStart,onStop 周期就是在这里额外加入的
        final IntArray path = mHelper.getLifecyclePath(start, finish, excludeLastState);
        performLifecycleSequence(r, path, transaction);
    }
```

循环到最终请求状态之前的状态，拿到 lifeCyclePath 后就交给了 performLifecycleSequence()

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

回到 ActivityThread.handleLaunchActivity()

### 4.6 handleLaunchActivity()

``` java
// ActivityThread.java
    public Activity handleLaunchActivity(ActivityClientRecord r,
            PendingTransactionActions pendingActions, Intent customIntent) {
        ...
        final Activity a = performLaunchActivity(r, customIntent);
```

### 4.7 performLaunchActivity()

``` java
// ActivityThread.java
    private Activity performLaunchActivity(ActivityClientRecord r, Intent customIntent) {
            java.lang.ClassLoader cl = appContext.getClassLoader();
            activity = mInstrumentation.newActivity(
                    cl, component.getClassName(), r.intent);
                r.activity = activity;
                if (r.isPersistable()) {
                    mInstrumentation.callActivityOnCreate(activity, r.state, r.persistentState);
                } else {
                    mInstrumentation.callActivityOnCreate(activity, r.state);
                }
    public Activity newActivity(ClassLoader cl, String className,
            Intent intent)
            throws InstantiationException, IllegalAccessException,
            ClassNotFoundException {
        String pkg = intent != null && intent.getComponent() != null
                ? intent.getComponent().getPackageName() : null;
        return getFactory(pkg).instantiateActivity(cl, className, intent);
    }
// AppComponentFactory.java
    public @NonNull Activity instantiateActivity(@NonNull ClassLoader cl, @NonNull String className,
            @Nullable Intent intent)
            throws InstantiationException, IllegalAccessException, ClassNotFoundException {
        return (Activity) cl.loadClass(className).newInstance();
    }
```

performLaunchActivity() 主要是负责创建 activity，最终是通过反射机制创建 activity 的。

### 4.8 callActivityOnCreate -> performCreate -> onCreate

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

最终调用到 Activity.onCreate() 方法，开始执行 APP 的代码，app 进程已启动的情况流程完结，startActivity() 成功，接下来看 app 进程未启动的情况。



## 5. App 进程不存在，请求 Zygote 创建新进程(Socket)

### 5.1 startProcessAsync()

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

### 5.2 AMS.startProcess()

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

### 5.3 startProcessLocked()

``` java
// ActivityManagerService.java Line: 2702
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
// ProcessList.java Line: 2462
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
// Line 2454
    boolean startProcessLocked(ProcessRecord app, HostingRecord hostingRecord,
            int zygotePolicyFlags, String abiOverride) {
        return startProcessLocked(app, hostingRecord, zygotePolicyFlags,
                false /* disableHiddenApiChecks */, false /* disableTestApiChecks */,
                abiOverride);
    }
// Line 1807
    boolean startProcessLocked(ProcessRecord app, HostingRecord hostingRecord,
            int zygotePolicyFlags, boolean disableHiddenApiChecks, boolean disableTestApiChecks,
            String abiOverride) {
        ...
        long startTime = SystemClock.uptimeMillis(); // 记录启动时间
        ... // 记录下面的 entryPoint，zygote 启动进程的时候会用到
            final String entryPoint = "android.app.ActivityThread"; // Line 2043
            return startProcessLocked(hostingRecord, entryPoint, app, uid, gids,
                    runtimeFlags, zygotePolicyFlags, mountExternal, seInfo, requiredAbi,
                    instructionSet, invokeWith, startTime);
        ...
    }
// Line 2064
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

记住 ProcessList.java:2043 行的 entryPoint，在后面 zygote 创建完子进程后需要用到；

### 5.4 ProcessList.startProcess()

``` java
// ProcessList.java Line: 2318
	private Process.ProcessStartResult startProcess(HostingRecord hostingRecord, String entryPoint,
            ProcessRecord app, int uid, int[] gids, int runtimeFlags, int zygotePolicyFlags,
            int mountExternal, String seInfo, String requiredAbi, String instructionSet,
            String invokeWith, long startTime) {
        try {
            startResult = startWebView(...); // 
            } else if (hostingRecord.usesAppZygote()) {
                final AppZygote appZygote = createAppZygoteForProcessIfNeeded(app);
                startResult = appZygote.getProcess().start(...);
            } else {
                regularZygote = true;
                startResult = Process.start(...);
            }
            ...
```

有三种不同类型的 zygote，

- webview zygote：辅助 zygote 进程，用于创建 isolated_app 进程来渲染不可信的 web 内容，具有最为严格的安全限制；
- app zygote：应用 zygote 进程，与常规 zygote 创建的应用相比受到更多限制；
- regular zygote：常规的 zygote32/zygote64 进程，是所有 Android Java 应用的父进程；

关注常规 zygote 即可，最终都是调用到 Process.start() 方法；

### 5.5 Process.start()

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

调用 ZYGOTE_PROCESS.start()，ZYGOTE_PROCESS 就是一个 ZygoteProcess 对象，其在构造函数中初始化了用于和 zygote 通信的 mZygoteSocketAddress，

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

### 5.6 Process.ProcessStartResult

``` java
// ZygoteProcess.java
    private Process.ProcessStartResult startViaZygote(...)
        ...
        argsForZygote.add("--runtime-args");
        argsForZygote.add("--setuid=" + uid);
        argsForZygote.add("--setgid=" + gid);
        argsForZygote.add("--runtime-flags=" + runtimeFlags);
        argsForZygote.add("--target-sdk-version=" + targetSdkVersion);
		...
            argsForZygote.add("--nice-name=" + niceName);
            argsForZygote.add("--package-name=" + packageName);
        synchronized(mLock) {
            // The USAP pool can not be used if the application will not use the systems graphics
            // driver.  If that driver is requested use the Zygote application start path.
            return zygoteSendArgsAndGetResult(openZygoteSocketIfNeeded(abi)/*尝试打开 socket*/,
                                              zygotePolicyFlags,
                                              argsForZygote);
        }
    }
```

该过程主要工作是生成`argsForZygote`数组，该数组保存了进程的 uid、gid、groups、target-sdk、nice-name、package-name  等一系列的参数；

openZygoteSocketIfNeeded() 是根据当前的 abi 来选择与 zygote 还是 zygote64 进程建立连接，获取和 Zygote 通信的 Socket，最终返回了一个已连接 Zygote、包含对应套接字的 ZygoteState 对象，便于后面通信使用；

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
            zygoteWriter.write(msgStr); // 向 zygote 进程发送参数列表
            zygoteWriter.flush();

            Process.ProcessStartResult result = new Process.ProcessStartResult();
            result.pid = zygoteInputStream.readInt(); // 阻塞等待 Socket 服务端（Zygote）返回新创建的进程 pid
            result.usingWrapper = zygoteInputStream.readBoolean();

            if (result.pid < 0) {
                throw new ZygoteStartFailedEx("fork() failed");
            }

            return result;
        ...
```

主要功能是通过 socket 通道向 Zygote 进程发送一个参数列表，然后进入阻塞等待状态，直到远端的socket服务端发送回来新创建的进程 pid 才返回。

system_server 向 zygote 进程发送消息后就唤醒了 zygote 进程，来响应 socket 客户端的请求，接下来 zygote 开始创建进程。

## 6. Zygote fork 新进程

### 6.1 Zygote fork 流程

#### 6.1.1 runSelectLoop()

``` java
// ZygoteServer.java
    Runnable runSelectLoop(String abiList) {
        ArrayList<FileDescriptor> socketFDs = new ArrayList<>();
        ArrayList<ZygoteConnection> peers = new ArrayList<>();
        // mZygoteSocket 是 socket 通信的服务端，即 zygote 进程，把 fd 添加到 socketFDs
        socketFDs.add(mZygoteSocket.getFileDescriptor());
        peers.add(null);
        while (true) {
            ...
            try {
                pollReturnValue = Os.poll(pollFDs, pollTimeoutMs); // 当 pollFDs 有事件到来就往下执行，否则阻塞在这里
                ...
                while (--pollIndex >= 0) { // 当接收到客户端发出连接请求 或者数据处理请求到来，则往下执行，否则 continue
                    if ((pollFDs[pollIndex].revents & POLLIN) == 0) {
                        continue;
                    }

                    if (pollIndex == 0) {
                        // Zygote server socket 有客户端请求，创建 ZygoteConnection 对象，并添加到 socketFDs 中
                        ZygoteConnection newPeer = acceptCommandPeer(abiList); // 创建 ZygoteConnection 对象
                        peers.add(newPeer);
                        socketFDs.add(newPeer.getFileDescriptor()); // 添加到 socketFDs
                    } else if (pollIndex < usapPoolEventFDIndex) {
                        // Session socket accepted from the Zygote server socket
                        // 通过socket接收来自对端的数据，并执行相应操作

                        try {
                            ZygoteConnection connection = peers.get(pollIndex);
                            boolean multipleForksOK = !isUsapPoolEnabled()
                                    && ZygoteHooks.isIndefiniteThreadSuspensionSafe();
                            // 处理收到的命令，并且根据需要执行 fork，该调用会返回两次
                            final Runnable command = connection.processCommand(this, multipleForksOK);
```

Zygote 服务端收到客户端请求，创建 ZygoteConnection 对象，调用其 `processCommand()` 处理收到的数据；

#### 6.1.2 processCommand()

``` java
// ZygoteConnection.java
    Runnable processCommand(ZygoteServer zygoteServer, boolean multipleOK) {
                    pid = Zygote.forkAndSpecialize(...); // fork 子进程
                        if (pid == 0) { // 子进程操作
                            // in child
                            zygoteServer.setForkChild();

                            zygoteServer.closeServerSocket();
                            IoUtils.closeQuietly(serverPipeFd);
                            serverPipeFd = null;
                            // 6.3 fork 后子进程工作
                            return handleChildProc(parsedArgs, childPipeFd,
                                    parsedArgs.mStartChildZygote);
                        } else { // 父进程操作
                            // In the parent. A pid < 0 indicates a failure and will be handled in
                            // handleParentProc.
                            IoUtils.closeQuietly(childPipeFd);
                            childPipeFd = null;
                            handleParentProc(pid, serverPipeFd); // 6.2 fork 后父进程工作
                            return null;
                        }
```

调用 forkAndSpecialize() fork 出子进程，函数返回两次；

#### 6.1.3 forkAndSpecialize()

``` java
// Zygote.java
    static int forkAndSpecialize(int uid, int gid, int[] gids, int runtimeFlags,
            int[][] rlimits, int mountExternal, String seInfo, String niceName, int[] fdsToClose,
            int[] fdsToIgnore, boolean startChildZygote, String instructionSet, String appDataDir,
            boolean isTopApp, String[] pkgDataInfoList, String[] allowlistedDataInfoList,
            boolean bindMountAppDataDirs, boolean bindMountAppStorageDirs) {
        ZygoteHooks.preFork();

        int pid = nativeForkAndSpecialize(
                uid, gid, gids, runtimeFlags, rlimits, mountExternal, seInfo, niceName, fdsToClose,
                fdsToIgnore, startChildZygote, instructionSet, appDataDir, isTopApp,
                pkgDataInfoList, allowlistedDataInfoList, bindMountAppDataDirs,
                bindMountAppStorageDirs);
        ...
    }
```

**fork** 出一个新的进程，通过 JNI 调用 nativeForAndSpecialize() 函数，对应的是 `com_android_internal_os_Zygote_nativeForkAndSpecialize()`。

#### 6.1.4 com_android_internal_os_Zygote_nativeForkAndSpecialize

``` cpp
// com_android_internal_os_Zygote.cpp
static jint com_android_internal_os_Zygote_nativeForkAndSpecialize(
        JNIEnv* env, jclass, jint uid, jint gid, jintArray gids, jint runtime_flags,
        jobjectArray rlimits, jint mount_external, jstring se_info, jstring nice_name,
        jintArray managed_fds_to_close, jintArray managed_fds_to_ignore, jboolean is_child_zygote,
        jstring instruction_set, jstring app_data_dir, jboolean is_top_app,
        jobjectArray pkg_data_info_list, jobjectArray allowlisted_data_info_list,
        jboolean mount_data_dirs, jboolean mount_storage_dirs) {
    ...
    pid_t pid = zygote::ForkCommon(env, /* is_system_server= */ false, fds_to_close, fds_to_ignore,
                                   true);

    if (pid == 0) { // fork 成功，代码块在子进程执行
        SpecializeCommon(env, uid, gid, gids, runtime_flags, rlimits, capabilities, capabilities,
                         mount_external, se_info, nice_name, false, is_child_zygote == JNI_TRUE,
                         instruction_set, app_data_dir, is_top_app == JNI_TRUE, pkg_data_info_list,
                         allowlisted_data_info_list, mount_data_dirs == JNI_TRUE,
                         mount_storage_dirs == JNI_TRUE);
    }
    return pid;
}
```

#### 6.1.5 ForkCommon

``` cpp
// com_android_internal_os_Zygote.cpp
pid_t zygote::ForkCommon(JNIEnv* env, bool is_system_server,
                         const std::vector<int>& fds_to_close,
                         const std::vector<int>& fds_to_ignore,
                         bool is_priority_fork,
                         bool purge) {
    ...
  pid_t pid = fork(); // fork 子进程
```

fork() 采用写时拷贝(copy on write)，即如果 fork 完什么也不做，其实内存中并没有为子进程分配物理内存，父子进程共用同一份物理内存，只有当父子进程任一方修改内存数据时（on write 时机），才会分配新的物理内存，fork() 函数调用一次，返回两次，返回值有 3 种类型：

- 子进程：fork() 返回 0；
- 父进程：fork() 返回子进程 pid；
- < 0：fork() 失败（当进程数超过上限或者系统内存不足时会 fork 失败）；

fork() 的主要工作是寻找空闲的进程号 pid，然后从父进程拷贝进程信息，例如数据段和代码段、fork() 后子进程要执行的代码等；

到这里 app 进程已经创建，fork() 返回 pid 后根据 pid 的值分别进入子进程和父进程执行 `handleChildProc()` 和 `handleParentProc()` ；

### 6.2 fork 后父进程工作

#### handleParentProc()

``` java
// ZygoteConnection.java
    private void handleParentProc(int pid, FileDescriptor pipeFd) {
        ...
        try {
            mSocketOutStream.writeInt(pid);
            mSocketOutStream.writeBoolean(usingWrapper);
```

fork 成功后 zygote 进程通过 socket 返回数据；

### 6.3 fork 后子进程工作

``` java
// ZygoteConnection.java
                    pid = Zygote.forkAndSpecialize(...);
                    try {
                        if (pid == 0) {
                            // in child
                            zygoteServer.setForkChild();

                            zygoteServer.closeServerSocket();
                            IoUtils.closeQuietly(serverPipeFd);
                            serverPipeFd = null;

                            return handleChildProc(parsedArgs, childPipeFd,
                                    parsedArgs.mStartChildZygote);
                        }
```

#### 6.3.1 handleChildProc

``` java
// ZygoteConnection.java
	private Runnable handleChildProc(ZygoteArguments parsedArgs,
            FileDescriptor pipeFd, boolean isZygote) {
        closeSocket(); // 关闭 zygote 的 socket 两端的连接
        Zygote.setAppProcessName(parsedArgs, TAG); // 设置进程名
        if (parsedArgs.mInvokeWith != null) {
            ...
        } else {
            if (!isZygote) {
                return ZygoteInit.zygoteInit(parsedArgs.mTargetSdkVersion,
                        parsedArgs.mDisabledCompatChanges,
                        parsedArgs.mRemainingArgs, null /* classLoader */);
            } else {
                return ZygoteInit.childZygoteInit(
                        parsedArgs.mRemainingArgs  /* classLoader */);
            }
        }
    }
```

#### 6.3.2 zygoteInit

``` java
// ZygoteInit.java
    public static Runnable zygoteInit(int targetSdkVersion, long[] disabledCompatChanges,
            String[] argv, ClassLoader classLoader) {
        ...

        RuntimeInit.commonInit(); // 初始化运行环境
        ZygoteInit.nativeZygoteInit(); // 启动 Binder，方法在 AndroidRuntime.cpp 中注册
        return RuntimeInit.applicationInit(targetSdkVersion, disabledCompatChanges, argv,
                classLoader);
    }
```

#### 6.3.3 nativeZygoteInit()

在 [forkSystemServer() 流程](http://rangerzhou.top/2021/11/01/Android/AndroidDevelop_010_SystemServer/#1-4-zygoteInit) 中已经分析，就是调用 open() 打开 */dev/binder* 驱动设备，再使用 mmap() 映射内核地址空间，将 Binder 驱动的 fd 赋值给 ProcessState 对象中的变量 mDriveFD，创建一个新的 binder 线程池，通过 talkWithDriver() 与驱动通信；

#### 6.3.4 applicationInit

```  java
// RuntimeInit.java
    protected static Runnable applicationInit(int targetSdkVersion, long[] disabledCompatChanges,
            String[] argv, ClassLoader classLoader) {
        ...
        final Arguments args = new Arguments(argv);
		...
        // Remaining arguments are passed to the start class's static main
        return findStaticMain(args.startClass, args.startArgs, classLoader);
    }
```

回忆一下前面 ProcessList.java:2043 行的 entryPoint 的值，这里的 startClass 是 entryPoint（android.app.ActivityThread），接下来的操作也在 [forkSystemServer() 流程](http://rangerzhou.top/2021/11/01/Android/AndroidDevelop_010_SystemServer01-forkSystemServer/#1-4-zygoteInit) 中已经分析，最终就是通过反射获取到 startClass 的 main() 函数，返回一个 Runnable，然后在 ZygoteInit.main() 中调用 `caller.run();` 启动 ActivityThread.main()；



## 7. APP 进程向 system_server 发起 attachApplication[Binder]

### attach() -> attachApplication()

``` java
// ActivityThread.java
    public static void main(String[] args) {
        Environment.initForCurrentUser(); // 初始化环境
        Looper.prepareMainLooper(); // 初始化主线程 Looper
        ActivityThread thread = new ActivityThread();
        thread.attach(false, startSeq); // 初始化 APP 进程，attach 到系统进程

        if (sMainThreadHandler == null) {
            sMainThreadHandler = thread.getHandler();
        }
        Looper.loop(); // 主线程进入循环状态
    }
// ActivityThread.java
    final ApplicationThread mAppThread = new ApplicationThread();
	private void attach(boolean system, long startSeq) {
            RuntimeInit.setApplicationObject(mAppThread.asBinder());
            final IActivityManager mgr = ActivityManager.getService();
            try {
                mgr.attachApplication(mAppThread, startSeq);
```

通过 Binder 调用 AMS.attachApplication()，并传入 app 的 Binder 对象 mAppThread。

## 8. system_server 请求 APP binderApplication[Binder]

### 8.1 attachApplication()

system_server 收到请求后向 app binder线程(ApplicationThread)请求 binderApplication[Binder]

``` java
// ActivityManagerService.java
    public final void attachApplication(IApplicationThread thread, long startSeq) {
        if (thread == null) {
            throw new SecurityException("Invalid application interface");
        }
        synchronized (this) {
            int callingPid = Binder.getCallingPid(); // 获取远程 Binder 调用端的 pid
            final int callingUid = Binder.getCallingUid(); // 获取远程 Binder 调用端的 uid
            final long origId = Binder.clearCallingIdentity(); // 清除远程 Binder 调用端的 uid 和 pid 信息，并保存到 origId 变量
            attachApplicationLocked(thread, callingPid, callingUid, startSeq);
            Binder.restoreCallingIdentity(origId); // 通过 origId 变量，还原远程 Binder 调用端的 uid 和 pid 信息
        }
    }
```

在 binder 远程调用的时候，服务端在执行 binder_thread_read() 过程中会把客户端线程的 pid 和 uid 保存到 binder_transaction_data 对象中传递到用户空间，然后在处理 BR_TRANSACTION 的时候把内核传递过来的客户端的 pid 和 uid 赋值给到服务端的 IPCThreadState 的 mCallingPid 和 mCallingUid，所以此处 

- Binder.getCallingPid() / Binder.getCallingUid()：返回 binder 调用端的 pid 和 uid；
- Binder.clearCallingIdentity()：把 binder 调用端的 pid 和 uid 保存到一个 token(origId) 并返回，然后用当前线程（服务端）的 pid 和 uid 赋值给服务端 IPCThreadState 的 mCallingPid 和 mCallingUid 变量；
- restoreCallingIdentity()：把 origId 中保存的调用端的 pid 和 uid 恢复到服务端 IPCThreadState 的 mCallingPid 和 mCallingUid 变量；

### 8.2 attachApplicationLocked

``` java
// ActivityManagerService.java
    private boolean attachApplicationLocked(@NonNull IApplicationThread thread,
            int pid, int callingUid, long startSeq) {
                thread.bindApplication(...); // 初始化 app 进程并启动
        ...
        if (normalMode) {
            try {
                didSomething = mAtmInternal.attachApplication(app.getWindowProcessController()); // 启动 activity
            } catch (Exception e) {
                Slog.wtf(TAG, "Exception thrown launching activities in " + app, e);
                badApp = true;
            }
        }
```

thread 是 app 进程传过来的 binder 对象，所以会调用 ActivityThread.bindApplication() 初始化 app 进程，attachApplicationLocked 做了两件重要的事：

- thread.bindApplication：初始化 app 进程并启动；
- mAtmInternal.attachApplication：启动 Activity；

## 9. 启动 APP

### 9.1 初始化 APP 进程并启动 APP

``` java
// ActivityThread.java
        public final void bindApplication(...) {
            ...
            sendMessage(H.BIND_APPLICATION, data);
        }
```

通过 Handler 发送 BIND_APPLICATION 消息，app 进程的 looper 从 MessageQueue 取出消息，在 handleMessage() 中处理：

``` java
// ActivityThread.java
        public void handleMessage(Message msg) {
            if (DEBUG_MESSAGES) Slog.v(TAG, ">>> handling: " + codeToString(msg.what));
            switch (msg.what) {
                case BIND_APPLICATION:
                    Trace.traceBegin(Trace.TRACE_TAG_ACTIVITY_MANAGER, "bindApplication");
                    AppBindData data = (AppBindData)msg.obj;
                    handleBindApplication(data);
                    Trace.traceEnd(Trace.TRACE_TAG_ACTIVITY_MANAGER);
                    break;
```

调用 handleBindApplication()

``` java
// ActivityThread.java
    private void handleBindApplication(AppBindData data) {
        ...
        // 设置应用名称
        Process.setArgV0(data.processName);
        android.ddm.DdmHandleAppName.setAppName(data.processName, data.appInfo.packageName, UserHandle.myUserId());
        VMRuntime.setProcessPackageName(data.appInfo.packageName);
        final ContextImpl appContext = ContextImpl.createAppContext(this, data.info); // 创建 app 的上下文
        Application app;
                // 启动应用
                mInstrumentation.onCreate(data.instrumentationArgs);
                mInstrumentation.callApplicationOnCreate(app);
```

通过 Instrumentation 启动 APP；

``` java
// Instrumentation.java
    public void callApplicationOnCreate(Application app) {
        app.onCreate();
    }
```

终于调到 app 进程的 onCreate() 方法了，

### 9.2 启动 APP 的 Activity

``` java
// ActivityManagerService.java
    public ActivityTaskManagerInternal mAtmInternal;
    private boolean attachApplicationLocked(...){
        ...
                didSomething = mAtmInternal.attachApplication(app.getWindowProcessController());
    }
```



``` java
// ActivityTaskManagerService.java
        public boolean attachApplication(WindowProcessController wpc) throws RemoteException {
            synchronized (mGlobalLockWithoutBoost) {
                ...
                    return mRootWindowContainer.attachApplication(wpc);
                ...
```



``` java
// RootWindowContainer.java
	boolean attachApplication(WindowProcessController app) throws RemoteException {
        boolean didSomething = false;
        ...
                final PooledFunction c = PooledLambda.obtainFunction(
                        RootWindowContainer::startActivityForAttachedApplicationIfNeeded, this,
                        PooledLambda.__(ActivityRecord.class), app,
                        rootTask.topRunningActivity());
                ...
```



``` java
// RootWindowContainer.java
	private boolean startActivityForAttachedApplicationIfNeeded(ActivityRecord r,
            WindowProcessController app, ActivityRecord top) {
        ...
            if (mTaskSupervisor.realStartActivityLocked(r, app,
                    top == r && r.isFocusable() /*andResume*/, true /*checkConfig*/)) {
                mTmpBoolean = true;
            ...
```

最终又调用到了 `realStartActivityLocked()`，流程和前面 [第 4 小节](# 4. App 进程已存在) 一样，app 的 looper 处理 `EXECUTE_TRANSACTION`命令，启动 Activity。



## 10. 总结

点击 Launcher 中的 icon 可以启动 APP，APP 启动流程分为如下阶段：

- Launcher 通过 **Binder** 向 system_server 进程发起 startActivity 请求
- system_server 通过 **socket** 向 zygote 发起创建进程请求
- zygote 进程 fork 出 app 子进程，通过 **socket** 返回 pid 给 system_server 进程
- app 子进程通过 **Binder** 向 system_server 进程发起 attachApplication 请求
- system_server 进程通过 **Binder** 向 app 进程发送 binderApplication 请求
- app 进程的 binder 线程（ApplicationThread）收到请求后通过 **Handler** 向 app 主线程发送 BIND_APPLICATION 消息
- system_server 进程通过 **Binder** 向 app 进程发送 scheduleTransaction 请求
- app 进程的 binder 线程（ApplicationThread）收到请求后通过 **Handler** 向 app 主线程发送 EXECUTE_TRANSACTION 消息
- app 主线程收到 Message 后通过反射机制创建目标 Activity，并回调 Activity.onCreate() 等方法
- app 正式启动，进入 Activity 生命周期，执行 onCreate/onStart/onResume，UI 渲染结束进入 app 主界面



APP 启动涉及了多个进程之间的交互，使用了 Binder/Socket 进程间通信机制，Handler 线程间通信机制。
