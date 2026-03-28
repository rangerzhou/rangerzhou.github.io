---
title: Android - 三分屏
date: 2025-12-16 23:29:36
tags:
categories: Android
copyright: true
password:
published: false
---

> WMS 三分屏。

<!--more-->



```shell
dumpsys window windows
dumpsys activity containers
dumpsys SurfaceFlinger
adb shell am stack list # 查看 window
dumpsys activity containers # 查看分屏所在 Task 的 mode=multi-window
```

上下分屏的 task 的 mode 都是 multi-window，两个 task 的父 task 的 mode 是 fullscreen
