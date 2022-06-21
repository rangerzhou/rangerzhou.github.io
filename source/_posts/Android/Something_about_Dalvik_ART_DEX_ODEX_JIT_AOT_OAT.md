---
title: 关于 Dalvik、ART、DEX、ODEX、JIT、AOT、OAT
date: 2017-06-30 16:29:38
tags:
categories: Android
copyright: true
---

> 关于 Dalvik、ART、DEX、ODEX、JIT、AOT、OAT，说真的，我看着都头大，每次看完过不了多久就会忘记一些内容，然后再去搜资料，好记性不如烂笔头，写在这里随时温故。

<!--more-->

# 1. Dalvik＆ART

## 1.1 Dalvik

Dalvik 是 Google 公司自己设计用于 Android 平台的虚拟机。DVM 即 Dalvik Virtual Machine 的缩写，那么 DVM 和 JVM 有什么区别呢？

1. DVM 基于寄存器，JVM 基于栈

   寄存器是 CPU 上面的一块存储空间，栈是内存上面的一段连续的存储空间，所以 CPU 直接访问自己上面的一块空间的数据的效率肯定要大于访问内存上面的数据。基于栈架构的程序在运行时虚拟机需要频繁的从栈上读取或写入数据，这个过程需要更多的指令分派与内存访问次数，会耗费不少 CPU 时间，对于像手机设备资源有限的设备来说，这是相当大的一笔开销。DVM 基于寄存器架构。数据的访问通过寄存器间直接传递，这样的访问方式比基于栈方式要快很多。

2. 执行的字节码文件不一样

   DVM 执行的是 .dex 文件，JVM 执行的是 .class 文件。

   AVM 解释执行的是 dex 字节码 .dex ：.java --> .class --> .dex --> .apk

   JVM 运行的是 java 字节码 .class ：.java --> .class --> .jar

3. 运行环境的区别

   DVM：允许运行多个虚拟机实例，每一个应用启动都运行一个单独的虚拟机，并且运行在一个独立的进程中

   JVM：只能运行一个实例，也就是所有应用都运行在同一个 JVM 中

## 1.2 ART

ART 即 Android Runtime，是在 Dalvik 的基础上做了一些优化。在 Dalvik 下，应用每次运行的时候，字节码都需要通过即时编译器（ JIT, just in time ）转换为机器码，这会拖慢应用的运行效率，而在 ART  环境中，应用在第一次安装的时候，字节码就会预先编译成机器码，使其成为真正的本地应用。这个过程叫做预编译（ AOT, Ahead-Of-Time ）。这样的话，应用的启动(首次)和执行都会变得更加快速。

ART 虚拟机执行的本地机器码：

.java --> java bytecode(.class) --> dalvik bytecode(.dex) --> optimized android runtime machine code(.oat)

## 1.3 Dalvik和ART区别

Dalvik 是运行时解释 dex 文件，安装比较快，开启应用比较慢，应用占用空间小；ART 是安装的时候字节码预编译成机器码存储在本地，执行的时候直接就可以运行的，安装慢，开启应用快，占用空间大；

比较喜欢一个骑自行车的例子，Dalvik 好比一个已经折叠起来的自行车，每次骑之前都要先组装才能骑，ART 相当于一个已经组装好的自行车，每次直接骑着就走了。

https://source.android.com/devices/tech/dalvik?hl=zh-cn

# 2. dex＆odex＆oat

## 2.1 dex

dex ( Dalvik Executable )，本质上 java 文件编译后都是字节码，只不过 JVM 运行的是 .class 字节码，而 DVM 运行的是 .dex 字节码， `sdk\build-tools\25.0.2\dx` 工具负责将 Java 字节码 .class 文件转换为 Dalvik 字节码 .dex ，dx 工具对 Java 类文件重新排列，消除在类文件中出现的所有冗余信息，避免虚拟机在初始化时出现反复的文件加载与解析过程。一般情况下，Java 类文件中包含多个不同的方法签名，如果其他的类文件引用该类文件中的方法，方法签名也会被复制到其类文件中，也就是说，多个不同的类会同时包含相同的方法签名，同样地，大量的字符串常量在多个类文件中也被重复使用。这些冗余信息会直接增加文件的体积，同时也会严重影响虚拟机解析文件的效率。消除其中的冗余信息，重新组合形成一个常量池，所有的类文件共享同一个常量池，由于 dx 工具对常量池的压缩，使得相同的字符串，常量在 DEX 文件中只出现一次，从而减小了文件的体积，同时也提高了类的查找速度，此外，dex 格式文件增加了新的操作码支持，文件结构也相对简洁，使用等长的指令来提高解析速度。

