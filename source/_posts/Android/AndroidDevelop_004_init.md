---
title: Android 底层学习系列（4）- init 启动分析
date: 2019-12-22 14:31:01
tags:
categories: Android
copyright: true
password:
---

>
>
>Android init 进程启动分析

<!--more-->



init 进程主要工作：

- init 进程是系统所启动的第一个应用程序；
- 根据 Android 需求创建目录、挂载分区；
- 解析启动脚本，将服务、操作、环境变量等全部解析出来；
- 根据脚本设置，启动相关服务，执行相关命令；
- 启动服务后守护所有服务；

