---
title: selinux介绍
copyright: true
date: 2018-01-20 15:28:40
tags: Selinux
categories: Android
password:
---

> 通过本文介绍，希望能够了解selinux的概念，如何查看selinux相关权限，如何配置selinux，如何临时打开关闭selinux。

<!--more-->

### 1. 进程的概念

selinux是针对进程设置相应的权限，我们这里所要讲的进程通俗来讲就是一个在用户空间运行的一个程序。比如在windows中，一个记事本是一个进程，一个计算器也是一个进程。而在android中，每个app是一个进程，每个native app，如ping、top等都是进程。需要说明的是进程是一个动的概念，一个可执行行程序，没有运行，是静止存放在文件系统上的一个文件，并不能称之为进程。当运行起来后，系统分配进程号，才能称为进程，查看系统运行的进程可以通过ps（8.0之后版本需要ps -A）命令。

### 2. 什么是SELinux

SELinux 全称 Security Enhanced Linux (安全强化 Linux),是美国国家安全局2000年以 GNU GPL 发布，是 MAC (Mandatory Access Control，强制访问控制系统)的一个实现，目的在于明确的指明某个进程可以访问哪些资源(文件、网络端口等)。强制访问控制系统 的用途在于增强系统抵御 0-Day 攻击(利用尚未公开的漏洞实现的攻击行为)的能力。所以它不是网络防火墙或 ACL 的替代品，在用途上也 不重复。在目前的大多数发行版中，已经默认在内核集成了SELinux。相比其他强制性访问控制系统，SELinux 有如下优势：

- 控制策略是可查询而非程序不可见的
- 可以热更改策略而无需重启或者停止服务
- 可以从进程初始化、继承和程序执行三个方面通过策略进行控制
- 控制范围覆盖文件系统、目录、文件、文件启动描述符、端口、消息接口和网络接口

需要指出的是linux权限管理的两套机制。自主访问控制（DAC）和强制访问控制（MAC). DAC可以简单理解为我是root用户，有就有权限访问任何资源，打开任何文件。而user用户访问某些文件就会限制。这种控制方式有个很大的弊端就是一旦获得root权限，就可以为所欲为。MAC就是selinux搞的这一套，当你具有某些身份的时候，才能访问对应的资源。我们目前系统两套机制都起作用。相当于对资源管理有两道门，只有通过两道门才能访问到资源。

### 3. 查看SELinux权限

##### 3.1 查看文件所具有的selinux相关标识：ls -lZ

```shell
$ adb shell ls -lZ
total 1720
dr-xr-xr-x   3 root      root   u:object_r:cgroup:s0                 0 1970-06-12 16:06 acct
drwxrwx---   6 system    cache  u:object_r:cache_file:s0          4096 1970-06-12 15:38 cache
drwxr-xr-x   4 root      root   u:object_r:configfs:s0               0 1970-01-01 01:00 config
drwxr-xr-x   6 root      root   u:object_r:system_file:s0         4096 1970-01-01 01:00 cust
drwxrwx--x  50 system    system u:object_r:system_data_file:s0    4096 1970-06-12 15:38 data
lrwxrwxrwx   1 root      root   u:object_r:rootfs:s0                23 1970-01-01 01:00 default.prop -> system/etc/prop.default
drwxr-xr-x  15 root      root   u:object_r:device:s0              3640 1970-06-12 16:06 dev
drwxr-xr-x   4 root      root   u:object_r:adsprpcd_file:s0       4096 1970-01-01 08:00 dsp
... ...
drwxr-xr-x   4 root      root   u:object_r:storage_file:s0          80 1970-06-12 16:06 storage
dr-xr-xr-x  19 root      root   u:object_r:sysfs:s0                  0 1970-06-12 16:06 sys
drwxr-xr-x  18 root      root   u:object_r:system_file:s0         4096 1970-01-01 01:00 system
-rw-r--r--   1 root      root   u:object_r:rootfs:s0              5222 1970-01-01 01:00 ueventd.rc
drwxr-xr-x  16 root      root   u:object_r:vendor_file:s0         4096 1970-01-01 01:00 vendor
-rw-r--r--   1 root      root   u:object_r:rootfs:s0               524 1970-01-01 01:00 verity_key
```

以storage文件夹为例，各个部分的含义解析如下：

