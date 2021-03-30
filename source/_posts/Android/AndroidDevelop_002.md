---
title: Android 底层学习系列（1）-Android 平台架构
date: 2019-10-14 14:31:01
tags:
categories: Android
copyright: true
password:
---

>
>
>Android 编译

<!--more-->

### 摘要

1. `build/envsetup.sh` 分析
2. lunch 做了什么，如何增加和删除 lunch
3. Android 编译命令使用



build/envsetup.sh 作用

- 加载命令和分支
- lunch
  - 选择分支
  - 配置编译环境变量
  - 输出目录
- mm, mmm

### Android 编译过程

1. 初始化参数设置

2. 检查环境变量与目标环境

3. 选择 lunch 并读取目标配置和平台信息

4. 清空输出目录
5. 编译
6. 生成升级包

### 源码目录说明

|       目录       |            说明            |
| :--------------: | :------------------------: |
|       art        |                            |
|      bionic      |            C 库            |
|     bootable     |                            |
|      build       |                            |
|       cts        |         兼容性测试         |
|      dalvik      |        java 虚拟机         |
|    developers    |                            |
|   development    |                            |
|      device      |        产品目标目录        |
|     external     |  Android 引入的第三方模块  |
|    frameworks    |      Android 和新框架      |
|     hardware     |         硬件适配层         |
|      kernel      |                            |
|     libcore      |                            |
| libnativehelper  |                            |
|       out        |   编译生成的目标文件目录   |
|     packages     |                            |
|       pdk        |                            |
| platform_testing |                            |
|    prebuilts     |                            |
|       sdk        |                            |
|      system      | 底层文件系统库，应用和组件 |
|       test       |                            |
|    toolchain     |                            |
|      tools       |                            |

