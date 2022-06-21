---
title: Performance_debug
date: 2018-02-08 16:26:32
tags: [performance]
categories: Android
copyright: true
top:
---



> 常见性能调试方法；

<!--more-->

### CPU performance mode

我们知道引起性能问题的因素很多，通常为了初步确认该问题是否是系统处理能力不足而导致的，我们可以让系统运行在 performance mode 下测试该问题是否可以重现，从而进行初步的诊断；

``` shell
# 4 CPUs
adb shell root
adb shell setenforce 0
adb shell stop thermal-engine
adb shell rmmod core_ctl
adb shell "echo 1 > /sys/devices/system/cpu/cpu1/online"
adb shell "echo 1 > /sys/devices/system/cpu/cpu2/online"
adb shell "echo 1 > /sys/devices/system/cpu/cpu3/online"
adb shell "echo performance > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu1/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu2/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu3/cpufreq/scaling_governor"

# 8 CPUs
adb shell root
adb shell setenforce 0
adb shell stop thermal-engine
adb shell rmmod core_ctl
adb shell "echo 1 > /sys/devices/system/cpu/cpu1/online"
adb shell "echo 1 > /sys/devices/system/cpu/cpu2/online"
adb shell "echo 1 > /sys/devices/system/cpu/cpu3/online"
adb shell "echo 1 > /sys/devices/system/cpu/cpu4/online"
adb shell "echo 1 > /sys/devices/system/cpu/cpu5/online"
adb shell "echo 1 > /sys/devices/system/cpu/cpu6/online"
adb shell "echo 1 > /sys/devices/system/cpu/cpu7/online"
adb shell "echo performance > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu1/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu2/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu3/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu4/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu5/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu6/cpufreq/scaling_governor"
adb shell "echo performance > /sys/devices/system/cpu/cpu7/cpufreq/scaling_governor"
```

### GPU performance mode

如果我们发现 GPU draw 得太慢并且 GPU 的 clock 不是运行在比较高的频率的情况下，我们可以让 GPU 运行在 performance mode 下，测试该问题是否可以重现；

``` shell
adb shell root
adb shell setenforce 0
adb shell stop thermal-engine
adb shell echo 0 > /sys/class/kgsl/kgsl-3d0/bus_split
adb shell echo performance > /sys/class/kgsl/kgsl-3d0/devfreq/governor
adb shell echo 1 > /sys/class/kgsl/kgsl-3d0/force_bus_on
adb shell echo 1 > /sys/class/kgsl/kgsl-3d0/force_rail_on
adb shell echo 1 > /sys/class/kgsl/kgsl-3d0/force_clk_on
adb shell echo 1000000 > /sys/class/kgsl/kgsl-3d0/idle_timer
```

### DDR at max

有时 DDR 频率过低也会引起性能问题，所以我们可以让 DDR 工作在比较高的频率下测试是否还可以重现该问题；

``` shell
adb shell "echo 1 > /sys/kernel/debug/msm-bus-dbg/shell-client/mas"
adb shell "echo 512 > /sys/kernel/debug/msm-bus-dbg/shell-client/slv"
adb shell "echo 0 > /sys/kernel/debug/msm-bus-dbg/shell-client/ab"
adb shell "echo 16 * DDR max frequency > /sys/kernel/debug/msm-bus-dbg/shell-client/ib"
adb shell "echo 1 > /sys/kernel/debug/msm-bus-dbg/shell-client/update_request"
```

### 获取 thermal-engine debug log

``` shell
adb shell stop thermal-engine
adb shell thermal-engine --debug &
adb shell logcat -v time -s ThermalEngine >your path
```

### 打开 perfd debug log

``` shell
$ adb root 
$ adb disable-verity 
$ adb reboot 
$ adb root 
$ adb remount 
$ adb pull /system/build.prop
# 在build.prop 中增加debug.trace.perf=1
$ adb shell "echo ‘debug.trace.perf=1’ >> /system/build.prop" 
$ adb push build.prop /system/
$ adb shell chmod 0644 /system/build.prop
$ adb shell sync
$ adb shell reboot
# 或者
$ adb shell root
$ adb shell setenforce 0
$ adb shell setprop debug.trace.perf 1
$ adb shell stop perfd
$ adb shell start perfd
```

