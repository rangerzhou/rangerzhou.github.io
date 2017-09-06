---
title: 淘宝进入后台后网络策略分析(Android进程调度ADJ算法部分内容分析)
copyright: true
date: 2017-09-06 09:36:16
tags: netpolicy
categories: Frameworks
password:
---

### 1 问题描述

小米项目有一项手机8小时待机功耗测试，同基线的两个项目A和B同条件测试最终待机结果差异过大，A手机8小时耗电为5%，B手机8小时耗电为12%，进一步调查发现B手机主要是淘宝在耗电，而A手机却没有，但是在测试前是都打开了淘宝的。

<!--more-->

### 2 初步分析

首先需要知道为什么同基线同测试环境只有B手机的淘宝耗电，而A手机淘宝却没有耗电，在log中看到A手机的dumpsys netpolicy信息中淘宝的状态为：`  UID=10139 state=16 (bg) rules=64 (REJECT_ALL)`，B手机netpolicy信息为：`  UID=10141 state=3 (fg svc) rules=32 (ALLOW_ALL)`，其中REGECT_ALL和ALLOW_ALL指的是访问网络权限，A手机淘宝由于限制了网络访问，所以耗电比B手机要少，继续看log发现，A手机的淘宝进程被Kill，而B手机却没有，也测试了小米5和小米6，同样发现淘宝被Kill，切被Kill的方式各有不同，三部手机淘宝被Kill的方式有3中：

- lowmemorykiller：android内存管理机制，低内存时会把优先级低的进程kill掉。
- PowerKeeper kill：小米功耗优化的功能。
- com.miui.whetstone：小米的内存管理机制。

正常情况下淘宝在后台会被PowerKeeper限制联网和同步，而处于foreground service优先级不会被限制，所以B手机在淘宝没有被Kill的情况下不会被限制网络，所以耗电的源头已经找到。

那么为什么淘宝的状态会是fg svc呢，这种状态到底是淘宝自身导致还是android代码缺陷还存在疑问，对小米5，小米6，华为平板M3以及一加5均做了同样的测试，测试条件为：安装淘宝-打开-我的淘宝-登陆-HOME键-查看dumpsys netpolicy信息，发现淘宝的状态均为`state=3 (fg svc)`，初步结论为淘宝自身策略导致，接下来通过代码来进一步跟踪。

### 3 源码分析

首先来看这个fg svc是什么东西，

