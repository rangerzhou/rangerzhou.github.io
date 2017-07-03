---
title: 关于Dalvik、ART、DEX、ODEX、JIT、AOT、OAT
date: 2017-06-30 16:29:38
tags:
categories: Android
copyright: true
---

关于Dalvik、ART、DEX、ODEX、JIT、AOT、OAT，说真的，我看着都头大，每次看完过不了多久就会忘记一些内容，然后再去搜资料，好记性不如烂笔头，写在这里随时温故。

<!--more-->

# 1. Dalvik＆ART

## 1.1 Dalvik

Dalvik是Google公司自己设计用于Android平台的虚拟机。DVM即Dalvik Virtual Machine的缩写，那么DVM和JVM有什么区别呢？

1. DVM基于寄存器，JVM基于栈

   寄存器是CPU上面的一块存储空间，栈是内存上面的一段连续的存储空间，所以CPU直接访问自己上面的一块空间的数据的效率肯定要大于访问内存上面的数据。基于栈架构的程序在运行时虚拟机需要频繁的从栈上读取或写入数据，这个过程需要更多的指令分派与内存访问次数，会耗费不少CPU时间，对于像手机设备资源有限的设备来说，这是相当大的一笔开销。DVM基于寄存器架构。数据的访问通过寄存器间直接传递，这样的访问方式比基于栈方式要快很多。

2. 执行的字节码文件不一样

   DVM执行的是.dex文件，JVM执行的是.class文件。

   AVM解释执行的是dex字节码.dex：.java --> .class --> .dex --> .apk

   JVM运行的是java字节码.class：.java --> .class --> .jar

3. 运行环境的区别

   DVM：允许运行多个虚拟机实例，每一个应用启动都运行一个单独的虚拟机，并且运行在一个独立的进程中

   JVM：只能运行一个实例，也就是所有应用都运行在同一个JVM中

## 1.2 ART

ART即Android Runtime，是在Dalvik的基础上做了一些优化。在Dalvik下，应用每次运行的时候，字节码都需要通过即时编译器（JIT, just in time）转换为机器码，这会拖慢应用的运行效率，而在ART 环境中，应用在第一次安装的时候，字节码就会预先编译成机器码，使其成为真正的本地应用。这个过程叫做预编译（AOT, Ahead-Of-Time）。这样的话，应用的启动(首次)和执行都会变得更加快速。

ART虚拟机执行的本地机器码：

.java --> java bytecode(.class) --> dalvik bytecode(.dex) --> optimized android runtime machine code(.oat)

## 1.3 Dalvik和ART区别

Dalvik是运行时解释dex文件，安装比较快，开启应用比较慢，应用占用空间小；ART是安装的时候字节码预编译成机器码存储在本地，执行的时候直接就可以运行的，安装慢，开启应用快，占用空间大；

比较喜欢一个骑自行车的例子，Dalvik好比一个已经折叠起来的自行车，每次骑之前都要先组装才能骑，ART相当于一个已经组装好的自行车，每次直接骑着就走了。

# 2. dex＆odex＆oat

## 2.1 dex

dex(Dalvik Executable)，本质上java文件编译后都是字节码，只不过JVM运行的是.class字节码，而DVM运行的是.dex字节码，sdk\build-tools\25.0.2\dx工具负责将Java字节码.class文件转换为Dalvik字节码.dex，dx工具对Java类文件重新排列，消除在类文件中出现的所有冗余信息，避免虚拟机在初始化时出现反复的文件加载与解析过程。一般情况下，Java类文件中包含多个不同的方法签名，如果其他的类文件引用该类文件中的方法，方法签名也会被复制到其类文件中，也就是说，多个不同的类会同时包含相同的方法签名，同样地，大量的字符串常量在多个类文件中也被重复使用。这些冗余信息会直接增加文件的体积，同时也会严重影响虚拟机解析文件的效率。消除其中的冗余信息，重新组合形成一个常量池，所有的类文件共享同一个常量池，由于dx工具对常量池的压缩，使得相同的字符串，常量在DEX文件中只出现一次，从而减小了文件的体积，同时也提高了类的查找速度，此外，dex格式文件增加了新的操作码支持，文件结构也相对简洁，使用等长的指令来提高解析速度。

