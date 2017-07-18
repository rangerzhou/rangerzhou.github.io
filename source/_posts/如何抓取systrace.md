---
title: 如何抓取systrace
date: 2017-07-18 14:04:52
tags:
categories: Android
copyright: true
---

## 1. Windows平台

Windows平台有三种方法可以抓取systrace，分别是通过Eclipse，AndriodStudio和cmd命令，这里我们只介绍通过命令抓取。

<!--more-->

- 因为命令都是运行systrace.py脚本，所以首先电脑要安装Python，[Python官网](https://www.python.org/downloads/) 下载进行安装，安装完后在系统环境变量Path中添加`D:\Program Files\Python27\Scripts\;D:\Program Files\Python27\;` ，之后在cmd命令行窗口中运行python命令可查询python是否安装成功以及python版本，这里要注意的是**安装的版本要是2开头的版本，systrace不支持3开头的python**。

  ``` powershell
  $ python
  Python 2.7.13 (v2.7.13:a06454b1afa1, Dec 17 2016, 20:53:40) [MSC v.1500 64 bit (AMD64)] on win32
  Type "help", "copyright", "credits" or "license" for more information.
  >>>
  ```

  安装后就可以运行systrace.py脚本进行抓取systrace了：

  ``` powershell
  python D:\Android\sdk\platform-tools-linux\systrace\systrace.py -t 10 -o D:\debug\systrace\systrace.html gfx input webview view wm am sm audio video camera hal app res dalvik rs power sched freq idle load workq sync irq disk mmc
  ```

## 2. Linux平台

Linux平台和上述方法一致，一般默认都装好了python环境，直接执行命令即可，命令同上，替换命令中的文件路径。

## 3. 离线systrace

- 执行adb root和adb remount

- adb shell进入手机，执行

  ``` powershell
  atrace -z -b 40000 gfx input view wm am hal res dalvik rs sched freq idle load disk mmc -t 15 > /data/local/tmp/trace_output &
  ```

  -a appname enable app-level tracing for a comma separated list of cmdlines

  -b N use a trace buffer size of N KB

  -t N trace for N seconds [defualt 5]

  -z compress the trace dump

  --list_categories list the available tracing categories

  The time and buffer size should be long enough to finished the systrace collecting.

- 断开USB连接

- 重现问题

- 重新连接USB

- pull出生成的trace_output：`adb pull /data/local/tmp/trace_output` 

- 转化为systrace：`systrace.py --from-file trace_output -o output.html` 

  ​