## 2.2 odex

 odex( Optimized dex )，即优化的 dex，主要是为了提高 DVM 的运行速度，在编译打包 APK 时，Java 类会被编译成一个或者多个字节码文件（ .class ），通过 dx 工具 CLASS 文件转换成一个 DEX（ Dalvik Executable ）文件。 通常情况下，我们看到的 Android 应用程序实际上是一个以 .apk 为后缀名的压缩文件。我们可以通过压缩工具对 apk 进行解压，解压出来的内容中有一个名为 classes.dex 的文件。那么我们首次开机的时候系统需要将其从 apk 中解压出来保存在 `data/app` 目录中。 

**如果当前运行在 Dalvik 虚拟机下**，Dalvik 会对 classes.dex 进行一次验证和优化，验证优化的过程也就是守护进程 installd 的函数 dexopt 来对 dex 字节码进行优化，实际上也就是由 dex 文件生成 odex 文件，最终 odex 文件被保存在手机的 VM 缓存目录 `data/dalvik-cache` 下（**注意！这里所生成的 odex 文件依旧是以 dex 为后缀名，格式如：`system@priv-app@Settings@Settings.apk@classes.dex`**）。

**Dalvik: .dex -> .odex(字节码)**

**如果当前运行于 ART 模式下**，  ART 同样会在首次进入系统的时候调用 `/system/bin/dexopt` （此处应该是 dex2oat 工具吧）工具来将 dex 字节码翻译成本地机器码，保存在 `data/dalvik-cache` 下。 那么这里需要注意的是，无论是对 dex 字节码进行优化，还是将 dex 字节码翻译成本地机器码，最终得到的结果都是保存在相同名称的一个 odex 文件里面的，但是前者对应的是一个 .dex 文件（表示这是一个优化过的 dex），后者对应的是一个 **.oat ** 文件(有点混乱，API 29 以后Android 运行时 (ART) 不再从应用进程调用 `dex2oat`。这项变更意味着 ART 将仅接受系统生成的 OAT 文件)。通过这种方式，原来任何通过绝对路径引用了该 odex 文件的代码就都不需要修改了。 由于在系统首次启动时会对应用进行安装，那么在预置 APK 比较多的情况下，将会大大增加系统首次启动的时间。

**ART: .dex -> .odex(机器码)**

