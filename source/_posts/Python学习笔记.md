---
title: Python学习笔记
copyright: true
date: 2018-08-29 19:56:30
tags: Python
categories: Python
password:
---



### 1. List, Tuple, Dictionary, Set

**List**

- 使用中括号`[ ]`
- 可重复
- 元素可修改

**Tuple**

- 使用小括号`( )`，不用括号也可
- 可重复
- 元素不可修改

**Dictionary**

- 使用大括号`{ }`
- 键必须唯一，否则前面的值会被后面的值覆盖
- 元素可修改

**Set**

- 无序，不重复
- 使用大括号 `{ }` 或者 `set()` 函数创建集合，注意：创建一个空集合必须用 `set()` 而不是 `{ }`，因为 `{ }` 是用来创建一个空字典。

### 可更改(mutable)与不可更改(immutable)对象

在 python 中，strings, tuples, 和 numbers 是不可更改的对象，而 list,dict 等则是可以修改的对象。

- **不可变类型：**变量赋值 **a=5** 后再赋值 **a=10**，这里实际是新生成一个 int 值对象 10，再让 a 指向它，而 5 被丢弃，不是改变a的值，相当于新生成了a。
- **可变类型：**变量赋值 **la=[1,2,3,4]** 后再赋值 **la[2]=5** 则是将 list la 的第三个元素值更改，本身la没有动，只是其内部的一部分值被修改了。