drwxr-xr-x   4 root      root   u:object_r:adsprpcd_file:s0       4096 1970-01-01 08:00 dsp

![selinux_dsp](http://otqux1hnn.bkt.clouddn.com/rangerzhou/180420/selinux_dsp.png)



前面几个都是属于DAC的范畴，最后一个”Selinux label"是和selinux相关的;

d表明 dsp是一个文件夹(directory);

后面三个一组分别定义了当前用户权限，组用户权限和其他用户权限;

r-读 w-写 x-执行;

而dsp文件夹所属于的用户是root，组也是root;

linux label是 u:object_r:adsprpcd_file:s0 表明我是一个具有adsprpcd_file属性的文件夹。

##### 3.2 查看进程的相关标识ps -Z

下面是ps -Z的一个例子：

```shell
whyred:/ # ps -Z
LABEL                     USER           PID  PPID     VSZ    RSS WCHAN            ADDR S NAME
u:r:su:s0                 root          4962  5421    9204   1928 sigsuspend 763b9fe628 S sh
u:r:su:s0                 root          4965  4962   10776   2020 0          7adcb4dfd0 R ps
```

第一列即为进程对应的selinux的安全上下文。

### 4. 调试中打开和关闭selinux

##### 4.1 获取当前SELinux运行状态

adb root权限下：

```shell
getenforce
```

可能返回结果有三种：Enforcing、Permissive 和 Disabled。Disabled 代表 SELinux 被禁用，Permissive 代表仅记录安全警告但不阻止 可疑行为，Enforcing 代表记录警告且阻止可疑行为。

##### 4.2 改变SELinux运行状态

```shell
setenforce [ Enforcing | Permissive | 1 | 0 ]
```

关闭： setenforce [Permissive | 0]

打开： setenforce [Enforcing | 1]

该命令可以立刻改变 SELinux 运行状态，在 Enforcing 和 Permissive 之间切换，结果保持至关机。一个典型的用途是看看到底是不是 SELinux 导致某个服务或者程序无法运行。若是在 setenforce 0 之后服务或者程序依然无法运行，那么就可以肯定不是 SELinux 导致的。

### 5. 配置selinux

##### 5.1 selinux权限存放位置

高通加的selinux相关内容位置（通常我们在这里修改）：device/qcom/sepolicy/common

linux selinux默认的位置：system/sepolicy

selinux 生成的中间文件的位置：out/target/..../obj/ETC/sepolicy_intermediate/policy.conf

该文件是所有的.te文件最后综合到这个文件里面来的一个结果，如果有些规则不会写，可以到这里面来找例子。

##### 5.2 selinux权限配置方法

**a. 添加进程访问权限规则方法：**

- **step 1：查看kernel dmesg log，搜索avc: denied字样，如**

[   19.972419] type=1400 audit(9238.719:7): avc: denied { getattr } for pid=1864 comm="chown" path="/data/usf/proximity/cmd" dev="dm-0" ino=802883 **scontext**=u:r:qti_init_shell:s0 **tcontext**=u:object_r:usf_data_file:s0 **tclass**=fifo_file permissive=0

- **step 2：确认log是不是和本模块相关的**

比如查看 comm，path，scontext等信息，确认是不是我们要用的进程被拒绝所打出的log

- **step 3：到文件夹下device/qcom/sepolicy/common下查找scontext 对应的文件**

比如step 1中的例子，则要找qti_init_shell.te 文件，打开该文件，根据log添加allow语句：

allow qti_init_shell usf_data_file**:**fifo_file {getattr } ;

qti_init_shell来自**scontext**；

usf_data_file来自**tcontext**，如果tcontex和scontext相同，则这部分写self 格式 allow xxx **self**:yyyyy {zzzzz};

fifo_file来自**tclass**；

{getattr }照抄log里面的，如果有多个可以在{}里面加空格，比如{getattr open write }；

语句结尾有“分号”。

**添加完allow语句后，需要重新编译烧录boot.img**。



**b. 添加静态文件selinux权限方法**

文件的相关权限添加在和.te同文件夹下的file_contexts文件里，里面有设备文件，bin文件的各种配置，找一个类似的做修改即可。

**修改file_contexts后，需要重新编译烧录boot.img和system.img**