## 2.2 odex

odex(Optimized dex)，即优化的dex，主要是为了提高DVM的运行速度，在编译打包APK时，Java类会被编译成一个或者多个字节码文件（.class），通过dx工具CLASS文件转换成一个DEX（Dalvik Executable）文件。 通常情况下，我们看到的Android应用程序实际上是一个以.apk为后缀名的压缩文件。我们可以通过压缩工具对apk进行解压，解压出来的内容中有一个名为classes.dex的文件。那么我们首次开机的时候系统需要将其从apk中解压出来保存在data/app目录中。 **如果当前运行在Dalvik虚拟机下**，Dalvik会对classes.dex进行一次“翻译”，“翻译”的过程也就是守护进程installd的函数dexopt来对dex字节码进行优化，实际上也就是由dex文件生成odex文件，最终odex文件被保存在手机的VM缓存目录data/dalvik-cache下（**注意！这里所生成的odex文件依旧是以dex为后缀名，格式如：`system@priv-app@Settings@Settings.apk@classes.dex`**）。**如果当前运行于ART模式下**， ART同样会在首次进入系统的时候调用/system/bin/dexopt（此处应该是dex2oat工具吧）工具来将dex字节码翻译成本地机器码，保存在data/dalvik-cache下。 那么这里需要注意的是，无论是对dex字节码进行优化，还是将dex字节码翻译成本地机器码，最终得到的结果都是保存在相同名称的一个odex文件里面的，但是前者对应的是一个.dex文件（表示这是一个优化过的dex），后者对应的是一个**.oat**文件。通过这种方式，原来任何通过绝对路径引用了该odex文件的代码就都不需要修改了。 由于在系统首次启动时会对应用进行安装，那么在预置APK比较多的情况下，将会大大增加系统首次启动的时间。

