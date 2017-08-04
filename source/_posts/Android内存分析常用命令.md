---
title: Android内存分析常用命令
copyright: true
date: 2017-08-04 14:13:00
tags:
categories: Android
---

## 1. 概述

### 1.1 内存指标

| 简称   | 全称                    | 含义          | 备注                    |
| ---- | --------------------- | ----------- | --------------------- |
| USS  | Unique Set Size       | 进程独自占用的物理内存 | 不包含共享库占用的内存           |
| PSS  | Proportional Set Size | 实际使用物理内存    | PSS = USS + 按比例包含共享库  |
| RSS  | Resident Set Size     | 实际使用物理内存    | RSS = USS + 包含共享库     |
| VSS  | Virtual Set Size      | 虚拟耗用内存      | VSS = RSS + 未分配实际物理内存 |

内存的大小关系：VSS >= RSS >= PSS >= USS

<!--more-->

### 1.2 常用内存分析命令

- dumpsys meminfo
- procrank
- cat /proc/meminfo
- free
- vmstat

## 2. 命令介绍

### 2.1 dumpsys meminfo

示例：

``` shell
root:/ $ dumpsys meminfo
Applications Memory Usage (in Kilobytes):
Uptime: 180509595 Realtime: 360504278

Total PSS by process:// 以process划分
    275,490K: com.tencent.mm (pid 22794 / activities)
    232,706K: com.ss.android.article.news (pid 31871 / activities)
    193,179K: system (pid 1490)
    127,019K: com.android.systemui (pid 2244)
     ... ...
        235K: debuggerd:signaller (pid 421)

Total PSS by OOM adjustment:// 以oom划分，详细列举所有类别的进程
    235,668K: Native
         33,549K: surfaceflinger (pid 510)
         30,780K: mm-qcamera-daemon (pid 721)
         26,520K: logd (pid 407)
         24,593K: cameraserver (pid 691)
         16,488K: audioserver (pid 690)
          6,543K: rild (pid 700)
          ... ...
            302K: debuggerd64:signaller (pid 420)
            242K: debuggerd (pid 416)
            235K: debuggerd:signaller (pid 421)
    451,182K: Persistent
        193,179K: system (pid 1490)
        127,019K: com.android.systemui (pid 2244)
         39,451K: com.android.phone (pid 2433)
         ... ...
          3,835K: com.goodix.fingerprint (pid 2949)
    280,636K: Foreground
        232,706K: com.ss.android.article.news (pid 31871 / activities)
         28,921K: com.miui.securitycenter.remote (pid 2866)
         19,009K: android.process.media (pid 5923)
    152,230K: Visible
         28,030K: com.miui.powerkeeper:service (pid 3127)
         25,210K: com.miui.analytics (pid 17193)
         ... ...
          3,868K: com.android.smspush (pid 18933)
    158,454K: Perceptible
         78,495K: com.miui.home (pid 14217 / activities)
         52,592K: com.iflytek.inputmethod (pid 3767)
         15,101K: com.lbe.security.miui (pid 29341)
         12,266K: com.iflytek.inputmethod.assist (pid 3826)
    352,286K: Backup
        275,490K: com.tencent.mm (pid 22794 / activities)
         76,796K: com.tencent.mm (pid 17995 / activities)
    151,358K: A Services
        105,572K: com.tencent.mobileqq (pid 4675)
         24,515K: com.tencent.mobileqq:MSF (pid 17397)
         21,271K: com.tencent.mm:push (pid 31932)
     24,835K: Previous
         24,835K: com.tencent.mm:support (pid 16594)
    168,128K: B Services
         54,639K: com.netease.cloudmusic (pid 6644 / activities)
         23,475K: com.tencent.mm:push (pid 8805)
         ... ...
         23,439K: com.android.email (pid 23126)
    236,648K: Cached
         47,188K: com.android.incallui (pid 4259)
         28,853K: com.tencent.mm:support (pid 16231)
         ... ...
          4,288K: com.miui.systemAdSolution:remote (pid 27446)

Total PSS by category:// 以category划分
    501,434K: Dalvik
    394,423K: Native
    ... ...
         68K: .jar mmap
          0K: Cursor
          0K: Other mtrack
// 整体情况
Total RAM: 2,912,956K (status normal)
 Free RAM:   696,100K (  236,648K cached pss +   438,916K cached kernel +    20,536K free)
 Used RAM: 2,320,061K (1,974,777K used pss +   345,284K kernel)
 Lost RAM:    40,646K
     ZRAM:   155,624K physical used for   458,356K in swap (1,048,572K total swap)
   Tuning: 192 (large 512), oom   322,560K, restore limit   107,520K (high-end-gfx)
```

`dumpsys meminfo`输出结果分为4部分：

- PSS by process: 以进程的PSS从大到小一次排序显示，每行显示一个进程
- PSS by OOM adjustment: 分别显示每类的进程情况
- PSS by category: 各类进程的总PSS请客
- Total: 总内存、剩余内存、已用内存、其他

也可输出单个pid或者package的进程信息：

