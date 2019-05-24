---
title: JNI-Study
copyright: true
date: 2019-02-09 13:16:52
tags:
categories: Android
password: zr.
---

> **JNI** （**Java Native Interface,Java 本地接口**）是一种[编程框架](https://zh.wikipedia.org/w/index.php?title=%E7%BC%96%E7%A8%8B%E6%A1%86%E6%9E%B6&action=edit&redlink=1)，使得 [Java虚拟机](https://zh.wikipedia.org/wiki/Java%E8%99%9A%E6%8B%9F%E6%9C%BA)中的 [Java](https://zh.wikipedia.org/wiki/Java) 程序可以调用本地应用或库，也可以被其他程序调用。 本地程序一般是用其它语言（[C](https://zh.wikipedia.org/wiki/C%E8%AF%AD%E8%A8%80)、[C++](https://zh.wikipedia.org/wiki/C%2B%2B)或[汇编语言](https://zh.wikipedia.org/wiki/%E6%B1%87%E7%BC%96%E8%AF%AD%E8%A8%80)等）编写的，并且被编译为基于本机硬件和操作系统的程序。JNI 用于打通 Java 层与 Native(C/C++) 层，并非 Android 系统独有，而是 Java 所有。Java语言是跨平台的语言，而这跨平台的背后都是依靠Java虚拟机，虚拟机采用C/C++编写，适配各个系统，通过JNI为上层Java提供各种服务，保证跨平台性。

<!--more-->

