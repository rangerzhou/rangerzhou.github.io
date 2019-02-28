---
title: Java中的强引用、软引用、弱引用、虚引用
copyright: true
date: 2019-02-27 13:10:18
tags:
categories: Java
password:
---

> 在 JDK 1.2 之后，Java 对引用的概念进行了扩充，将引用分为**强引用（Strong Reference）**、**软引用（Soft Reference）**、**弱引用（Weak Reference）**、**虚引用（Phantom Reference）**四种，引用强度：强引用 > 软引用 > 弱引用 > 虚引用。

<!--more-->

### 0. 对象和引用

在 Java 中，有一组名词经常一起出现，就是“对象和对象引用”，这 2 个概念很容易混淆。

**何谓对象？**

在 Java 中有一句比较流行的话，叫做“万物皆对象”，这是 Java 语言设计之初的理念之一。要理解什么是对象，需要跟类一起结合起来理解。下面这段话引自《Java 编程思想》中的一段原话：

``` shell
按照通俗的说法，每个对象都是某个类（class）的一个实例（instance），这里，‘类’就是‘类型’的同义词。
```

从这一句话就可以理解到对象的本质，简而言之，它就是类的实例，比如所有的人统称为“人类”，这里的“人类”就是一个类（物种的一种类型），而具体到每个人，比如张三这个人，它就是对象，就是“人类”的实例。

**何谓对象引用？**

``` shell
每种编程语言都有自己的数据处理方式。有些时候，程序员必须注意将要处理的数据是什么类型。你是直接操纵元素，还是用某种基于特殊语法的间接表示（例如 C/C++ 里的指针）来操作对象。所有这些在 Java 里都得到了简化，一切都被视为对象。因此，我们可采用一种统一的语法。尽管将一切都“看作”对象，但操纵的标识符实际是指向一个对象的“引用”（reference）。
```

这段话来自于《Java 编程思想》，很显然，从这段话可以看出对象和对象引用不是一回事，是两个完全不同的概念。举个例子，我们通常会用下面这一行代码来创建一个对象：

``` java
Person person = new Person("张三");
```

有人会说，这里的 person 是一个对象，是 Person 类的一个实例。

也有人会说，这里的 person 并不是真正的对象，而是指向所创建的对象的引用。

到底哪种说法是对的？我们先不急着纠结哪种说法是对的，再看两行代码：

``` java
Person person;
person = new Person("张三");
```

这两行代码实现的功能和上面的一行代码是完全一样的。大家都知道，**在 Java 中 new 是用来在堆上创建对象用的**，如果 person 是一个对象的话，那么第二行为何还要通过 new 来创建对象呢？由此可见，person 并不是所创建的对象，是什么？上面的一段话说的很清楚，“操纵的标识符实际是指向一个对象的引用”，也就是说 person 是一个引用，是指向一个可以指向 Person 类的对象的引用。真正创建对象的语句是右边的 new Person("张三")。

再看一个例子：

``` java
Person person;
person = new Person("张三");
person = new Person("李四");
```

这里让 person 先指向了“张三”这个对象，然后又指向了“李四”这个对象。也就是说，Person person，这句话只是声明了一个 Person 类的引用，它可以指向任何 Person 类的实例。

也就是说，一个引用可以指向多个对象，而一个对象可不可以被多个引用所指呢？答案当然是可以的。

``` java
Person person1 = new Person("张三");
Person person2 = person1;
```

person1 和 person2 都指向了“张三”这个对象。

---

在 JDK 1.2 之后，Java 对引用的概念进行了扩充，将引用分为强引用（Strong Reference）**、**软引用（Soft Reference）**、**弱引用（Weak Reference）**、**虚引用（Phantom Reference）4 种，这 4 种引用强度依次逐渐减弱，引用强度：强引用 > 软引用 > 弱引用 > 虚引用。

### 1. 强引用 StrongReference

``` shell
强引用就是指在程序代码之中普遍存在的，类似“Object obj = new Object()” 这类的引用，只要强引用还存在，垃圾收集器永远不会回收掉被引用的对象。---《深入理解 Java 虚拟机》
```

可将对象的引用显示的置为 null：`o = null;//帮助垃圾收集器回收此对象` 。

当内存空间不足，Java 虚拟机宁愿抛出 OutOfMemoryError 错误，使程序异常终止，也不会靠随意回收具有强引用的对象来解决内存不足的问题。

例：

``` java
A a = new A();
B b = new B(a);
```

上面两个强引用就这样产生了，并且 a 是对象 A 的引用，b 是对象 B 的引用，而且 B 还依赖于 A ，那么就认为 B 是可以到达 A 的。

``` java
A a = new A();
B b = new B(a);
a = null;
```

当把 a = null 时，这时 a 不再指向 A 的地址。按道理：当某个对象不再被其它对象引用的时候，会被 GC 回收，而 a = null 时，A 对象不能被回收，B 还依赖于 A，造成了内存泄漏。

强引用最重要的就是它能够让引用变强，这就决定了它和 GC 的交互，如果一个对象通过强引用链接可到达，它就不会被 GC 回收。