``` shell
dumpsys meminfo 17995 // 输出进程17995的信息
dumpsys memifno --package com.tencent.mm // 输出微信的进程，可能包含多个进程
```

### 2.2 procrank

`procrank`命令可以获取所有进程的内存使用的排行榜，排行是按照Pss的大小排序，相比`dumpsys meminfo`命令，能输出更详细的VSS/RSS/PSS/USS内存指标。由于所用手机被精简，不再上例子。

### 2.3 cat /proc/meminfo 

示例：

``` shell
root:/ # cat proc/meminfo
MemTotal:        2912956 kB	// RAM可用总大小（物理总内存减去系统须留和内核二进制代码大小）
MemFree:           37836 kB	// RAM未使用的大小
MemAvailable:    1306036 kB	// 可用RAM（这个和MemFree什么区别？）
Buffers:           90524 kB	// 用于文件缓存
Cached:          1299636 kB	// 用于高速缓存
SwapCached:            4 kB	// 用于swap缓存
Active:          1170284 kB	// 活跃使用状态，记录最近使用过的内存，通常不回收用于其他目的
Inactive:        1118896 kB	// 非活跃使用状态，记录最近并没有使用过的内存，能够被回收用于其他目的
Active(anon):     539472 kB	// Active = Active(anon) + Active(file)
Inactive(anon):   509116 kB	// Inactive = Inactive(anon) + Inactive(file)
Active(file):     630812 kB
Inactive(file):   609780 kB
Unevictable:      145712 kB
Mlocked:          145756 kB
SwapTotal:       1048572 kB	// swap总大小
SwapFree:        1042296 kB	// swap可用大小
Dirty:                76 kB	// 等待往磁盘回写的大小
Writeback:             0 kB	// 正在往磁盘回写的大小
AnonPages:       1044784 kB	// 匿名页，用户控件的页表，没有对应的文件
Mapped:           636296 kB	// 文件通过mmap分配的内存，用于map设备、文件或者库
Shmem:              4136 kB
Slab:             190232 kB	// kernel数据结构的缓存大小，Slab=SReclaimable+SUnreclaim
SReclaimable:      84044 kB	// 可回收的slab的大小
SUnreclaim:       106188 kB	// 不可回收slab的大小
KernelStack:       39904 kB
PageTables:        45688 kB	// 以最低的页表级
NFS_Unstable:          0 kB	// 不稳定页表的大小
Bounce:                0 kB
WritebackTmp:          0 kB
CommitLimit:     2505048 kB
Committed_AS:   81745600 kB	// 评估完成的工作量，代表最糟糕case下的值，该值也包含swap内存
VmallocTotal:   258998208 kB // 总分配的虚拟地址空间
VmallocUsed:      183136 kB	// 已使用的虚拟地址空间
VmallocChunk:   258733028 kB // 虚拟地址空间可用的最大连续内存块
```

### 2.4 free

示例：

``` shell
root:/ # free
                total        used        free      shared     buffers
Mem:       2982866944  2928361472    54505472     4001792    96804864
-/+ buffers/cache:     2831556608   151310336
Swap:      1073737728     8151040  1065586688
```

`free` 比较简单轻量，用于查看可用内存，缺省单位KB，专注于查看剩余内存情况，数据来源于/proc/meminfo。

- Mem行：total = used + free;
- -/+ buffers行：used = used(Mem) - buffers(Mem); free = free(Mem) + buffers(Mem);

### 2.5 vmstat

`vmstat`命令不仅可以查看内存情况，还可以查看进程运行队列、系统切换、CPU时间占比等情况，而且是周期性的动态输出。

示例：

``` shell
root:/ # vmstat
procs -----------memory---------- ---swap-- -----io---- -system-- ----cpu----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa
 5  0   7960 166124  96660 1286732   1    1   331    46    0  269  3  2 94  0
```

参数列总共15个参数，分为4大类：

- procs(进程)
  - r: Running队列中进程数量
  - b: IO wait的进程数量
- memory(内存)
  - free: 可用内存大小
  - mapped：mmap映射的内存大小
  - anon: 匿名内存大小
  - slab: slab的内存大小
- system(系统)
  - in: 每秒的中断次数(包括时钟中断)
  - cs: 每秒上下文切换的次数
- cpu(处理器)
  - us: user time
  - ni: nice time
  - sy: system time
  - id: idle time
  - wa: iowait time
  - ir: interrupt time

## 总结

1. `dumpsys meminfo`适用场景： 查看进程的oom adj，或者dalvik/native等区域内存情况，或者某个进程或apk的内存情况，功能非常强大；
2. `procrank`适用场景： 查看进程的VSS/RSS/PSS/USS各个内存指标；
3. `cat /proc/meminfo`适用场景： 查看系统的详尽内存信息，包含内核情况；
4. `free`适用场景： 只查看系统的可用内存；
5. `vmstat`适用场景： 周期性地打印出进程运行队列、系统切换、CPU时间占比等情况；

> 本文参考了[Gityuan](http://gityuan.com/)博客，在此表示感谢。

