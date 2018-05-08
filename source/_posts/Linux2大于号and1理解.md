---
title: Linux “2 > &1”理解
copyright: true
date: 2018-01-17 11:50:26
tags:
categories: Others
password:
---

> Linux中会经常遇到`command>/dev/null 2>&1 &` 这样形式的命令，到底是什么意思呢？`command`就是要执行的命令，`command>/dev/null`也比较好理解，`/dev/null`表示一个空设备，意思是把`command`的执行结果重定向到空设备中，也就是不显示任何信息。`2>&1`是什么意思呢？

<!--more-->

首先了解基本符号及其含义：

- /dev/null 表示空设备文件
- 0 表示stdin标准输入
- 1 表示stdout标准输出
- 2 表示stderr标准错误

### command>/dev/null

其实`command>/dev/null`命令是一个缩写版，对于一个重定向命令，肯定是`a > b`这种形式，那么`command > /dev/null`难道是command充当a的角色，/dev/null充当b的角色。这样看起来比较合理，其实一条命令肯定是充当不了a，肯定是command执行**产生的输出**来充当a，其实就是标准输出stdout。所以`command > /dev/null`相当于执行了`command 1 > /dev/null`。执行command产生了标准输出stdout(用1表示)，重定向到/dev/null的设备文件中。

### 2>&1

通过上面`command > /dev/null`等价于`command 1 > /dev/null`,那么对于`2>&1`也就好理解了，2就是标准错误，1是标准输出，那么这条命令不就是相当于把标准错误重定向到标准输出么。等等是&1而不是1，这里&是什么？这里`&`相当于**等效于标准输出**。这里有点不好理解，先看下面。

### command>a 2>a 与 command>a 2>&1的区别

通过上面的分析，对于`command>a 2>&1`这条命令，等价于`command 1>a 2>&1`可以理解为执行command产生的标准输入重定向到文件a中，标准错误也重定向到文件a中。那么是否就说`command 1>a 2>&1`等价于`command 1>a 2>a`呢。其实不是，`command 1>a 2>&1`与`command 1>a 2>a`还是有区别的，**区别就在于前者只打开一次文件a，后者会打开文件两次，并导致stdout被stderr覆盖**。`&1`的含义就可以理解为用标准输出的引用，引用的就是重定向标准输出产生打开的a。从IO效率上来讲，`command 1>a 2>&1`比`command 1>a 2>a`的效率更高。

