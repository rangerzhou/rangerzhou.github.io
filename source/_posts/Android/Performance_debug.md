---
title: Performance_debug
date: 2018-02-08 16:26:32
tags: [performance]
categories: Android
copyright: true
top:
---

[Perflock in Android O](https://createpoint.qti.qualcomm.com/search/contentdocument/stream/213761?refererRoute=search%2Fglobal%2FsearchArgs%2Fq%7C%7Cclk_scaling%7C%7Crows%7C%7C10%7C%7CsortField%7C%7Cscore%7C%7CsortOrder%7C%7Cdesc&dcn=80-NT384-2¤tPage=1&itemTotalIndex=4) 

<!--more-->

打印log：

adb root 
adb disable-verity 
adb reboot 
adb root 
adb remount 
adb shell "echo ‘debug.trace.perf=1’ >> /system/build.prop" 
adb reboot 

adb shell 
logcat | grep PERF 

``` shell
02-07 20:15:46.055 726 726 E ANDR-PERF-MPCTL: perf_lock_acq: client_pid=1747, client_tid=1790, inupt handle=0, duration=2000 ms, num_args=10, list=0x40C00000 0x1 0x40804000 0xFFF 0x40804100 0xFFF 0x40800000 0xFFF 0x40800100 0xFFF 
02-07 20:15:46.056 726 756 E ANDR-PERF-MPCTL: Invalid profile no. 0, total profiles 0 only 
02-07 20:15:47.500 726 726 E ANDR-PERF-MPCTL: perf_lock_acq: client_pid=1747, client_tid=3031, inupt handle=0, duration=2147483647 ms, num_args=10, list=0x40C00000 0x1 0x40804000 0xFFF 0x40804100 0xFFF 0x40800000 0xFFF 0x40800100 0xFFF 
02-07 20:15:47.501 726 756 E ANDR-PERF-MPCTL: Invalid profile no. 0, total profiles 0 only 
02-07 20:15:47.977 726 726 E ANDR-PERF-MPCTL: perf_lock_acq: client_pid=1747, client_tid=2093, inupt handle=0, duration=2147483647 ms, num_args=10, list=0x40C00000 0x1 0x40804000 0xFFF 0x40804100 0xFFF 0x40800000 0xFFF 0x40800100 0xFFF 
02-07 20:15:47.977 726 756 E ANDR-PERF-MPCTL: Invalid profile no. 0, total profiles 0 only 
02-07 20:15:58.839 726 726 E ANDR-PERF-MPCTL: perf_lock_acq: client_pid=701, client_tid=2694, inupt handle=0, duration=0 ms, num_args=2, list=0x101 0x20E 
02-07 20:15:58.840 726 756 E ANDR-PERF-MPCTL: Invalid profile no. 0, total profiles 0 only 
```



查看可用频率：

``` shell
adb shell cat sys/devices/system/cpu/cpufreq/policy0/scaling_available_frequencies
633600 902400 1113600 1401600 1536000 1747200 1843200
adb shell cat sys/devices/system/cpu/cpufreq/policy4/scaling_available_frequencies
1113600 1401600 1747200 1958400 2150400 2208000
```