perfd 的 log 就会显示在 logcat 和 systrace 中；

``` shell
$ adb logcat | grep PERF 
02-07 20:15:46.055 726 726 E ANDR-PERF-MPCTL: perf_lock_acq: client_pid=1747, client_tid=1790, inupt handle=0, duration=2000 ms, num_args=10, list=0x40C00000 0x1 0x40804000 0xFFF 0x40804100 0xFFF 0x40800000 0xFFF 0x40800100 0xFFF 
02-07 20:15:46.056 726 756 E ANDR-PERF-MPCTL: Invalid profile no. 0, total profiles 0 only 
02-07 20:15:47.500 726 726 E ANDR-PERF-MPCTL: perf_lock_acq: client_pid=1747, client_tid=3031, inupt handle=0, duration=2147483647 ms, num_args=10, list=0x40C00000 0x1 0x40804000 0xFFF 0x40804100 0xFFF 0x40800000 0xFFF 0x40800100 0xFFF 
02-07 20:15:47.501 726 756 E ANDR-PERF-MPCTL: Invalid profile no. 0, total profiles 0 only 
02-07 20:15:47.977 726 726 E ANDR-PERF-MPCTL: perf_lock_acq: client_pid=1747, client_tid=2093, inupt handle=0, duration=2147483647 ms, num_args=10, list=0x40C00000 0x1 0x40804000 0xFFF 0x40804100 0xFFF 0x40800000 0xFFF 0x40800100 0xFFF 
02-07 20:15:47.977 726 756 E ANDR-PERF-MPCTL: Invalid profile no. 0, total profiles 0 only 
02-07 20:15:58.839 726 726 E ANDR-PERF-MPCTL: perf_lock_acq: client_pid=701, client_tid=2694, inupt handle=0, duration=0 ms, num_args=2, list=0x101 0x20E 
02-07 20:15:58.840 726 756 E ANDR-PERF-MPCTL: Invalid profile no. 0, total profiles 0 only 
```



### 查看可用频率

``` shell
adb shell cat sys/devices/system/cpu/cpufreq/policy0/scaling_available_frequencies
633600 902400 1113600 1401600 1536000 1747200 1843200
adb shell cat sys/devices/system/cpu/cpufreq/policy4/scaling_available_frequencies
1113600 1401600 1747200 1958400 2150400 2208000
```

### 开机启动

#### 获得正确 log

对于开机启动慢的问题的 debug，我们需要 kernel log，event log，logcat log，请用如下命令获取 log：

``` shell
$ adb wait-for-device root
$ adb wait-for-device
$ adb shell dmesg > dmesg.txt
$ adb logcat -b events -d > logcat_events.txt
$ adb logcat -v thread time -d *:V > logcat.txt
```

#### log 分析