### 2. 软引用 SoftReference

``` shell
软引用是用来描述一些还有用但并非必须的对象。对于软引用关联着的对象，在系统将要发生内存溢出异常之前，将会把这些对象列进回收范围之中进行第二次回收。如果这次回收还没有足够的内存，才会抛出内存溢出异常。在 JDK 1.2 之后，提供了 SoftReference 类来实现软引用。---《深入理解 Java 虚拟机》
```

[SoftReference](https://developer.android.com/reference/java/lang/ref/SoftReference) 只有在内存不足的时候 JVM 才会回收该对象，当 JVM 中的内存不足的时候，垃圾回收器会释放那些只被软引用所指向的对象。如果全部释放完这些对象之后，内存还不足，才会抛出 OutOfMemoryError。

由于软引用可到达的对象比弱引用可达到的对象滞留内存时间会长一些，我们可以利用这个特性来做缓存，比如网页缓存、图片缓存等。

**浏览器网页缓存实例**

```
Browser prev = new Browser();					// 获取页面进行浏览
SoftReference sr = new SoftReference(prev);		// 浏览完毕后置为软引用
if(sr.get()!=null) {
    rev = (Browser)sr.get();					// 还没有被回收器回收，直接获取
} else {
    prev = new Browser();						// 由于内存吃紧，所以回收了软引用的对象
    sr = new SoftReference(prev);				// 重新构建
}
```

相比弱引用，它阻止垃圾回收期回收其指向的对象的能力强一些。如果一个对象是弱引用可到达，那么这个对象会被垃圾回收器接下来的回收周期销毁。但是如果是软引用可以到达，那么这个对象会停留在内存更时间上长一些，**当内存不足时垃圾回收器才会回收这些软引用可到达的对象**。

软引用可以和一个引用队列（ReferenceQueue）联合使用，如果软引用所引用的对象被垃圾回收器回收，JVM 就会把这个软引用加入到与之关联的引用队列中。

### 3. 弱引用 WeakReference

``` shell
弱引用也是用来描述非必须对象的，但是它的强度比软引用更弱一些，被弱引用关联的对象只能生存到下一次垃圾收集发生之前。当垃圾收集器工作时，无论当前内存是否足够，都会回收掉只被弱引用关联的对象。在 JDK 1.2 之后，提供了 WeakReference 类来实现弱引用。---《深入理解 Java 虚拟机》
```

[WeakReference](https://developer.android.com/reference/java/lang/ref/WeakReference.html) 与软引用的区别在于：只具有弱引用的对象拥有更短暂的生命周期。在垃圾回收器线程扫描它所管辖的内存区域的过程中，一旦发现了只具有弱引用的对象，不管当前内存空间足够与否，都会回收它的内存。不过，由于垃圾回收器是一个优先级很低的线程，因此不一定会很快发现那些只具有弱引用的对象。

一旦弱引用对象开始返回 null，该弱引用指向的对象就被标记成了垃圾。而这个弱引用对象（非其指向的对象）就没有什么用了。弱引用可以和一个引用队列（ReferenceQueue）联合使用，如果弱引用所指向的对象被垃圾回收，Java 虚拟机就会把这个弱引用加入到与之关联的引用队列中。

``` java
A a = new A();
WeakReference b = new WeakReference(a);
```

当 a = null 时，这个时候 **A 只被弱引用依赖**，GC 回立刻回收 A 对象，这就是弱引用的好处，避免内存泄漏。

### 4. 虚引用 PhantomReference

``` shell
虚引用也称为幽灵引用或者幻影引用，它是最弱的一种引用关系。一个对象是否有虚引用的存在，完全不会对其生存时间构成影响，也无法通过虚引用来取得一个对象实例。为一个对象设置虚引用关联的唯一目的就是能在这个对象被收集器回收时收到一个系统通知。在 JDK 1.2 之后，提供了 PhantomReference 类来实现虚引用。---《深入理解 Java 虚拟机》
```

[PhantomReference](https://developer.android.com/reference/java/lang/ref/PhantomReference) 与软引用，弱引用不同，虚引用指向的对象十分脆弱，我们不可以通过 get 方法来得到其指向的对象，get() 永远返回 null 。它的唯一作用就是当其指向的对象被回收之后，自己被加入到引用队列，用作记录该引用指向的对象已被销毁。

### 5. 引用队列 ReferenceQueue

[ReferenceQueue](https://developer.android.com/reference/java/lang/ref/ReferenceQueue.html) 配合 Reference 子类等使用，当引用对象所指向的内存空间被 GC 回收后，该引用对象则被追加到引用队列的末尾。

### Reference

Java 到底是值传递还是引用传递？ https://www.zhihu.com/question/31203609

理解 Java 中的弱引用 https://droidyue.com/blog/2014/10/12/understanding-weakreference-in-java/index.html

Java 中的强引用、软引用、弱引用、虚引用有什么用？ https://www.zhihu.com/question/37401125

《深入理解 Java 虚拟机：JVM 高级特性与最佳实践》