从前面的描述可知，既然无论是DVM还是ART，对DEX的优化结果都是保存在一个相同名称的odex文件，那么如果我们把这两个过程在ROM编译的时候预处理提取Odex文件将会大大优化系统首次启动的时间。具体做法则是在device目录下的**/[device](http://androidxref.com/7.1.1_r6/xref/device/)/[huawei](http://androidxref.com/7.1.1_r6/xref/device/huawei/)/[angler](http://androidxref.com/7.1.1_r6/xref/device/huawei/angler/)/[BoardConfig.mk](http://androidxref.com/7.1.1_r6/xref/device/huawei/angler/BoardConfig.mk)**中定义WITH_DEXPREOPT := true，打开这个宏之后，无论是有源码还是无源码的预置apk预编译时都会提取odex文件，不过这里需要注意的是打开WITH_DEXPREOPT 宏之后，预编译时提取Odex会增加一定的空间，预置太多apk，会导致system.img 过大，而编译不过。遇到这种情况可以通过删除apk中的dex文件、调大system.img的大小限制，或在预编译时跳过一些apk的odex提取。

## 2.3 oat

oat文件是ART的核心，是通过/system/bin/dex2oat 工具生成的，实际上是一个自定义的elf文件，里面包含的都是本地机器指令，通过AOT生成的文件，在系统中的表现形式有OAT、ART、ODEX，其中大部分apk在执行AOT后生成的都是odex文件。但是由dex2oat工具生成的oat文件包含有两个特殊的段oatdata和oatexec，前者包含有用来生成本地机器指令的dex文件内容，后者包含有生成的本地机器指令，进而就可以直接运行。其是通过PMS --> installd --> dex2oat的流程生成的，可以在预编译的时候，也可以在开机apk扫描的过程中或者apk安装过程中生成。

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

JIT(Just In Time Compiler， 即时编译)，与Dalvik虚拟机相关。

JIT在2.2版本提出的，目的是为了提高android的运行速度，一直存活到4.4版本，因为在4.4之后的ROM中，就不存在Dalvik虚拟机了。我们使用Java开发android，在编译打包APK文件时，会经过以下流程：

1. Java编译器将应用中所有Java文件编译为class文件
2. dx工具将应用编译输出的类文件转换为Dalvik字节码，即dex文件

DVM负责解释dex文件为机器码，如果我们不做处理的话，每次执行代码，都需要Dalvik将java代码由解释器(Interpreter)将每个java指令转译为微处理器指令，并根据转译后的指令先后次序依序执行，一条java指令可能对应多条微处理器指令，这样效率不高。为了解决这个问题，Google在2.2版本添加了JIT编译器，当App运行时，每当遇到一个新类，JIT编译器就会对这个类进行编译，经过编译后的代码，会被优化成相当精简的原生型指令码（即native code），这样在下次执行到相同逻辑的时候，速度就会更快。但是使用JIT也不一定加快执行速度，如果大部分代码的执行次数很少，那么编译花费的时间不一定少于执行dex的时间。Google当然也知道这一点，所以JIT不对所有dex代码进行编译，而是只编译执行次数较多的dex为本地机器码。



## 3.2 AOT

AOT(Ahead Of Time)，和ART虚拟机相关。

JIT是运行时编译，这样可以对执行次数频繁的dex代码进行编译和优化，减少以后使用时的翻译时间，虽然可以加快Dalvik运行速度，但是还是有弊病，那就是将dex翻译为本地机器码也要占用时间，所以Google在4.4之后推出了ART，用来替换Dalvik。

在4.4版本上，两种运行时环境共存，可以相互切换，但是在5.0+，Dalvik虚拟机则被彻底的丢弃，全部采用ART。ART的策略与Dalvik不同，在ART 环境中，应用在第一次安装的时候，字节码就会预先编译成机器码，使其成为真正的本地应用。之后打开App的时候，不需要额外的翻译工作，直接使用本地机器码运行，因此运行速度提高。

总的来说：

- JIT代表运行时编译策略，也可以理解成一种运行时编译器，是为了加快Dalvik虚拟机解释dex速度提出的一种技术方案，来缓存频繁使用的本地机器码
- AOT可以理解运行前编译策略，ART虚拟机的主要特征就是AOT


# 4. Android N上的改变

## 4.1 ART缺点

- dex->oat生成时间太久,进而apk安装时间很久
- dex2oat耗用系统资源太多，特别dex2oat占用cpu和memory
- oat文件过大，rom小的设备data空间会吃紧
- Powerconsumption 增加
- ART不太稳定，在M上crash问题太多，debug不太容易
- oat文件是elf格式，所以加载oat文件时候相关依赖库也很多，间接导致app进程占用Memory的增加

## 4.2 Android N的改变

先来看**[官方文档](https://developer.android.google.cn/about/versions/nougat/android-7.0.html#jit_aot)**描述：

> In Android N, we've added a Just inTime (JIT) compiler with code profiling to ART, which lets it constantlyimprove the performance of Android apps as they run. **The JIT compiler complements ART'scurrent Ahead of Time (AOT) compiler and helps improve runtime performance,save storage space, and speed up app updates and system updates**.
>
> 在 Android 7.0 中，我们添加了即时 (JIT) 编译器，对 ART 进行代码分析，让它可以在应用运行时持续提升 Android 应用的性能。JIT 编译器对 Android 运行组件当前的 Ahead of Time (AOT) 编译器进行了补充，有助于提升运行时性能，节省存储空间，加快应用更新和系统更新速度。
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

在AOT的编译方式基础上引入JIT，对于经常用的method用AOT方式，对于不经常用的method等用JIT，并且对于这些常用或者不常用维护一个profile。并且它可以以某一种方式最小影响battery的消耗，以及在设备空闲或者充电的情况做预编译。由此就可以解决上面提到的部分缺点。

启动JIT以及相关的profile功能打开如下开关：

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

dalvik.vm.usejit=true和dalvik.vm.usejitprofiles=true属性。