/[frameworks](http://androidxref.com/6.0.1_r10/xref/frameworks/)/[base](http://androidxref.com/6.0.1_r10/xref/frameworks/base/)/[services](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/)/[core](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/)/[java](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/server/)/[net](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/server/net/)/[NetworkPolicyManagerService.java](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/server/net/NetworkPolicyManagerService.java)

``` java
    @Override
    protected void dump(FileDescriptor fd, PrintWriter writer, String[] args) {
        mContext.enforceCallingOrSelfPermission(DUMP, TAG);

        final IndentingPrintWriter fout = new IndentingPrintWriter(writer, "  ");

        final ArraySet<String> argSet = new ArraySet<String>(args.length);
        for (String arg : args) {
            argSet.add(arg);
        }

        synchronized (mUidRulesFirstLock) {
          ... ...
                for (int i = 0; i < size; i++) {
                    final int uid = knownUids.keyAt(i);
                    fout.print("UID=");
                    fout.print(uid);

                    final int state = mUidState.get(uid, ActivityManager.PROCESS_STATE_CACHED_EMPTY);
                    fout.print(" state=");
                    fout.print(state);
                    if (state <= ActivityManager.PROCESS_STATE_TOP) {
                        fout.print(" (fg)");
                    } else {
                        fout.print(state <= ActivityManager.PROCESS_STATE_FOREGROUND_SERVICE
                                ? " (fg svc)" : " (bg)");
                    }

                    final int uidRules = mUidRules.get(uid, RULE_NONE);
                    fout.print(" rules=");
                    fout.print(uidRulesToString(uidRules));
                    fout.println();
                }
          ... ...
```

可以看出如果state <= ActivityManager.PROCESS_STATE_FOREGROUND_SERVICE，则dumpsys信息输出fg svc，看来重点就是进程的状态了，state是从mUidState中取出来的。

``` java
    /**
     * Process state of UID changed; if needed, will trigger
     * {@link #updateRulesForDataUsageRestrictionsUL(int)} and
     * {@link #updateRulesForPowerRestrictionsUL(int)}
     */
    private void updateUidStateUL(int uid, int uidState) {
        Trace.traceBegin(Trace.TRACE_TAG_NETWORK, "updateUidStateUL");
        try {
            final int oldUidState = mUidState.get(uid, ActivityManager.PROCESS_STATE_CACHED_EMPTY);
            if (oldUidState != uidState) {
                // state changed, push updated rules
                mUidState.put(uid, uidState); // mUidState的put
                updateRestrictBackgroundRulesOnUidStatusChangedUL(uid, oldUidState, uidState);
                if (isProcStateAllowedWhileIdleOrPowerSaveMode(oldUidState)
                        != isProcStateAllowedWhileIdleOrPowerSaveMode(uidState) ) {
                    if (isUidIdle(uid)) {
                        updateRuleForAppIdleUL(uid);
                    }
                    if (mDeviceIdleMode) {
                        updateRuleForDeviceIdleUL(uid);
                    }
                    if (mRestrictPower) {
                        updateRuleForRestrictPowerUL(uid);
                    }
                    updateRulesForPowerRestrictionsUL(uid);
                }
                updateNetworkStats(uid, isUidStateForegroundUL(uidState));
            }
        } finally {
            Trace.traceEnd(Trace.TRACE_TAG_NETWORK);
        }
    }
```

查看updateUidStateUL的调用：

``` java
    final private IUidObserver mUidObserver = new IUidObserver.Stub() {
        @Override public void onUidStateChanged(int uid, int procState) throws RemoteException {
            Trace.traceBegin(Trace.TRACE_TAG_NETWORK, "onUidStateChanged");
            try {
                synchronized (mUidRulesFirstLock) {
                    updateUidStateUL(uid, procState);
                }
            } finally {
                Trace.traceEnd(Trace.TRACE_TAG_NETWORK);
            }
        }
```

``` java
    public void systemReady() {
        Trace.traceBegin(Trace.TRACE_TAG_NETWORK, "systemReady");
        try {
            if (!isBandwidthControlEnabled()) {
                Slog.w(TAG, "bandwidth controls disabled, unable to enforce policy");
                return;
            }

            mUsageStats = LocalServices.getService(UsageStatsManagerInternal.class);
          ... ...
            try {
                mActivityManager.registerUidObserver(mUidObserver,
                        ActivityManager.UID_OBSERVER_PROCSTATE|ActivityManager.UID_OBSERVER_GONE); // 注册
                mNetworkManager.registerObserver(mAlertObserver);
            } catch (RemoteException e) {
                // ignored; both services live in system_server
            }
          ... ...
```

在上述代码中会监听UidState的改变，如果有变化则更新mUidState。

/[frameworks](http://androidxref.com/6.0.1_r10/xref/frameworks/)/[base](http://androidxref.com/6.0.1_r10/xref/frameworks/base/)/[services](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/)/[core](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/)/[java](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/server/)/[am](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/server/am/)/[ActivityManagerService.java](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/server/am/ActivityManagerService.java)

``` java
    @Override
    public void registerUidObserver(IUidObserver observer, int which) {
        enforceCallingPermission(android.Manifest.permission.SET_ACTIVITY_WATCHER,
                "registerUidObserver()");
        synchronized (this) {
            mUidObservers.register(observer, which); // 把observer添加到mUidObservers
        }
    }
```

/[frameworks](http://androidxref.com/6.0.1_r10/xref/frameworks/)/[base](http://androidxref.com/6.0.1_r10/xref/frameworks/base/)/[core](http://androidxref.com/6.0.1_r10/xref/frameworks/base/core/)/[java](http://androidxref.com/6.0.1_r10/xref/frameworks/base/core/java/)/[android](http://androidxref.com/6.0.1_r10/xref/frameworks/base/core/java/android/)/[os](http://androidxref.com/6.0.1_r10/xref/frameworks/base/core/java/android/os/)/[RemoteCallbackList.java](http://androidxref.com/6.0.1_r10/xref/frameworks/base/core/java/android/os/RemoteCallbackList.java)

``` java
    public boolean register(E callback, Object cookie) {
        synchronized (mCallbacks) {
            if (mKilled) {
                return false;
            }
            IBinder binder = callback.asBinder();
            try {
                Callback cb = new Callback(callback, cookie);
                binder.linkToDeath(cb, 0);
                mCallbacks.put(binder, cb); // put操作
                return true;
            } catch (RemoteException e) {
                return false;
            }
        }
    }
```

接下来看procState的传入：

/[frameworks](http://androidxref.com/6.0.1_r10/xref/frameworks/)/[base](http://androidxref.com/6.0.1_r10/xref/frameworks/base/)/[services](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/)/[core](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/)/[java](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/server/)/[am](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/server/am/)/[ActivityManagerService.java](http://androidxref.com/6.0.1_r10/xref/frameworks/base/services/core/java/com/android/server/am/ActivityManagerService.java)

``` java
    private void dispatchUidsChanged() {
      ... ...
        int i = mUidObservers.beginBroadcast();
        while (i > 0) {
          ... ...
                        } else {
                            if ((which & ActivityManager.UID_OBSERVER_PROCSTATE) != 0) {
                                if (DEBUG_UID_OBSERVERS) Slog.i(TAG_UID_OBSERVERS,
                                        "UID CHANGED uid=" + item.uid
                                                + ": " + item.processState);
                                // 终于找到了procState的传入源
                                observer.onUidStateChanged(item.uid, item.processState);
                            }
          ... ...
```

``` java
    private final void enqueueUidChangeLocked(UidRecord uidRec, int uid, int change) {
        final UidRecord.ChangeItem pendingChange;
        if (uidRec == null || uidRec.pendingChange == null) {
            if (mPendingUidChanges.size() == 0) {
                if (DEBUG_UID_OBSERVERS) Slog.i(TAG_UID_OBSERVERS,
                        "*** Enqueueing dispatch uid changed!");
                mUiHandler.obtainMessage(DISPATCH_UIDS_CHANGED_UI_MSG).sendToTarget();
            }
          ... ...
            
    final class UiHandler extends Handler {
        public UiHandler() {
            super(com.android.server.UiThread.get().getLooper(), null, true);
        }
        @Override
        public void handleMessage(Message msg) {
            switch (msg.what) {
                ... ...
            case DISPATCH_UIDS_CHANGED_UI_MSG: {
                dispatchUidsChanged(); // 消息处理，在dispatchUidsChanged中传入了ProcState
            } break;
            }
        }
    }
```

而procState实际上也是在ActivityManagerService.java中设置的，接下来看procState的set：

``` java
    // 计算adj，返回计算后RawAdj值，和applyOomAdjLocked一起在updateOomAdjLocked中调用
    private final int computeOomAdjLocked(ProcessRecord app, int cachedAdj, ProcessRecord TOP_APP, boolean doingAll, long now) {
      ... ...
        // service情况
        boolean mayBeTop = false; // 是否显示在最顶部

        // 当adj > 0或schedGroup为后台进程组或procState > 2时执行
        for (int is = app.services.size()-1;
                is >= 0 && (adj > ProcessList.FOREGROUND_APP_ADJ
                        || schedGroup == ProcessList.SCHED_GROUP_BACKGROUND
                        || procState > ActivityManager.PROCESS_STATE_TOP);
                is--) {
            ServiceRecord s = app.services.valueAt(is);
            ... ...
            for (int conni = s.connections.size()-1;
                    conni >= 0 && (adj > ProcessList.FOREGROUND_APP_ADJ
                            || schedGroup == ProcessList.SCHED_GROUP_BACKGROUND
                            || procState > ActivityManager.PROCESS_STATE_TOP);
                    conni--) {
                // 获取service所绑定的connections
                ArrayList<ConnectionRecord> clist = s.connections.valueAt(conni);
                for (int i = 0;
                        i < clist.size() && (adj > ProcessList.FOREGROUND_APP_ADJ
                                || schedGroup == ProcessList.SCHED_GROUP_BACKGROUND
                                || procState > ActivityManager.PROCESS_STATE_TOP);
                        i++) {
                    // XXX should compute this based on the max of
                    // all connected clients.
                    ConnectionRecord cr = clist.get(i);
                    if (cr.binding.client == app) {
                        // Binding to ourself is not interesting.
                        // 当client与当前app同一进程，则continue
                        continue;
                    }

                    if ((cr.flags&Context.BIND_WAIVE_PRIORITY) == 0) {
                        ProcessRecord client = cr.binding.client;
                        // 计算connections所对应的client进程的adj
                        int clientAdj = computeOomAdjLocked(client, cachedAdj,
                                TOP_APP, doingAll, now);
                        int clientProcState = client.curProcState; // client进程的状态
                        ... ...
                        // 当绑定的是前台进程的情况
                        if ((cr.flags&Context.BIND_NOT_FOREGROUND) == 0) {
                            // This will treat important bound services identically to
                            // the top app, which may behave differently than generic
                            // foreground work.
                            if (client.curSchedGroup > schedGroup) {
                                if ((cr.flags&Context.BIND_IMPORTANT) != 0) {
                                    schedGroup = client.curSchedGroup;
                                } else {
                                    schedGroup = ProcessList.SCHED_GROUP_DEFAULT;
                                }
                            }
                            if (clientProcState <= ActivityManager.PROCESS_STATE_TOP) {
                                if (clientProcState == ActivityManager.PROCESS_STATE_TOP) {
                                    // Special handling of clients who are in the top state.
                                    // We *may* want to consider this process to be in the
                                    // top state as well, but only if there is not another
                                    // reason for it to be running.  Being on the top is a
                                    // special state, meaning you are specifically running
                                    // for the current top app.  If the process is already
                                    // running in the background for some other reason, it
                                    // is more important to continue considering it to be
                                    // in the background state.
                                    // 当client进程状态为前台时，则设置mayBeTop=true，并设置client进程procState=16
                                    mayBeTop = true;
                                    clientProcState = ActivityManager.PROCESS_STATE_CACHED_EMPTY;
                                } else {
                                    // 当client进程状态 < 2的前提下：若绑定前台service，则clientProcState=3；否则clientProcState=6
                                ... ...
                            }
                        }
                        ... ...
```

`computeOomAdjLocked`是调整进程adj的三大护法之一，也是ADJ算法的核心方法：

- `updateOomAdjLocked`：更新adj，当目标进程为空，或者被杀则返回false；否则返回true;
  - `computeOomAdjLocked`：计算adj，设置adj和procState(进程状态)，返回计算后RawAdj值;
- `applyOomAdjLocked`：应用adj，当需要杀掉目标进程则返回false；否则返回true。

`updateOomAdjLocked`实现过程中依次会`computeOomAdjLocked`和`applyOomAdjLocked`，上面代码中主要是`computeOomAdjLocked`中的Service处理部分，如果service所绑定的connections所对应的client进程为前台进程，且client进程状态clientProcState == ActivityManager.PROCESS_STATE_TOP(值为2)，则设置mayBeTop=true。

随后还有对adj的调整：

``` java
        // 当mayBeTop为true，且procState > 2时
        if (mayBeTop && procState > ActivityManager.PROCESS_STATE_TOP) {
            // A client of one of our services or providers is in the top state.  We
            // *may* want to be in the top state, but not if we are already running in
            // the background for some other reason.  For the decision here, we are going
            // to pick out a few specific states that we want to remain in when a client
            // is top (states that tend to be longer-term) and otherwise allow it to go
            // to the top state.
            switch (procState) {
                case ActivityManager.PROCESS_STATE_IMPORTANT_FOREGROUND:
                case ActivityManager.PROCESS_STATE_IMPORTANT_BACKGROUND:
                case ActivityManager.PROCESS_STATE_SERVICE:
                    // 对于procState = 6, 7, 10时，将procState设置为3
                    // These all are longer-term states, so pull them up to the top
                    // of the background states, but not all the way to the top state.
                    procState = ActivityManager.PROCESS_STATE_BOUND_FOREGROUND_SERVICE;
                    break;
                default:
                    // Otherwise, top is a better choice, so take it.
                    procState = ActivityManager.PROCESS_STATE_TOP;
                    break;
            }
        }
```

分析到这里就找到了为什么淘宝进程最后的状态为3了，在调试的过程中发现打开淘宝后会启动一个service：`09-05 17:41:27.474  1486 21013 I ActivityManager: Start proc 5692:com.taobao.taobao:channel/u0a198 for service com.taobao.taobao/com.alibaba.analytics.AnalyticsService caller=com.taobao.taobao` ，就是这个service在`computeOomAdjLocked`所绑定的connections所对应的client进程为前台进程，最终系统把mayBeTop设置为了true，当淘宝进程的procState > 2（比如按HOME键使之后台）时，就会调整adj，最终把淘宝进程的状态procState设置为3，如果按HOME键的时候这个service还没有启动起来，则不会触发`computeOomAdjLocked`中把mayBeTop设为true的那段代码，也就不会调整procState了。

### 4 总结

单是针对文中问题的分析已经到此结束，终其原因是Android framework层中承载activity/service/contentprovider/broadcastreceiver的进程根据组件运行状态而动态调节进程自身的状态，进程有两个比较重要的状态值adj(ProcessList.java中定义)和procState(ActivityManager.java中定义)，调整进程ADJ算法的核心方法`computeOomAdjLocked`除了对service的处理外还有对Activity和ContentProvider情况的处理，整个adj算法的分析还没有完全弄懂，此部分内容未完待续。