- kernel log

  我们知道 kernel 可以分为两部分，一是 boot loader 部分，一是加载 driver 部分；

  - Boot loader 部分

    我们可以用 Bootloader 的 KPI 来计算 bootloader 的所用的时间，Bootloader KPI 的时间会输出到 demsg 如:

    ``` shell
    [ 0.524325] KPI: Bootloader start count = 20820 //A 为LK 开始时
    [ 0.524334] KPI: Bootloader end count = 231148//B 为LK 结束时间
    [ 0.524341] KPI: Bootloader display count = 36470
    [ 0.524348] KPI: Bootloader load kernel count = 2232
    [ 0.524356] KPI: Kernel MPM timestamp = 254555 // C bootloader 完成时间
    [ 0.524363] KPI: Kernel MPM Clock frequency = 32768 //D clock.
    NHLOS 时间: A/D=20820/32768=0.63
    LK 时间: (B-A)/D=( 231148-20820)=6.41s
    Bootloader 时间:C/D-kmsg(C)=254555/32768-0.52=7.24s
    ```

    如果 boot loader 的时间太长,我们需要检查其是否正常；

  - Kernel driver 部分

    如果从 kernel 初始化到 Zygote 启动时间太长，我们可以打开每个 module 的加载时间，然后找到其耗时比较多的module并优化，下面这个patch 可以打开module ini的时间：

    ``` c++
    diff --git a/init/main.c b/init/main.c
    index 7af2174..2d11927 100644
    --- a/init/main.c
    +++ b/init/main.c
    @@ -785,7 +785,7 @@ int __init_or_module do_one_initcall(initcall_t fn)
    if (initcall_blacklisted(fn))
    return -EPERM;
    - if (initcall_debug)+ if (1)
    ret = do_one_initcall_debug(fn);
    else
    ret = fn();
    // 输出log 如:
    initcall msm_serial_hsl_init+0x0/0xac returned 0 after 262555 usecs
    initcall fts_driver_init+0x0/0x20 returned 0 after 171317 usecs
    initcall ufs_qcom_phy_qmp_20nm_driver_init+0x0/0x20 returned 0 after 2572 usecs
    initcall ufs_qcom_phy_qmp_14nm_driver_init+0x0/0x24 returned 0 after 1727 usecs
    initcall ufs_qcom_phy_qmp_v3_driver_init+0x0/0x24 returned 0 after 1010 usecs
    initcall ufs_qcom_phy_qrbtc_v2_driver_init+0x0/0x24 returned 0 after 838 usecs
    ```

- User space log

  系统启动过程中，我们可以获取 event log 得到 boot event，其含义如下: 

  ``` shell
  boot_progress_start // user space 开始时间
  boot_progress_preload_start // Zygote 进程 preload 开始时间
  boot_progress_preload_end // Zygote 进程 preload 结束时间
  boot_progress_system_run // System server 开始运行时间
  boot_progress_pms_start // Package Scan 开始
  boot_progress_pms_system_scan_start // System 目录开始 scan
  boot_progress_pms_data_scan_start //data 目录开始scan
  boot_progress_pms_scan_end // package scan 结束时
  boot_progress_pms_ready // package manager ready
  boot_progress_ams_ready // Activity manager ready,这个事件之后便会启动home Activity。
  boot_progress_enable_screen // HomeActivity 启动完毕
  ```

  当 HomeActivity 启动完毕后，系统将检查当前所有可见的 window 是否画完，如果所有的 window(包括wallpaper, Keyguard 等) 都已经画好，系统会设置属性 service.bootanim.exit 值为1，而 bootanimation 在检查到 service.bootanim.exit 属性值为 1 时，便会结束 bootanimation，从而显示 home 界面。所以我们需要辅助 logcat log 来检查 bootaimation 束是否正常,如下面的 log：

  ``` shell
  07-21 14:21:36.716 1455 1607 I boot_progress_enable_screen: 21242
  07-21 14:21:43.230 1014 1772 D BootAnimation: media player is completed.
  ```

  这里从 Homeactivity 启动完毕到 bootanimation 退出用了大约 6.5s 的时间，我们需要检查这个时间是否正常是否还有优化的空间；

### APP 冷启动

对于启动慢的问题，我们需要 logcat，kernel 和 systrace log，在获取 systrace 之前，需要打开 perfd log（Enable perfd log）；

对于冷启动，主要分析点如下:

- 检查是否正确 enable 了 launch boost 功能

  在 QCOM 所有平台中，对于冷启动都默认 enable 了 launch boost 功能。即在冷启动时，CPU 将运行在最大频率上，并且保持 2s；

- 启动时间分解

  我们知道，APP 在冷启动时，一般的操作是：点击 launcher 上 APP 的图标 -〉APP 启动，这一过程在 systrace 中可以分解为：

  Launcher 收到 touch event -> Launcher pause -> new process(APP 进程) -> bindApplication -> activityStart-> Choreographer#doFrame()，在 systrace 中可以看到这些操作，我们可以看看每部分的时间是否合理，如果不合理则检查相关部分的代码，看看是否有可以优化的空间；





