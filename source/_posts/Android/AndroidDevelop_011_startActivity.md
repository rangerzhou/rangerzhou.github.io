---
title: Android - APP 启动流程分析
date: 2021-11-05 20:52:15
tags:
categories: Android
copyright: true
password: zr.
---



> 想要优化 APP 的启动时间，必须要了解 APP 的启动流程，本文从 startActivity() 开始分析 APP 的启动流程；

> StartActivity 流程分析

<!--more-->

# 相关代码路径

| Layer     | Path            |
| --------- | --------------- |
| framework | framework/base/ |
|           |                 |

点击 Launcher 中的 icon 可以启动 APP，APP 启动流程主要分4个阶段：

- 



最终会执行到 Activity.startActivity()，以此为入口分析 startActivity() 流程；

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



``` java
    public ActivityResult execStartActivity(
            Context who, IBinder contextThread, IBinder token, Activity target,
            Intent intent, int requestCode, Bundle options) {
        IApplicationThread whoThread = (IApplicationThread) contextThread;
        Uri referrer = target != null ? target.onProvideReferrer() : null;
        if (referrer != null) {
            intent.putExtra(Intent.EXTRA_REFERRER, referrer);
        }
        if (mActivityMonitors != null) {
            synchronized (mSync) {
                final int N = mActivityMonitors.size();
                for (int i=0; i<N; i++) {
                    final ActivityMonitor am = mActivityMonitors.get(i);
                    ActivityResult result = null;
                    if (am.ignoreMatchingSpecificIntents()) {
                        if (options == null) {
                            options = ActivityOptions.makeBasic().toBundle();
                        }
                        result = am.onStartActivity(who, intent, options);
                    }
                    if (result != null) {
                        am.mHits++;
                        return result;
                    } else if (am.match(who, null, intent)) {
                        am.mHits++;
                        if (am.isBlocking()) {
                            return requestCode >= 0 ? am.getResult() : null;
                        }
                        break;
                    }
                }
            }
        }
        try {
            intent.migrateExtraStreamToClipData(who);
            intent.prepareToLeaveProcess(who);
            int result = ActivityTaskManager.getService().startActivity(whoThread,
                    who.getOpPackageName(), who.getAttributionTag(), intent,
                    intent.resolveTypeIfNeeded(who.getContentResolver()), token,
                    target != null ? target.mEmbeddedID : null, requestCode, 0, null, options);
            checkStartActivityResult(result, intent);
        } catch (RemoteException e) {
            throw new RuntimeException("Failure from system", e);
        }
        return null;
    }
```



