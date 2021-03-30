---
title: Android 底层学习系列（3）-Android.mk
date: 2019-12-02 14:31:01
tags:
categories: Android
copyright: true
password:
---

>
>
>Android make file

<!--more-->

http://gityuan.com/2018/06/02/android-bp/

- LOCAL_PATH := $(call my-dir)：定义了当前模块的相对路径
- include $(CLEAR_VARS)：清空当前环境变量（除了 LOCAL_PATH）
- LOCAL_MODULE := HelloWorld：编译生成的目标名称
- LOCAL_SRC_FILES := HelloWorld.java：编译该模块需要的源文件
- include $(BUILD_EXECUTABLE)：编译所生成的目标文件格式