从前面的描述可知，既然无论是 DVM 还是 ART，对 DEX 的优化结果都是保存在一个相同名称的 odex 文件，那么如果我们把这两个过程在 ROM 编译的时候预处理提取 Odex 文件将会大大优化系统首次启动的时间。具体做法则是在 device 目录下的 **/[device](http://androidxref.com/7.1.1_r6/xref/device/)/[huawei](http://androidxref.com/7.1.1_r6/xref/device/huawei/)/[angler](http://androidxref.com/7.1.1_r6/xref/device/huawei/angler/)/[BoardConfig.mk](http://androidxref.com/7.1.1_r6/xref/device/huawei/angler/BoardConfig.mk)** 中定义 `WITH_DEXPREOPT := true`，打开这个宏之后，无论是有源码还是无源码的预置 apk 预编译时都会提取 odex 文件，不过这里需要注意的是打开WITH_DEXPREOPT 宏之后，预编译时提取 Odex 会增加一定的空间，预置太多 apk，会导致 system.img 过大，而编译不过。遇到这种情况可以通过删除 apk 中的 dex 文件、调大 system.img 的大小限制，或在预编译时跳过一些 apk 的 odex 提取。

## 2.3 oat

oat 文件是 ART 的核心，是通过 `/system/bin/dex2oat` 工具生成的，实际上是一个自定义的 elf 文件，里面包含的都是本地机器指令，通过 AOT 生成的文件，在系统中的表现形式有 OAT、ART、ODEX，其中大部分 apk 在执行 AOT 后生成的都是 odex 文件。但是由 dex2oat 工具生成的 oat 文件包含有两个特殊的段 oatdata 和 oatexec，前者包含有用来生成本地机器指令的 dex 文件内容，后者包含有生成的本地机器指令，进而就可以直接运行。其是通过 PMS --> installd --> dex2oat 的流程生成的，可以在预编译的时候，也可以在开机 apk 扫描的过程中或者 apk 安装过程中生成。

## 2.4 dexopt和dex2oat区别

> dexopt does some optimizations on the dex file. It does things like replacing a virtual invoke instruction with an optimized version that includes the vtable index of the method being called, so that it doesn't have to perform a method lookup during execution.
>
> The result of dexopt is an odex (optimized dex) file. This is very similar to the original dex file, except that it uses some optimized opcodes, like the optimized invoke virtual instruction.
>
> dex2oat takes a dex file and compiles it. The result is essentially an elf file that is then executed natively. So instead of having bytecode that is interpreted by a virtual machine, it now has native code that can be executed natively by the processor. This is called AOT (ahead-of-time) compilation.
>
> Another factor to take into account is that dalvik used a JIT (just-in-time) compiler - meaning that it was also able to compile bytecode to native code. The main difference however, is that ART compiles everything ahead of time, whereas dalvik only compiled a subset of the bytecode using heuristics to detect the code that was executed most frequently, and it compiled during execution.

# 3. JIT＆AOT

## 3.1 JIT

JIT(Just In Time Compiler， 即时编译)，与 Dalvik 虚拟机相关。

JIT 在 2.2 版本提出的，目的是为了提高 android 的运行速度，一直存活到 4.4 版本，因为在 4.4 之后的 ROM 中，就不存在 Dalvik 虚拟机了。我们使用 Java 开发 android，在编译打包 APK 文件时，会经过以下流程：

1. Java 编译器将应用中所有 Java 文件编译为 class 文件
2. dx 工具将应用编译输出的类文件转换为 Dalvik 字节码，即 dex 文件

DVM 负责解释 dex 文件为机器码，如果我们不做处理的话，每次执行代码，都需要 Dalvik 将 java 代码由解释器(Interpreter)将每个 java 指令转译为微处理器指令，并根据转译后的指令先后次序依序执行，一条 java 指令可能对应多条微处理器指令，这样效率不高。为了解决这个问题，Google 在 2.2 版本添加了JIT编译器，当 App 运行时，每当遇到一个新类，JIT 编译器就会对这个类进行编译，经过编译后的代码，会被优化成相当精简的原生型指令码（即 native code），这样在下次执行到相同逻辑的时候，速度就会更快。但是使用 JIT 也不一定加快执行速度，如果大部分代码的执行次数很少，那么编译花费的时间不一定少于执行 dex 的时间。Google 当然也知道这一点，所以 JIT 不对所有 dex 代码进行编译，而是只编译执行次数较多的 dex 为本地机器码。

https://source.android.com/devices/tech/dalvik/jit-compiler?hl=zh-cn

## 3.2 AOT

AOT(Ahead Of Time)，和 ART 虚拟机相关。

JIT 是运行时编译，这样可以对执行次数频繁的 dex 代码进行编译和优化，减少以后使用时的翻译时间，虽然可以加快 Dalvik 运行速度，但是还是有弊病，那就是将 dex 翻译为本地机器码也要占用时间，所以 Google 在 4.4 之后推出了 ART，用来替换 Dalvik。

在 4.4 版本上，两种运行时环境共存，可以相互切换，但是在 5.0+，Dalvik 虚拟机则被彻底的丢弃，全部采用ART。ART 的策略与 Dalvik 不同，在 ART 环境中，应用在第一次安装的时候，字节码就会预先编译成机器码，使其成为真正的本地应用。之后打开 App 的时候，不需要额外的翻译工作，直接使用本地机器码运行，因此运行速度提高。

总的来说：

- JIT 代表运行时编译策略，也可以理解成一种运行时编译器，是为了加快 Dalvik 虚拟机解释 dex 速度提出的一种技术方案，来缓存频繁使用的本地机器码；
- AOT 可以理解运行前编译策略，ART 虚拟机的主要特征就是 AOT；


# 4. Android N上的改变

## 4.1 ART缺点

- dex -> oat 生成时间太久，进而 apk 安装时间很久；
- dex2oat 耗用系统资源太多，特别 dex2oat 占用 cpu 和 memory；
- oat 文件过大，rom 小的设备 data 空间会吃紧；
- Powerconsumption 增加；
- ART 不太稳定，在 M 上 crash 问题太多，debug 不太容易；
- oat 文件是 elf 格式，所以加载 oat 文件时候相关依赖库也很多，间接导致 app 进程占用 Memory 的增加；

## 4.2 Android N的改变

先来看 **[官方文档](https://developer.android.google.cn/about/versions/nougat/android-7.0.html#jit_aot)** 描述：

> In Android N, we've added a Just inTime (JIT) compiler with code profiling to ART, which lets it constantlyimprove the performance of Android apps as they run. **The JIT compiler complements ART'scurrent Ahead of Time (AOT) compiler and helps improve runtime performance,save storage space, and speed up app updates and system updates**.
>
> 在 Android 7.0 中，我们添加了即时 ( JIT ) 编译器，对 ART 进行代码分析，让它可以在应用运行时持续提升 Android 应用的性能。JIT 编译器对 Android 运行组件当前的 Ahead of Time ( AOT ) 编译器进行了补充，有助于提升运行时性能，节省存储空间，加快应用更新和系统更新速度。
>
> Profile-guided compilation lets ART **manage the AOT/JIT compilation** for each app according to its actualusage, as well as conditions on the device. For example, **ART maintains a profile of each app's hot methods andcan precompile and cache those methods for best performance.** It leaves other parts of the appuncompiled until they are actually used.
>
> 配置文件指导的编译让 Android 运行组件能够根据应用的实际使用以及设备上的情况管理每个应用的 AOT/JIT 编译。例如，Android 运行组件维护每个应用热方法的配置文件，并且可以预编译和缓存这些方法以实现最佳性能。对于应用的其他部分，在实际使用之前不会进行编译。
>
> Besides improving performance for keyparts of the app, profile-guided compilation helps reduce an app's overall RAM footprint, including associated binaries. Thisfeature is especially important on low-memory devices.
>
> 除提升应用的关键部分的性能外，配置文件指导的编译还有助于减少整个 RAM 占用，包括关联的二进制文件。此功能对于低内存设备非常尤其重要。
>
> ART manages profile-guided compilation in a way that minimizes impact on the device battery. It does precompilation only when then the device is idle and charging, saving time and battery by doing that work in advance.
>
> Android 运行组件在管理配置文件指导的编译时，可最大程度降低对设备电池的影响。仅当设备处于空闲状态和充电时才进行编译，从而可以通过提前执行该工作节约时间和省电。

在 AOT 的编译方式基础上引入 JIT，对于经常用的 method 用 AOT 方式，对于不经常用的 method 等用 JIT，并且对于这些常用或者不常用维护一个 profile。它可以以某一种方式最小影响 battery 的消耗，以及在设备空闲或者充电的情况做预编译，由此就可以解决上面提到的部分缺点。

启动 JIT 以及相关的 profile 功能打开如下开关：

/[build](http://androidxref.com/7.1.1_r6/xref/build/)/[target](http://androidxref.com/7.1.1_r6/xref/build/target/)/[product](http://androidxref.com/7.1.1_r6/xref/build/target/product/)/[runtime_libart.mk](http://androidxref.com/7.1.1_r6/xref/build/target/product/runtime_libart.mk)

``` shell
PRODUCT_DEFAULT_PROPERTY_OVERRIDES += \
    dalvik.vm.image-dex2oat-Xms=64m \
    dalvik.vm.image-dex2oat-Xmx=64m \
    dalvik.vm.dex2oat-Xms=64m \
    dalvik.vm.dex2oat-Xmx=512m \
    ro.dalvik.vm.native.bridge=0 \
    dalvik.vm.usejit=true \
    dalvik.vm.usejitprofiles=true \
    dalvik.vm.appimageformat=lz4
```

dalvik.vm.usejit=true 和 dalvik.vm.usejitprofiles=true 属性。