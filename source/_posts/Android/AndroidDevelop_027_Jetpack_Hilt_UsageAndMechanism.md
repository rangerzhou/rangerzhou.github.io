---
title: Android - Jetpack 套件之 Hilt 使用和原理
date: 2023-06-25 21:15:07
tags: Jetpack, Hilt
categories: Android
copyright: true
password:
---

> Android Jetpack 套件之 Hilt 使用和原理解析；

<!--more-->

隔离方案

- 代理模式：轻量级，但是耦合度高；
- Hilt 注入：重量级，耦合度低；
- SPI 机制：0 耦合；

# 代理模式



IHttpProcessor

``` java
public inter
```



Hilt 作用

Hilt 是 Dagger 的最强辅助：

- Hilt 简化了 Dagger 的使用，大量减少了使用 Dagger 时编写的重复代码；
- Hilt 提供了一套标准组件和作用域注解，不必再自定义组件和作用域；
- Hilt 提供几种预定义的绑定（提供对象实例的获取称为绑定），如 Application 或 Activity；
- Hilt 提供几种预定义的限定符（Qualifier）：@ApplicationContext 和 @ActivityContext；

Hilt 组件层次结构

![]()





















