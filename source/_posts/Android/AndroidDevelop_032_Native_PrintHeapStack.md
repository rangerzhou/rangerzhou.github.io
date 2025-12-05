---
title: Android - Native 层堆栈打印
date: 2023-02-21 23:22:05
tags:
categories: Android
copyright: true
password:
---

> Android native 层堆栈打印介绍。

<!--more-->

# 1 Posix 方案

源码路径

| Class       | Path                                        | Note |
| ----------- | ------------------------------------------- | ---- |
| Thread.h    | system/core/libutils/include/utils/Thread.h |      |
| Threads.cpp | system/core/libutils/Threads.h              |      |

基本用法

- 放开 `#define LOG_NDEBUG 1`

  - 这里值为 1 表示非调试版本，禁用详细日志，编译时会把 LOGV 代码移除，如果是 0 的话则会打印 LOGV 日志（有些扩展实现会把 LOGD 也移除）

- 声明头文件

  ``` cpp
  #include<utils/CallStack.h>
  #include<utils/Log.h>
  ```

- 调用方法

  ``` cpp
  android::CallStack stack;
  stack.update();
  stack.log(debug); // 输出到 logcat
  ```

- mk 或者 bp 中链接一下 so 库

  - libutils
  - libcutils
