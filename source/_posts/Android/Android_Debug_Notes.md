---
title: Android 调试技巧汇总
copyright: true
date: 2021-10-05 16:22:39
tags:
categories: Android
password: zr.
---

> Android 调试相关；

<!--more-->

## 1 adb 命令查看当前界面的 Activity / Fragment / 任务栈

### 查看当前 Activity

``` shell
adb shell "dumpsys activity top | grep ACTIVITY | tail -n 1"
```

- `dumpsys activity top`：打印顶层Activity信息
- `grep ACTIVITY`：从上个命令结果中过滤出Activity相关信息
- `tail -n 1`：从上一步过滤结果中继续过滤出最后一条记录，也就是当前界面(顶层top)activity

### 查看当前 Fragment

``` shell
adb shell "dumpsys activity top | grep '#[0-9]: ' | tail -n 1"
```

### 查看 Activity 任务栈

``` shell
adb shell "dumpsys activity activities | grep '* ActivityRecord{'"
```

bat 脚本

``` bash
@echo off &PUSHD %~DP0 &TITLE Settings Tool

:menu
cls
echo Notes: Please connect device with adb, it's only adapter for Android 11.
echo === Menu ===
echo [1] view top activity
echo [2] view top fragment
echo [3] view activity stack
echo ============
set /p user_input=Please choose menu:
if %user_input%==1 goto topActivity
if %user_input%==2 goto topFragment
if %user_input%==3 goto activityStack
if not %user_input%=="" goto menu

:topActivity
adb wait-for-device
adb shell "dumpsys activity top | grep ACTIVITY | tail -n 1"
echo. & pause
goto menu

:topFragment
adb wait-for-device
adb shell "dumpsys activity top | grep '#[0-9]: ' | tail -n 1"
echo. & pause
goto menu

:activityStack
adb wait-for-device
adb shell "dumpsys activity activities | grep '* ActivityRecord{'"
echo. & pause
goto menu
```

