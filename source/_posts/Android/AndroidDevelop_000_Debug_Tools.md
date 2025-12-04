---
title: Android —— 调试工具和命令汇总
copyright: true
date: 2024-09-13 21:44:51
tags:
categories: Android
password:
---

> Android 开发常用调试工具及命令汇总。

<!--more-->

## 查看当前 Activity

``` shell
adb shell dumpsys activity activities | grep ResumedActivity
```

