---
title: Android_O(8.1.0)_ANR_log信息收集过程
copyright: true
date: 2018-03-28 16:49:30
tags: ANR
categories: Stability
password:
---

### 1. 概述

> 如前文[Android_ANR分析](http://rangerzhou.top/2018/03/04/Android-ANR%E5%88%86%E6%9E%90/)所述，ANR有4种分类：KeyDispatch Timeout、Broadcast Timeou、Service Timeout、ContentProvider Timeout，但是无论是哪一类，最后都会调用到AppErrors.appNotResponding()方法（Android N之前还是写在AMS中，从N开始定义在新添加的[AppErrors.java](http://androidxref.com/8.0.0_r4/xref/frameworks/base/services/core/java/com/android/server/am/AppErrors.java)中，本文基于Android 8.1.0源码分析），该方法的调用如下图：

<!--more-->

![appNotRespondingUsages](http://otqux1hnn.bkt.clouddn.com/rangerzhou/180329/appNotRespondingUsages.png)

从图中可以看到包含**Service、ContentProvider，BroadcastQueue、inputDispatching**四种类型对appNotResponding()方法的调用，下面从这个方法说起。

### 2. appNotResponding

#### 2.1 AppErrors.appNotResponding

/[frameworks](http://androidxref.com/8.0.0_r4/xref/frameworks/)/[base](http://androidxref.com/8.0.0_r4/xref/frameworks/base/)/[services](http://androidxref.com/8.0.0_r4/xref/frameworks/base/services/)/[core](http://androidxref.com/8.0.0_r4/xref/frameworks/base/services/core/)/[java](http://androidxref.com/8.0.0_r4/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/8.0.0_r4/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/8.0.0_r4/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/8.0.0_r4/xref/frameworks/base/services/core/java/com/android/server/)/[am](http://androidxref.com/8.0.0_r4/xref/frameworks/base/services/core/java/com/android/server/am/)/[AppErrors.java](http://androidxref.com/8.0.0_r4/xref/frameworks/base/services/core/java/com/android/server/am/AppErrors.java)

``` java
    final void appNotResponding(ProcessRecord app, ActivityRecord activity,
            ActivityRecord parent, boolean aboveSystem, final String annotation) {
        /** 
         * app: 当前发生ANR的进程
         * activity: 发生ANR的界面
         * parent: 发生ANR的界面的上一级界面
         * aboveSystem: 
         * annotation: 发生ANR的原因
         */
        
        // 填充firstPids和lastPids数组，从最近运行进程中挑选
        // firstPids: 用于保存ANR进程及其父进程，system_server进程和persistent的进程
        // lastPids: 用于保存除firstPids外的其他进程
        ArrayList<Integer> firstPids = new ArrayList<Integer>(5);
        // SparseArray比HashMap更省内存
        SparseArray<Boolean> lastPids = new SparseArray<Boolean>(20);

        if (mService.mController != null) {
            try {
                // 0 == continue, -1 = kill process immediately
                int res = mService.mController.appEarlyNotResponding(
                        app.processName, app.pid, annotation);
                if (res < 0 && app.pid != MY_PID) {
                    app.kill("anr", true);
                }
            } catch (RemoteException e) {
                mService.mController = null;
                Watchdog.getInstance().setActivityController(null);
            }
        }

        long anrTime = SystemClock.uptimeMillis();
        if (ActivityManagerService.MONITOR_CPU_USAGE) {
            // 更新CPU使用信息
            mService.updateCpuStatsNow();
        }

        // Unless configured otherwise, swallow ANRs in background processes & kill the process.
        // 如果ANR_SHOW_BACKGROUND(anr_show_background)值为非空，则会弹出一个对话框，否则静态kill
        boolean showBackground = Settings.Secure.getInt(mContext.getContentResolver(),
                Settings.Secure.ANR_SHOW_BACKGROUND, 0) != 0;

        boolean isSilentANR;

        synchronized (mService) {
            // 跳过一些场景下的ANR
            // PowerManager.reboot() can block for a long time, so ignore ANRs while shutting down.
            if (mService.mShuttingDown) {
                // 正在关机时跳过ANR
                Slog.i(TAG, "During shutdown skipping ANR: " + app + " " + annotation);
                return;
            } else if (app.notResponding) {
                // 已经有一个ANR弹出框时
                Slog.i(TAG, "Skipping duplicate ANR: " + app + " " + annotation);
                return;
            } else if (app.crashing) {
                // 处在一个正在crashing的进程
                Slog.i(TAG, "Crashing app skipping ANR: " + app + " " + annotation);
                return;
            } else if (app.killedByAm) {
                // 当进程被activity manager kill
                Slog.i(TAG, "App already killed by AM skipping ANR: " + app + " " + annotation);
                return;
            } else if (app.killed) {
                // 进程已经被kill
                Slog.i(TAG, "Skipping died app ANR: " + app + " " + annotation);
                return;
            }

            // In case we come through here for the same app before completing
            // this one, mark as anring now so we will bail out.
            // 为了防止此次处理完成之前同个app又走到这里，把noteResponding设为true
            app.notResponding = true;

            // Log the ANR to the event log..
            // 记录ANR到event log
            EventLog.writeEvent(EventLogTags.AM_ANR, app.userId, app.pid,
                    app.processName, app.info.flags, annotation);

            // Dump thread traces as quickly as we can, starting with "interesting" processes.
            // 将当前进程添加到firstPids
            firstPids.add(app.pid);

            // Don't dump other PIDs if it's a background ANR
            // showBackground为false（不显示后台ANR的dialog）
            isSilentANR = !showBackground && !isInterestingForBackgroundTraces(app);
            if (!isSilentANR) {
                int parentPid = app.pid;
                if (parent != null && parent.app != null && parent.app.pid > 0) {
                    parentPid = parent.app.pid;
                }
                if (parentPid != app.pid) firstPids.add(parentPid);

                // MY_PID为system_server的PID,将system_server进程添加到firstPids
                if (MY_PID != app.pid && MY_PID != parentPid) firstPids.add(MY_PID);

                for (int i = mService.mLruProcesses.size() - 1; i >= 0; i--) {
                    ProcessRecord r = mService.mLruProcesses.get(i);
                    if (r != null && r.thread != null) {
                        int pid = r.pid;
                        if (pid > 0 && pid != app.pid && pid != parentPid && pid != MY_PID) {
                            if (r.persistent) {
                                // 将persistent进程添加到firstPids
                                firstPids.add(pid);
                                if (DEBUG_ANR) Slog.i(TAG, "Adding persistent proc: " + r);
                            } else if (r.treatLikeActivity) {
                                firstPids.add(pid);
                                if (DEBUG_ANR) Slog.i(TAG, "Adding likely IME: " + r);
                            } else {
                                // 其他进程添加到lastPids
                                lastPids.put(pid, Boolean.TRUE);
                                if (DEBUG_ANR) Slog.i(TAG, "Adding ANR proc: " + r);
                            }
                        }
                    }
                }
            }
        }

        // Log the ANR to the main log.
        // 把ANR信息输出到main log
        StringBuilder info = new StringBuilder();
        info.setLength(0);
        info.append("ANR in ").append(app.processName);
        if (activity != null && activity.shortComponentName != null) {
            info.append(" (").append(activity.shortComponentName).append(")");
        }
        info.append("\n");
        info.append("PID: ").append(app.pid).append("\n");
        if (annotation != null) {
            info.append("Reason: ").append(annotation).append("\n");
        }
        if (parent != null && parent != activity) {
            info.append("Parent: ").append(parent.shortComponentName).append("\n");
        }

        // 创建CPU tracker对象
        ProcessCpuTracker processCpuTracker = new ProcessCpuTracker(true);

        // don't dump native PIDs for background ANRs unless it is the process of interest
        String[] nativeProcs = null;
        if (isSilentANR) {
            for (int i = 0; i < NATIVE_STACKS_OF_INTEREST.length; i++) {
                if (NATIVE_STACKS_OF_INTEREST[i].equals(app.processName)) {
                    nativeProcs = new String[] { app.processName };
                    break;
                }
            }
        } else {
            nativeProcs = NATIVE_STACKS_OF_INTEREST;
        }

        // pids为NATIVE_STACKS_OF_INTEREST中定义的几个进程
        int[] pids = nativeProcs == null ? null : Process.getPidsForCommands(nativeProcs);
        ArrayList<Integer> nativePids = null;

        if (pids != null) {
            nativePids = new ArrayList<Integer>(pids.length);
            for (int i : pids) {
                nativePids.add(i);
            }
        }

        // For background ANRs, don't pass the ProcessCpuTracker to
        // avoid spending 1/2 second collecting stats to rank lastPids.
        // 输出traces信息，详见2.2
        File tracesFile = ActivityManagerService.dumpStackTraces(
                true, firstPids,
                (isSilentANR) ? null : processCpuTracker,
                (isSilentANR) ? null : lastPids,
                nativePids);

        String cpuInfo = null;
        if (ActivityManagerService.MONITOR_CPU_USAGE) {
            // 第二次更新cpu统计信息
            mService.updateCpuStatsNow();
            // 记录当前各个进程的cpu使用情况
            synchronized (mService.mProcessCpuTracker) {
                // 记录ANR之前的cpu使用情况（CPU usage from 38980ms to 0ms ago）
                cpuInfo = mService.mProcessCpuTracker.printCurrentState(anrTime);
            }
            // 记录当前CPU负载情况
            info.append(processCpuTracker.printCurrentLoad());
            info.append(cpuInfo);
        }

        // 记录从anr时间开始的cpu使用情况(CPU usage from 72ms to 465ms later)
        info.append(processCpuTracker.printCurrentState(anrTime));

        // 输出info信息，包含ANR的Reason、CPU负载信息以及使用率
        Slog.e(TAG, info.toString());
        if (tracesFile == null) {
            // There is no trace file, so dump (only) the alleged culprit's threads to the log
            // 如果trace为空，则发送singal 3到发送ANR的进程，相当于adb shell kill -3 pid
            Process.sendSignal(app.pid, Process.SIGNAL_QUIT);
        }

        // 将traces文件和CPU使用率信息保存到dropbox，即data/system/dropbox
        mService.addErrorToDropBox("anr", app, app.processName, activity, parent, annotation,
                cpuInfo, tracesFile, null);

        if (mService.mController != null) {
            try {
                // 0 == show dialog, 1 = keep waiting, -1 = kill process immediately
                int res = mService.mController.appNotResponding(
                        app.processName, app.pid, info.toString());
                if (res != 0) {
                    if (res < 0 && app.pid != MY_PID) {
                        app.kill("anr", true);
                    } else {
                        synchronized (mService) {
                            mService.mServices.scheduleServiceTimeoutLocked(app);
                        }
                    }
                    return;
                }
            } catch (RemoteException e) {
                mService.mController = null;
                Watchdog.getInstance().setActivityController(null);
            }
        }

        synchronized (mService) {
            mService.mBatteryStatsService.noteProcessAnr(app.processName, app.uid);

            // 后台ANR的情况，则直接kill
            if (isSilentANR) {
                app.kill("bg anr", true);
                return;
            }

            // Set the app's notResponding state, and look up the errorReportReceiver
            // 设置app的ANR状态（app.notResponding=true），并查询错误报告receiver
            makeAppNotRespondingLocked(app,
                    activity != null ? activity.shortComponentName : null,
                    annotation != null ? "ANR " + annotation : "ANR",
                    info.toString());

            // 如"persist.sys.enableTraceRename"为true，则重命名trace文件
            boolean enableTraceRename = SystemProperties.getBoolean("persist.sys.enableTraceRename", false);
            //Set the trace file name to app name + current date format to avoid overrinding trace file based on debug flag
            if(enableTraceRename) {
                String tracesPath = SystemProperties.get("dalvik.vm.stack-trace-file", null);
                if (tracesPath != null && tracesPath.length() != 0) {
                    // 一般情况下如果"dalvik.vm.stack-trace-file"定义了，则为/data/anr/traces.txt
                    File traceRenameFile = new File(tracesPath);
                    String newTracesPath;
                    int lpos = tracesPath.lastIndexOf (".");
                    if (-1 != lpos)
                        // 心的traces文件则为/data/anr/traces_进程名_日期_时间.txt
                        newTracesPath = tracesPath.substring (0, lpos) + "_" + app.processName + "_" + mTraceDateFormat.format(new Date()) + tracesPath.substring (lpos);
                    else
                        newTracesPath = tracesPath + "_" + app.processName;

                    traceRenameFile.renameTo(new File(newTracesPath));
                    SystemClock.sleep(1000);
                }
            }
            // Bring up the infamous App Not Responding dialog
            // 弹出ANR对话框
            Message msg = Message.obtain();
            HashMap<String, Object> map = new HashMap<String, Object>();
            msg.what = ActivityManagerService.SHOW_NOT_RESPONDING_UI_MSG;
            msg.obj = map;
            msg.arg1 = aboveSystem ? 1 : 0;
            map.put("app", app);
            if (activity != null) {
                map.put("activity", activity);
            }

            // 向UI线程发送内容为SHOW_NOT_RESPONDING_MSG的消息
            mService.mUiHandler.sendMessage(msg);
        }
    }
```

appNotResponding方法作用如下：

- 输出ANR Reason信息到Events log，即am_anr信息，这条log的时间最接近ANR的触发时间。
- 使用`dumpStackTraces`收集并输出重要进程列表中的各个线程的traces信息，详见2.2。
- 输出ANR的Reason、CPU负载信息以及使用率到main log。
- 将traces信息和 CPU使用情况信息保存到dropbox，即*data/system/dropbox*目录。
- 根据进程类型，来决定直接后台杀掉（后台ANR），还是弹框告知用户。

**firstPids**：用于保存ANR进程及其父进程，system_server进程和persistent的进程；

**lastPids**：用于保存除firstPids外的其他进程；

**nativePids**：指的是/system/bin下的audioserver, cameraserver, mediaserver, sdcard, surfaceflinger等进程；

#### 2.2 AMS.dumpStackTraces(1/2)

``` java
    /**
     * If a stack trace dump file is configured, dump process stack traces.
     * @param clearTraces causes the dump file to be erased prior to the new
     *    traces being written, if true; when false, the new traces will be
     *    appended to any existing file content.
     * @param firstPids of dalvik VM processes to dump stack traces for first
     * @param lastPids of dalvik VM processes to dump stack traces for last
     * @param nativePids optional list of native pids to dump stack crawls
     */
    public static File dumpStackTraces(boolean clearTraces, ArrayList<Integer> firstPids,
            ProcessCpuTracker processCpuTracker, SparseArray<Boolean> lastPids,
            ArrayList<Integer> nativePids) {
        ArrayList<Integer> extraPids = null;

        // Measure CPU usage as soon as we're called in order to get a realistic sampling
        // of the top users at the time of the request.
        // 一旦调用此方法就马上计算CPU使用率以在请求的时候获取top用户的实际采样
        if (processCpuTracker != null) {
            processCpuTracker.init();
            try {
                Thread.sleep(200);
            } catch (InterruptedException ignored) {
            }

            // 测量CPU使用情况
            processCpuTracker.update();

            // We'll take the stack crawls of just the top apps using CPU.
            // 从lastPids中选取CPU使用率top 5的进程，输出这些进程的stacks
            final int N = processCpuTracker.countWorkingStats();
            extraPids = new ArrayList<>();
            for (int i = 0; i < N && extraPids.size() < 5; i++) {
                ProcessCpuTracker.Stats stats = processCpuTracker.getWorkingStats(i);
                if (lastPids.indexOfKey(stats.pid) >= 0) {
                    if (DEBUG_ANR) Slog.d(TAG, "Collecting stacks for extra pid " + stats.pid);

                    // 把正在运行的top 5进程添加到extraPids中
                    extraPids.add(stats.pid);
                } else if (DEBUG_ANR) {
                    Slog.d(TAG, "Skipping next CPU consuming process, not a java proc: "
                            + stats.pid);
                }
            }
        }

        // javatraces写入到tombstone？
        boolean useTombstonedForJavaTraces = false;
        File tracesFile;

        final String tracesDirProp = SystemProperties.get("dalvik.vm.stack-trace-dir", "");
        if (tracesDirProp.isEmpty()) {
            // When dalvik.vm.stack-trace-dir is not set, we are using the "old" trace
            // dumping scheme. All traces are written to a global trace file (usually
            // "/data/anr/traces.txt") so the code below must take care to unlink and recreate
            // the file if requested.
            //
            // This mode of operation will be removed in the near future.
            // 如果dalvik.vm.stack-trace-dir没有配置，就使用旧的dump策略，
            // trace信息写入到全局trace文件中（/data/anr/traces.txt）
            // 这种方式在不久的将来会被移除


            String globalTracesPath = SystemProperties.get("dalvik.vm.stack-trace-file", null);
            if (globalTracesPath.isEmpty()) {
                Slog.w(TAG, "dumpStackTraces: no trace path configured");
                // 没有配置dalvik.vm.stack-trace-file，则返回null
                return null;
            }

            tracesFile = new File(globalTracesPath);
            try {
                // 如果clearTraces为true，则删除已存在的traces文件，并创建新的traces文件
                if (clearTraces && tracesFile.exists()) {
                    tracesFile.delete();
                }

                tracesFile.createNewFile();
                FileUtils.setPermissions(globalTracesPath, 0666, -1, -1); // -rw-rw-rw-
            } catch (IOException e) {
                Slog.w(TAG, "Unable to prepare ANR traces file: " + tracesFile, e);
                return null;
            }
        } else {
            File tracesDir = new File(tracesDirProp);
            // When dalvik.vm.stack-trace-dir is set, we use the "new" trace dumping scheme.
            // Each set of ANR traces is written to a separate file and dumpstate will process
            // all such files and add them to a captured bug report if they're recent enough.
            maybePruneOldTraces(tracesDir);

            // NOTE: We should consider creating the file in native code atomically once we've
            // gotten rid of the old scheme of dumping and lot of the code that deals with paths
            // can be removed.
            // 创建trace文件，格式为anr_yyyy-MM-dd-HH-mm-ss-SSS
            tracesFile = createAnrDumpFile(tracesDir);
            if (tracesFile == null) {
                return null;
            }

            useTombstonedForJavaTraces = true;
        }

        dumpStackTraces(tracesFile.getAbsolutePath(), firstPids, nativePids, extraPids,
                useTombstonedForJavaTraces);
        return tracesFile;
    }
```

如上主要功能：

- 更新CPU的使用率
- 把lastPids中的top 5进程添加到extraPids中
- 确定trace文件路径
  - 如果"dalvik.vm.stack-trace-dir"没有配置，就使用旧的dump策略，trace信息写入到全局trace文件中（*/data/anr/traces.txt*），删除已存在的traces文件，并创建新的traces文件；
  - 如果"dalvik.vm.stack-trace-dir"配置了，创建格式为anr_yyyy-MM-dd-HH-mm-ss-SSS的文件目录。

#### 2.3 AMS.dumpStackTraces(2/2)

``` java
    private static void dumpStackTraces(String tracesFile, ArrayList<Integer> firstPids,
            ArrayList<Integer> nativePids, ArrayList<Integer> extraPids,
            boolean useTombstonedForJavaTraces) {

        // We don't need any sort of inotify based monitoring when we're dumping traces via
        // tombstoned. Data is piped to an "intercept" FD installed in tombstoned so we're in full
        // control of all writes to the file in question.
        final DumpStackFileObserver observer;
        if (useTombstonedForJavaTraces) {
            observer = null;
        } else {
            // Use a FileObserver to detect when traces finish writing.
            // The order of traces is considered important to maintain for legibility.
            observer = new DumpStackFileObserver(tracesFile);
        }

        // We must complete all stack dumps within 20 seconds.
        // 需要在20s内dump所有的堆栈
        long remainingTime = 20 * 1000;
        try {
            if (observer != null) {
                observer.startWatching();
            }

            // First collect all of the stacks of the most important pids.
            // 首先获取最重要进程的stacks
            if (firstPids != null) {
                int num = firstPids.size();
                for (int i = 0; i < num; i++) {
                    if (DEBUG_ANR) Slog.d(TAG, "Collecting stacks for pid "
                            + firstPids.get(i));
                    final long timeTaken;
                    if (useTombstonedForJavaTraces) {
                        // useTombstonedForJavaTraces为true，O版本新加的，见2.3.1
                        timeTaken = dumpJavaTracesTombstoned(firstPids.get(i), tracesFile, remainingTime);
                    } else {
                        // 否则向目标进程发送singal来输出traces，O之前的版本处理逻辑，见2.3.2
                        timeTaken = observer.dumpWithTimeout(firstPids.get(i), remainingTime);
                    }

                    remainingTime -= timeTaken;
                    if (remainingTime <= 0) {
                        Slog.e(TAG, "Aborting stack trace dump (current firstPid=" + firstPids.get(i) +
                            "); deadline exceeded.");
                        return;
                    }

                    if (DEBUG_ANR) {
                        Slog.d(TAG, "Done with pid " + firstPids.get(i) + " in " + timeTaken + "ms");
                    }
                }
            }

            // Next collect the stacks of the native pids
            // 获取native进程的stacks
            if (nativePids != null) {
                for (int pid : nativePids) {
                    if (DEBUG_ANR) Slog.d(TAG, "Collecting stacks for native pid " + pid);
                    final long nativeDumpTimeoutMs = Math.min(NATIVE_DUMP_TIMEOUT_MS, remainingTime);

                    final long start = SystemClock.elapsedRealtime();
                    // 输出native进程的trace，详见2.3.3
                    Debug.dumpNativeBacktraceToFileTimeout(
                            pid, tracesFile, (int) (nativeDumpTimeoutMs / 1000));
                    final long timeTaken = SystemClock.elapsedRealtime() - start;

                    remainingTime -= timeTaken;
                    if (remainingTime <= 0) {
                        Slog.e(TAG, "Aborting stack trace dump (current native pid=" + pid +
                            "); deadline exceeded.");
                        return;
                    }

                    if (DEBUG_ANR) {
                        Slog.d(TAG, "Done with native pid " + pid + " in " + timeTaken + "ms");
                    }
                }
            }

            // Lastly, dump stacks for all extra PIDs from the CPU tracker.
            // dump extraPids中的进程stacks，即lastPids中CPU使用率top 5的进程
            // 此部分逻辑和firstPids基本一样，代码冗余了吧……
            if (extraPids != null) {
                for (int pid : extraPids) {
                    if (DEBUG_ANR) Slog.d(TAG, "Collecting stacks for extra pid " + pid);

                    final long timeTaken;
                    if (useTombstonedForJavaTraces) {
                        // 同firstPids
                        timeTaken = dumpJavaTracesTombstoned(pid, tracesFile, remainingTime);
                    } else {
                        timeTaken = observer.dumpWithTimeout(pid, remainingTime);
                    }

                    remainingTime -= timeTaken;
                    if (remainingTime <= 0) {
                        Slog.e(TAG, "Aborting stack trace dump (current extra pid=" + pid +
                                "); deadline exceeded.");
                        return;
                    }

                    if (DEBUG_ANR) {
                        Slog.d(TAG, "Done with extra pid " + pid + " in " + timeTaken + "ms");
                    }
                }
            }
        } finally {
            if (observer != null) {
                observer.stopWatching();
            }
        }
    }
```

如上方法主要功能为：

- 收集**firstPids**进程的stacks
  - firstPids中首先dump的是发生ANR的进程。
  - 其次是system_server进程。
  - 最后是mLruProcesses中的persistent进程。
- 收集**nativePids**（Native）进程的stacks
  - /system/bin下的audioserver, cameraserver, mediaserver, sdcard, surfaceflinger等进程。
- 收集**extraPids**（lastPids中CPU使用率top 5）进程的stacks

*以上三部分需要在20s内dump完成。*

##### 2.3.1 dumpJavaTracesTombstoned

``` java
    /**
     * Dump java traces for process {@code pid} to the specified file. If java trace dumping
     * fails, a native backtrace is attempted. Note that the timeout {@code timeoutMs} only applies
     * to the java section of the trace, a further {@code NATIVE_DUMP_TIMEOUT_MS} might be spent
     * attempting to obtain native traces in the case of a failure. Returns the total time spent
     * capturing traces.
     */
    private static long dumpJavaTracesTombstoned(int pid, String fileName, long timeoutMs) {
        final long timeStart = SystemClock.elapsedRealtime();
        if (!Debug.dumpJavaBacktraceToFileTimeout(pid, fileName, (int) (timeoutMs / 1000))) {
            // 调用到dumpNativeBacktraceToFileTimeout，详见2.3.3
            Debug.dumpNativeBacktraceToFileTimeout(pid, fileName,
                    (NATIVE_DUMP_TIMEOUT_MS / 1000));
        }
```

此方法在Android 8.1.0上才加上的，8.0.0版本还没有，8.1.0之前对于firstPids和extraPids中进程堆栈信息的收集都是直接调用`dumpWithTimeout`方法，8.1.0以后将要废弃；

##### 2.3.2 dumpWithTimeout（将要废弃）

``` java
    /**
     * Legacy code, do not use. Existing users will be deleted.
     *
     * @deprecated 将要废弃的方法
     */
    @Deprecated
    public static class DumpStackFileObserver extends FileObserver {
        ... ...
        public long dumpWithTimeout(int pid, long timeout) {
            // 发送signal来输出traces
            sendSignal(pid, SIGNAL_QUIT);
            final long start = SystemClock.elapsedRealtime();

            // timeout为20s，TRACE_DUMP_TIMEOUT_MS为10s，取小则为10s
            final long waitTime = Math.min(timeout, TRACE_DUMP_TIMEOUT_MS);
            synchronized (this) {
                try {
                    // 直到写关闭，或者超时
                    wait(waitTime); // Wait for traces file to be closed.
                } catch (InterruptedException e) {
                    Slog.wtf(TAG, e);
                }
            }

            ... ...

            final long end = SystemClock.elapsedRealtime();
            mClosed = false;

            return (end - start);
        }
    }
```

##### 2.3.3 dumpNativeBacktraceToFileTimeout

[platform/frameworks/base/core/jni/android_os_Debug.cpp](https://android.googlesource.com/platform/frameworks/base/+/android-cts-8.1_r4/core/jni/android_os_Debug.cpp)

**dumpNativeBacktraceToFileTimeout()**

``` c++
static jboolean android_os_Debug_dumpJavaBacktraceToFileTimeout(JNIEnv* env, jobject clazz,
        jint pid, jstring fileName, jint timeoutSecs) {
    const bool ret =  dumpTraces(env, pid, fileName, timeoutSecs, kDebuggerdJavaBacktrace);
    return ret ? JNI_TRUE : JNI_FALSE;
}

static jboolean android_os_Debug_dumpNativeBacktraceToFileTimeout(JNIEnv* env, jobject clazz,
        jint pid, jstring fileName, jint timeoutSecs) {
    const bool ret = dumpTraces(env, pid, fileName, timeoutSecs, kDebuggerdNativeBacktrace);
    return ret ? JNI_TRUE : JNI_FALSE;
}
```

**dumpTraces()**

``` java
static bool dumpTraces(JNIEnv* env, jint pid, jstring fileName, jint timeoutSecs,
                       DebuggerdDumpType dumpType) {
    const ScopedUtfChars fileNameChars(env, fileName);
    if (fileNameChars.c_str() == nullptr) {
        return false;
    }
    // 打开/data/anr/anr_yyyy-MM-dd-HH-mm-ss-SSS
    android::base::unique_fd fd(open(fileNameChars.c_str(),
                                     O_CREAT | O_WRONLY | O_NOFOLLOW | O_CLOEXEC | O_APPEND,
                                     0666));
    if (fd < 0) {
        fprintf(stderr, "Can't open %s: %s\n", fileNameChars.c_str(), strerror(errno));
        return false;
    }
    // 继续调用dump_backtrace_to_file_timeout
    return (dump_backtrace_to_file_timeout(pid, dumpType, timeoutSecs, fd) == 0);
}
```

[platform/system/core/debuggerd/client/debuggerd_client.cpp](https://android.googlesource.com/platform/system/core/+/android-cts-8.1_r4/debuggerd/client/debuggerd_client.cpp)

**dump_backtrace_to_file_timeout()**

``` java
int dump_backtrace_to_file_timeout(pid_t tid, DebuggerdDumpType dump_type, int timeout_secs,
                                   int fd) {
  android::base::unique_fd copy(dup(fd));
  if (copy == -1) {
    return -1;
  }
  int timeout_ms = timeout_secs > 0 ? timeout_secs * 1000 : 0;
  return debuggerd_trigger_dump(tid, dump_type, timeout_ms, std::move(copy)) ? 0 : -1;
}
```

**debuggerd_trigger_dump**

``` cpp
bool debuggerd_trigger_dump(pid_t pid, DebuggerdDumpType dump_type, unsigned int timeout_ms,
                            unique_fd output_fd) {
  LOG(INFO) << "libdebuggerd_client: started dumping process " << pid;
  unique_fd sockfd;
  const auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
  auto time_left = [&end]() { return end - std::chrono::steady_clock::now(); };
  auto set_timeout = [timeout_ms, &time_left](int sockfd) {
    if (timeout_ms <= 0) {
      return sockfd;
    }
    auto remaining = time_left();
    if (remaining < decltype(remaining)::zero()) {
      LOG(ERROR) << "libdebuggerd_client: timeout expired";
      return -1;
    }
    struct timeval timeout;
    populate_timeval(&timeout, remaining);
    if (setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) != 0) {
      PLOG(ERROR) << "libdebuggerd_client: failed to set receive timeout";
      return -1;
    }
    if (setsockopt(sockfd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout)) != 0) {
      PLOG(ERROR) << "libdebuggerd_client: failed to set send timeout";
      return -1;
    }
    return sockfd;
  };
  sockfd.reset(socket(AF_LOCAL, SOCK_SEQPACKET, 0));
  if (sockfd == -1) {
    PLOG(ERROR) << "libdebugger_client: failed to create socket";
    return false;
  }
  if (socket_local_client_connect(set_timeout(sockfd.get()), kTombstonedInterceptSocketName,
                                  ANDROID_SOCKET_NAMESPACE_RESERVED, SOCK_SEQPACKET) == -1) {
    PLOG(ERROR) << "libdebuggerd_client: failed to connect to tombstoned";
    return false;
  }
  InterceptRequest req = {.pid = pid, .dump_type = dump_type};
  if (!set_timeout(sockfd)) {
    PLOG(ERROR) << "libdebugger_client: failed to set timeout";
    return false;
  }
  // Create an intermediate pipe to pass to the other end.
  unique_fd pipe_read, pipe_write;
  if (!Pipe(&pipe_read, &pipe_write)) {
    PLOG(ERROR) << "libdebuggerd_client: failed to create pipe";
    return false;
  }
  std::string pipe_size_str;
  int pipe_buffer_size = 1024 * 1024;
  if (android::base::ReadFileToString("/proc/sys/fs/pipe-max-size", &pipe_size_str)) {
    pipe_size_str = android::base::Trim(pipe_size_str);
    if (!android::base::ParseInt(pipe_size_str.c_str(), &pipe_buffer_size, 0)) {
      LOG(FATAL) << "failed to parse pipe max size '" << pipe_size_str << "'";
    }
  }
  if (fcntl(pipe_read.get(), F_SETPIPE_SZ, pipe_buffer_size) != pipe_buffer_size) {
    PLOG(ERROR) << "failed to set pipe buffer size";
  }
  if (send_fd(set_timeout(sockfd), &req, sizeof(req), std::move(pipe_write)) != sizeof(req)) {
    PLOG(ERROR) << "libdebuggerd_client: failed to send output fd to tombstoned";
    return false;
  }
  // Check to make sure we've successfully registered.
  InterceptResponse response;
  ssize_t rc =
      TEMP_FAILURE_RETRY(recv(set_timeout(sockfd.get()), &response, sizeof(response), MSG_TRUNC));
  if (rc == 0) {
    LOG(ERROR) << "libdebuggerd_client: failed to read response from tombstoned: timeout reached?";
    return false;
  } else if (rc != sizeof(response)) {
    LOG(ERROR)
        << "libdebuggerd_client: received packet of unexpected length from tombstoned: expected "
        << sizeof(response) << ", received " << rc;
    return false;
  }
  if (response.status != InterceptStatus::kRegistered) {
    LOG(ERROR) << "libdebuggerd_client: unexpected registration response: "
               << static_cast<int>(response.status);
    return false;
  }
    // 根据dump_type类型发送信号（SIGQUIT : DEBUGGER_SIGNAL）
  if (!send_signal(pid, dump_type)) {
    return false;
  }
  rc = TEMP_FAILURE_RETRY(recv(set_timeout(sockfd.get()), &response, sizeof(response), MSG_TRUNC));
  if (rc == 0) {
    LOG(ERROR) << "libdebuggerd_client: failed to read response from tombstoned: timeout reached?";
    return false;
  } else if (rc != sizeof(response)) {
    LOG(ERROR)
      << "libdebuggerd_client: received packet of unexpected length from tombstoned: expected "
      << sizeof(response) << ", received " << rc;
    return false;
  }
  if (response.status != InterceptStatus::kStarted) {
    response.error_message[sizeof(response.error_message) - 1] = '\0';
    LOG(ERROR) << "libdebuggerd_client: tombstoned reported failure: " << response.error_message;
    return false;
  }
  // Forward output from the pipe to the output fd.
  while (true) {
    auto remaining_ms = std::chrono::duration_cast<std::chrono::milliseconds>(time_left()).count();
    if (timeout_ms <= 0) {
      remaining_ms = -1;
    } else if (remaining_ms < 0) {
      LOG(ERROR) << "libdebuggerd_client: timeout expired";
      return false;
    }
    struct pollfd pfd = {
        .fd = pipe_read.get(), .events = POLLIN, .revents = 0,
    };
    rc = poll(&pfd, 1, remaining_ms);
    if (rc == -1) {
      if (errno == EINTR) {
        continue;
      } else {
        PLOG(ERROR) << "libdebuggerd_client: error while polling";
        return false;
      }
    } else if (rc == 0) {
      LOG(ERROR) << "libdebuggerd_client: timeout expired";
      return false;
    }
    char buf[1024];
    rc = TEMP_FAILURE_RETRY(read(pipe_read.get(), buf, sizeof(buf)));
    if (rc == 0) {
      // Done.
      break;
    } else if (rc == -1) {
      PLOG(ERROR) << "libdebuggerd_client: error while reading";
      return false;
    }
    if (!android::base::WriteFully(output_fd.get(), buf, rc)) {
      PLOG(ERROR) << "libdebuggerd_client: error while writing";
      return false;
    }
  }
  LOG(INFO) << "libdebuggerd_client: done dumping process " << pid;
  return true;
}
```

**send_signal**

``` cpp
static bool send_signal(pid_t pid, const DebuggerdDumpType dump_type) {
    // 根据dump_type的类型选择发送SIGQUIT信号还是DEBUGGER_SIGNAL信号
  const int signal = (dump_type == kDebuggerdJavaBacktrace) ? SIGQUIT : DEBUGGER_SIGNAL;
  sigval val;
  val.sival_int = (dump_type == kDebuggerdNativeBacktrace) ? 1 : 0;
  if (sigqueue(pid, signal, val) != 0) {
    PLOG(ERROR) << "libdebuggerd_client: failed to send signal to pid " << pid;
    return false;
  }
  return true;
}
```

可以看到最终是调用`debuggerd_trigger_dump`（在debuggerd_client.cpp中处理），随后会向debuggerd发送命令，debuggerd相关部分此文暂不分析。

### 3 总结

ANR发生时系统会输出一些关键信息：

- 将am_anr信息,输出到EventLog.(ANR开始起点看EventLog)；
- 获取重要进程trace信息，保存到*/data/anr/anr_yyyy-MM-dd-HH-mm-ss-SSS*
  - Java进程的traces;
  - Native进程的traces;
- ANR reason以及CPU使用情况信息，输出到main log；
- 将traces信息和 CPU使用情况信息保存到dropbox，即*data/system/dropbox*目录；
- 根据进程类型，来决定直接后台杀掉（后台ANR），还是弹框告知用户；

在输出trace的时候，Android 8.1.0新加了一个`useTombstonedForJavaTraces`属性，Java进程的traces通过`kill -3 [pid]`获取，Native进程的traces通过`debuggerd -b [pid]`获取，`kill -3`命令需要虚拟机的支持，所以无法输出Native进程traces.而`debuggerd -b [pid]`也可用于Java进程，但信息量远没有kill -3多。 ANR信息最为重要的是dropbox信息（比如data_app_anr@1523447716728.txt.gz）。