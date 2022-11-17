---
title: Android - WMS系列之启动流程
date: 2022-02-20 22:16:06
tags:
categories: Android
copyright: true
password: zr.
---



>WMS 启动流程；

<!--more-->

### DecorView

在 setContentView 的时候在 PhoneWindow 里面通过 installDecor-generateDecor 生成 **DecorView**（同时获取 mContentParent 用于承载用户布局），生成后通过 mDecor.setWindow() 给 DecorView 设置了一个 **Window**（即创建一个 DecorView 作为 PhoneWindow 的内容），然后在 setContentView 中解析用户 XML 填充进 mContentParent；

### Window

Window 是在反射创建出 Activity 之后，通过 `Activity.attach` 中创建出来的，实质是 PhoneWindow 对象，并且通过 `Window.setWindowManager` 给 **Window 设置一个 WindowManager**；

Window 的分类：

- 应用窗口：Activity 等，Z-Order 为 1 - 99；
- 子窗口：比如 PopupWindow，Z-Order 为 1000 - 1999；
- 系统窗口：比如输入法窗口、系统音量条窗口、系统错误窗口等，Z-Order 为 2000 - 2999；

Z-Order 大的窗口在上面（指向屏幕外方向为上）；

### WindowManager

在创建 Window 并给它设置 **WindowManager** 的时候创建的，实质是一个 **WindowManagerImpl** 对象，即 WindowManagerImpl 管理 PhoneWindow，WMI 又交给了 WindowManagerGlobal，然后 WMG 通过 `mViews.add(view); mRoots.add(root); mParams.add(wparams);`完成了 Window 的添加；

### ViewRootImpl

在 ActivityThread 里面的 handleResumeActivity() 通过 wm.addView 时，转到 WindowManagerGlobal.addView 时创建的，顺便把 DecorView交给了 ViewRootImpl，DecorView 作为 View 树的根节点视图，就由 ViewRootImpl 管理了；

实现 View 和 WindowManager 的之间的协议，作为两者联系的桥梁；

触发 View 的 messure、layout、draw；

负责与 WMS 通信，通过 WindowSession 可以与 WMS 进行通信，WMS 通过 ViewRootImpl 的 W 与ViewRootImpl 通信；

### WindowManagerService



