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

   DVM 解释执行的是 dex 字节码 .dex ：.java --> .class --> .dex --> .apk

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

# 20251201 更新

好的，这是一个非常经典的问题。DVM（Dalvik Virtual Machine）和 JVM（Java Virtual Machine）都是虚拟机，用于运行应用程序，但它们在设计目标、架构和技术实现上有显著区别。

简单来说，**DVM是为早期Android系统量身定做的，专注于在资源有限的移动设备上高效运行；而JVM是一个更通用、为桌面和服务器环境设计的平台。**

下面我们从几个维度进行详细对比：

---

## 1. DVM 和 JVM

### DVM/JVM 核心区别对比表

| 特性             | DVM（Dalvik Virtual Machine）                                | JVM（Java Virtual Machine）                                  |
| :--------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **出身与背景**   | 由谷歌（和开放手机联盟）开发，专为Android设计。              | 由Sun Microsystems（现属Oracle）开发，是Java平台的核心。     |
| **架构基础**     | **基于寄存器** 的架构。                                      | **基于栈** 的架构。                                          |
| **执行文件格式** | 执行 **`.dex` (Dalvik Executable)** 格式文件。               | 执行 **`.class`** 格式文件。                                 |
| **执行机制**     | 一个DVM进程可以同时执行多个 **`.dex`** 文件。                | 每个 **`.class`** 文件通常由一个类加载器单独加载。           |
| **内存与性能**   | 寄存器架构通常需要更多指令但指令数更少，执行速度可能更快，但代码体积可能稍大。 | 栈架构指令更紧凑（指令数多但体积小），但可能需要更多指令来完成相同操作。 |
| **进程与隔离**   | 在Android中，**每个应用运行在独立的DVM实例中**，这是一个Linux进程。这提供了更好的应用隔离和安全性。 | 通常多个Java应用或组件可以运行在同一个JVM进程中（如应用服务器）。 |
| **现状**         | **已被ART取代**。从Android 5.0（Lollipop）开始，DVM被ART（Android Runtime）替换。 | **至今仍是Java和JVM语言（Kotlin, Scala等）的绝对主流平台**。 |

---

### 关键区别详解

#### 1. 架构：基于寄存器 vs. 基于栈
这是最根本的技术区别。

*   **JVM（基于栈）**：
    *   它使用一个“操作数栈”来执行指令。所有操作（如加法、乘法）都是通过从栈顶弹出数据，进行计算，然后再将结果压回栈顶来完成的。
    *   **优点**：指令非常紧凑（因为不需要指定寄存器地址），与硬件无关性极好。
    *   **缺点**：完成一个操作需要更多的指令（load, store, push, pop等），理论上可能更慢。

    *示例：计算 `a = b + c`*
    ```
    iload_1  // 将变量b的值压入栈顶
    iload_2  // 将变量c的值压入栈顶
    iadd     // 弹出栈顶两个值相加，结果压回栈顶
    istore_3 // 弹出栈顶值，存入变量a
    ```

*   **DVM（基于寄存器）**：
    *   它使用虚拟寄存器来保存数据。指令直接对这些寄存器进行操作。
    *   **优点**：对于某些操作，指令数量更少，执行速度更快，更接近于本地机器码的执行方式。
    *   **缺点**：指令本身更长（因为需要指定寄存器地址），代码体积更大。

    *示例：计算 `a = b + c`*
    ```
    add-int v3, v1, v2  // 将寄存器v1和v2的值相加，结果存入寄存器v3
    ```

#### 2. 执行文件格式：`.dex` vs. `.class`
*   **JVM**： 编译Java代码后，会生成许多独立的 `.class` 文件。每个类对应一个文件。在运行时，JVM会按需加载这些文件。
*   **DVM**： Android编译工具（如dx）会将所有生成的 `.class` 文件进行转换、优化并**合并成一个或多个 `.dex` 文件**。
    *   **优点**：
        *   **共享常量池**： 多个类中相同的字符串、常量等只存储一次，极大地**减少了冗余**。
        *   **整体优化**： 可以在整个应用层面进行优化。
        *   **节省空间**： 这是为了适应早期Android设备存储和内存有限的情况而做的关键优化。

#### 3. 设计哲学与优化目标
*   **JVM**： 设计目标是“一次编写，到处运行”，强调可移植性和通用性。它通常运行在资源相对丰富的服务器或PC上。
*   **DVM**： 设计目标是在**内存、CPU和电池都受限的移动设备**上高效运行。因此，它在节省内存、提高性能和降低功耗方面做了大量优化。每个应用一个独立DVM实例的设计，也直接服务于Android的应用沙盒安全模型。

---

### DVM的演进：被ART取代

DVM使用的是 **JIT（即时编译）** ，即在应用运行时，将字节码逐段编译成本地机器码。这会导致应用在启动和运行初期有一些性能开销。

从 Android 5.0 开始，Google 用 **ART** 彻底取代了 DVM。ART 的核心改进是引入了 **AOT（预编译）** 机制：

*   **ART（Android Runtime）**：
    *   **在应用安装时**，就将DEX字节码**完全编译**成本地机器码。
    *   **优点**： 应用启动和执行速度更快，因为无需在运行时进行编译。
    *   **缺点**： 安装时间变长，占用存储空间更多。

后来的Android版本（如Android 7.0）引入了**混合模式**（JIT + AOT），在安装速度、存储空间和运行性能之间取得了更好的平衡。

### 总结

| 项目         | JVM          | DVM (历史角色) | ART (现代替代)            |
| :----------- | :----------- | :------------- | :------------------------ |
| **定位**     | 通用计算平台 | 移动设备优化   | 移动设备进一步优化        |
| **编译方式** | JIT (为主)   | JIT            | AOT -> 混合编译 (JIT+AOT) |
| **现状**     | 主流、活跃   | **已淘汰**     | Android现行标准           |

**结论**：DVM和JVM的主要区别源于它们不同的设计目标：一个为资源受限的移动设备，一个为通用的计算环境。虽然DVM本身已成为历史，但其设计的`.dex`格式和基于寄存器的思想被ART继承和发展。理解DVM有助于理解Android系统的演进和设计哲学。而今天的Android开发者，更应该关注的是ART的工作原理。

## 2. ART 工作原理

好的，我们来详细解析 **ART（Android Runtime）** 的工作原理。

ART 是 Android 5.0（Lollipop）以来取代 DVM（Dalvik Virtual Machine）的安卓运行时环境。它的核心目标是提升应用性能，特别是响应速度和流畅度。

### 核心演进：从 DVM 的 JIT 到 ART 的 AOT

要理解 ART，首先要看它和前任 DVM 最大的不同：

*   **DVM 使用 JIT（即时编译）**：应用在**运行时**，由虚拟机逐条将字节码解释执行，并对频繁执行的代码（热点代码）进行即时编译成本地机器码。这会导致启动和运行初期的性能开销。
*   **ART 引入 AOT（预编译）**：应用在**安装期间**，就将全部的字节码预先编译成本地机器码。这样应用在**运行时直接执行本地机器码**，无需再解释或即时编译，从而大幅提升运行效率。

---

### ART 的工作流程与演化

ART 并非一成不变，它经历了几个重要的阶段，其“工作原理”也在不断优化。

#### 阶段一：Android 5.0 ~ 6.0 的纯 AOT 模式

这是 ART 最初的工作方式，非常直接。

1.  **安装应用**：当你安装一个 APK 时，系统内部的 **`dex2oat`** 工具会启动。
2.  **预编译（AOT）**：`dex2oat` 读取 APK 中的 `.dex` 字节码文件，并将其**全部编译**成本地机器码。
3.  **存储机器码**：编译生成的机器码会以一个 `.oat` 或 `.odex` 文件的形式存储在设备的存储空间中。
4.  **运行应用**：当你启动这个应用时，系统直接加载并执行 `.oat` 文件中的本地机器码。

**优缺点**：
*   **优点**：运行速度极快，异常流畅。
*   **缺点**：
    *   **安装时间非常长**：编译整个应用很耗时。
    *   **占用存储空间大**：本地机器码比原始的 `.dex` 字节码大得多。
    *   **系统更新费时**：每次系统OTA更新，都需要重新编译所有应用。

#### 阶段二：Android 7.0 引入的混合模式（JIT + AOT）

为了解决纯 AOT 的缺点，Android 7.0（Nougat）为 ART 引入了 **JIT 编译器**，形成了一个混合编译系统，这也是目前 ART 的基石。

这个模式的工作流程变得更加智能，分为三个环节：

**1. 安装时：解释执行 + JIT 分析**
*   应用安装时**不再进行全量 AOT 编译**，安装速度极快。
*   应用首次运行时，字节码会被**解释器** 逐条解释执行（这与 DVM 最初阶段类似，但 ART 的解释器更高效）。
*   同时，**JIT 编译器** 开始工作，它监控应用的运行，识别出那些被频繁调用的“热点代码”。
*   JIT 会将这些热点代码**即时编译**成本地机器码，并缓存起来。当下次再执行到相同代码时，就直接使用缓存的机器码，从而提升运行速度。
*   JIT 还会**生成一个“性能分析文件”**，记录哪些方法（函数）是热点方法。

**2. 闲置时：基于分析的 AOT**
*   当设备**充电且空闲**时（连接电源，屏幕关闭，系统空闲），一个名为 **`dex2oat`** 的后台进程会启动。
*   它读取由 JIT 生成的“性能分析文件”，只将文件中记录的**热点方法**进行 AOT 编译，生成本地机器码。
*   这样，我们既避免了安装时编译所有代码的耗时，又让最常用的代码享受到了 AOT 编译的性能优势。

**3. 运行时：三层执行机制**
应用运行时，ART 采用一个三层结构来执行代码，确保性能和效率的平衡：
1.  **解释器**：对所有代码都可用，用于执行冷门代码，避免不必要的编译开销。
2.  **JIT 缓存**：执行已经由 JIT 编译过的热点代码。
3.  **AOT 代码**：执行已经由后台 AOT 编译好的热点代码。这是执行速度最快的层次。

系统会智能地在三者之间切换，这个调度机制的精妙之处在于：

1. **性能优先**：系统总是优先尝试使用最快的执行方式（AOT > JIT > 解释器）。
2. **无缝切换**：对开发者完全透明，应用代码无需任何修改。
3. **渐进优化**：一个方法可能会随着应用的使用，从“解释执行”升级到“JIT编译”，最终可能被“AOT编译”，性能逐步提升。
4. **资源高效**：避免了不必要的编译开销，只有真正被频繁使用的代码才会被升级到更快的执行层。

#### 阶段三：Android 10 引入的优化：执行配置文件

在 Android 10 及更高版本中，这个混合模式得到了进一步优化。

*   **云配置文件**：Google Play 可以收集**匿名化的、聚合的**性能分析数据（来自大量用户），形成一个“云配置文件”。
*   **首次启动即优化**：当你安装一个新应用时，Play Store 可以附带下载这个应用的云配置文件。在安装过程中，ART 就可以直接根据这个配置文件，对已知的热点方法进行 AOT 编译。
*   **好处**：这意味着应用**在第一次运行时就能达到最佳性能**，而不是需要用户使用几次、经过后台分析编译后才能变快。

---

### ART 的其他关键特性和优势

除了核心的编译技术，ART 还带来了其他重要改进：

*   **更高效的垃圾回收（GC）**：
    *   **暂停次数更少**：ART 将 GC 中的两次暂停减少到一次，大大提升了响应速度。
    *   **并行化**：GC 过程与应用逻辑并行执行，进一步减少对应用性能的干扰。
*   **更好的调试支持**：支持更多的采样分析工具、堆栈转储和调试特性。
*   **64位支持**：原生支持 64 位架构，为更强大的移动计算奠定了基础。

### 总结

ART 的工作原理可以概括为：

> **一个智能的、分层编译的运行时系统。它通过在安装时快速解释执行，在运行时使用 JIT 进行即时优化，并在设备闲置时基于性能分析对关键代码进行预编译（AOT），最终实现了安装速度、存储空间占用和运行时性能三者之间的最佳平衡。**

这种演进体现了 Android 系统在追求极致性能的同时，也越来越注重用户体验的细节。

## 3. JIT 工作过程

这是一个非常好的问题，它触及了 JIT 工作原理的核心细节。

简单答案是：**通常情况下，JIT 在本次运行期间编译的热点代码，其缓存会在应用进程被杀死后失效。下次冷启动应用时，需要重新进行 JIT 编译。**

下面我们来详细解释这个过程。

### JIT 的工作周期：进程内有效

1.  **本次运行期间（应用在后台）**：
    *   当你启动一个应用，JIT 开始工作。它监视执行的代码，识别出热点方法。
    *   它将这些热点方法编译成本地机器码，并存储在一个**专属于当前进程的“JIT 代码缓存”** 中。
    *   只要这个应用进程还活着（即使你切换到其他应用，但它还在后台运行），这个代码缓存就一直有效。
    *   如果你从后台切回这个应用，执行到之前编译过的热点代码，系统会直接使用缓存中的机器码，无需重新编译，所以体验会很流畅。

2.  **应用被彻底杀死后（下次冷启动）**：
    *   当系统需要释放内存时，或者用户手动“强制停止”应用后，该应用的进程会被完全销毁。
    *   进程拥有的所有资源都会被系统回收，这其中就包括 **JIT 代码缓存**。
    *   因此，当你下次**冷启动**这个应用时，JIT 需要从零开始，重新解释执行字节码，重新识别热点代码，并重新进行编译。

### 为什么 JIT 不持久化缓存？

你可能会想，如果把 JIT 编译好的代码保存到磁盘上，下次启动直接使用，不是更快吗？这主要是因为 **JIT 的优化特性**：

*   **动态优化**：JIT 的优势在于它能根据**本次运行的实际情况**进行优化。例如，它可以根据代码执行的路径、变量的实际类型进行非常激进的优化（如内联、去虚拟化等）。这些优化是基于运行时信息的，每次运行的情况可能略有不同，所以上次的优化结果可能不适用于下次。
*   **缓存失效问题**：如果应用的代码更新了，或者运行环境发生了变化，持久化的缓存就会失效，管理这些缓存的版本和有效性会变得非常复杂。

### ART 的巧妙设计：连接 JIT 与 AOT

正是因为 JIT 缓存的“临时性”，ART 才引入了 **“混合模式”** 来弥补这个缺陷。这个过程完美地解释了 JIT 和 AOT 是如何协作的：

1.  **首次运行（JIT 工作并分析）**：
    *   应用冷启动，所有代码通过解释器执行。
    *   JIT 开始工作，编译热点代码，同时**生成一个“执行配置文件”**，记录下哪些方法被频繁调用。

2.  **设备闲置时（AOT 介入）**：
    *   当手机充电且空闲时，ART 的 `dex2oat` 工具会读取 JIT 生成的**执行配置文件**。
    *   然后，它根据这个“指南”，只将配置文件中记录的**热点方法**进行**预编译（AOT）**，并将结果以 `.odex` 文件的形式**持久化存储到磁盘上**。

3.  **后续运行（享受持久化好处）**：
    *   当你再次冷启动应用时，系统会直接加载那些已经被 AOT 编译好的热点方法机器码。
    *   对于非热点代码，或者本次运行新出现的热点代码，仍然会走解释器 -> JIT 的流程。
    *   这样，应用在启动时就能获得很好的性能，因为最关键的路径代码已经是本地机器码了。

### 总结

| 编译方式 | 编译时机          | 缓存是否持久化   | 优点                         | 缺点                                |
| :------- | :---------------- | ---------------- | :--------------------------- | :---------------------------------- |
| **JIT**  | **运行时**        | **否**（进程级） | 动态优化、安装快、占用空间小 | 冷启动性能差、有运行时开销          |
| **AOT**  | **安装时/闲置时** | **是**（磁盘级） | 运行性能最佳、无运行时开销   | 安装/更新慢、占用空间大、优化不灵活 |

所以，回到你的问题：

*   **JIT 编译是每次冷启动后都需要重新进行的。**
*   但 ART 的智慧在于，它利用 JIT 的**分析能力**来指导 AOT 进行**持久化编译**，从而使得频繁使用的应用在多次启动后，其性能会逐渐接近纯 AOT 的水平，同时又避免了纯 AOT 的所有缺点。

## 4. ART 的 GC 机制

好的，我们来详细解析 ART（Android 5.0+）中更高效的垃圾回收机制。与 DVM 的 GC 相比，ART 的 GC 在效率、速度和对应用响应能力的影响上都有了质的飞跃。

### 核心改进：从 DVM 的“拖沓”到 ART 的“流畅”

要理解 ART GC 的高效，我们先回顾一下 DVM GC（特别是 Android 2.3 之前）的主要问题：

*   **两次完整的暂停**：DVM 的 GC 会进行两次 `Stop-the-World` 暂停。在暂停期间，**所有应用线程（包括 UI 主线程）都会被挂起**，导致应用卡顿、界面无响应。
*   **保守的回收**：DVM 的 GC 算法相对保守，容易产生内存碎片。
*   **与 JIT 协作不佳**：JIT 编译器自身也会产生一些临时对象，给 GC 带来额外压力。

ART 的 GC 针对这些问题进行了彻底的重新设计。

---

### ART 高效垃圾回收的关键特性

#### 1. 更少的暂停，尤其是并发 GC

这是 ART GC 带来的最显著的体验提升。

*   **DVM**：两次 `Stop-the-World` 暂停。
    *   第一次暂停：标记阶段，找出所有活动对象。
    *   第二次暂停：清理阶段，回收内存。
*   **ART**：**绝大多数情况下只有一次 `Stop-the-World` 暂停。**
    *   ART 将 **标记阶段** 设计成了**并发**的。这意味着 GC 可以**与应用线程同时运行**。GC 线程在后台标记活动对象，而你的应用主线程仍在正常运行，渲染 UI 和处理事件。
    *   只有 **清理阶段** 需要一次非常短暂的 `Stop-the-World` 暂停。这次暂停的时间极短，以至于用户几乎无法察觉。

**体验对比**：
*   **DVM**：GC 时，应用可能会明显“卡”一下。
*   **ART**：GC 在后台悄悄进行，应用保持流畅，用户基本感知不到 GC 的发生。

#### 2. 更快的垃圾回收周期

ART 的 GC 算法本身更加高效，执行一次完整的 GC 周期所需的时间比 DVM 更短。这不仅减少了暂停的持续时间，也降低了整体的 CPU 开销，有助于节省电量。

#### 3. 改进的堆内存整理与内存映射交换

这是解决内存碎片化和 `OutOfMemoryError` 的关键。

*   **背景**：频繁的分配和释放会导致堆内存出现“碎片”。即使总空闲内存足够，也可能因为找不到一块连续的足够大的内存来分配大对象而导致 OOM。
*   **DVM**：使用一种称为 `mark-sweep`（标记-清除）的算法，它只标记和清除死对象，但**不整理**存活对象，因此无法解决内存碎片问题。
*   **ART**：引入了更先进的算法，包括：
    *   **部分堆压缩**：ART 不会在每次 GC 时都整理整个堆，那太耗时了。它会**选择性地对堆的特定区域进行整理**，将存活对象移动到一起，从而合并出大块的连续空闲内存。
    *   **内存映射交换**：
        *   对于像 `ByteBuffer` 这类不是由 GC 直接管理的“廉价”对象，ART 和 DVM 都会在原生堆（Native Heap）中为其分配内存。
        *   DVM 中，当这个对象在 Java 堆中被回收时，其对应的原生内存也需要被显式回收，否则会导致原生内存泄漏。
        *   ART 通过更智能的**内存映射交换** 技术，能将 Java 堆中的对象与其在原生堆中的内存更紧密地绑定在一起。当 Java 对象被 GC 回收时，其关联的原生内存也**更有把握地被自动、及时地释放**，这减少了原生内存泄漏的风险。

#### 4. 针对不同代际的优化策略

ART 的 GC 采用了**分代收集** 策略，这是现代高效 GC 的标配。其核心思想是“**弱分代假说**”：绝大多数对象都是朝生夕死的。

ART 将堆内存分为两个主要区域：

1.  **年轻代**：
    *   新创建的对象都被分配在这里。
    *   这里的 GC 发生得非常频繁，但速度极快，因为它只扫描这一小块区域。
    *   目标是快速回收那些用完即弃的临时对象。

2.  **老年代**：
    *   在年轻代中经历过多次 GC 后仍然存活的对象，会被提升到老年代。
    *   这里的对象通常生命周期更长，GC 发生的频率较低，但每次处理的量更大，耗时也更长。

**这种分代的好处**：
*   **效率高**：大部分 GC 都只发生在年轻代，速度快、暂停时间短。
*   **针对性**：对不同生命周期的对象使用不同的回收策略，总体开销更小。

#### 5. 与 JIT/AOT 的更好协作

*   ART 的运行时（包括 JIT/AOT 编译器）与 GC 是共同设计的，它们共享一些内部结构。
*   这使得 GC 能够更精确地识别 JIT/AOT 产生的元数据和临时对象，避免它们被误判为垃圾，或者确保它们能被及时回收，减少了内存开销。

### 总结：ART GC 如何实现高效

| 特性               | DVM GC                | ART GC                    | 带来的好处                              |
| :----------------- | :-------------------- | :------------------------ | :-------------------------------------- |
| **暂停次数**       | 2 次 `Stop-the-World` | **1 次 `Stop-the-World`** | 应用响应更及时，卡顿减少                |
| **标记阶段**       | 同步（暂停应用）      | **并发**（与应用并行）    | UI 主线程几乎不受 GC 影响               |
| **堆整理**         | 不整理，易碎片化      | **并行化部分压缩**        | 减少 `OutOfMemoryError`，更有效利用内存 |
| **收集策略**       | 主要为单一策略        | **分代收集**              | GC 周期更快，整体开销更低               |
| **与非堆内存协作** | 相对薄弱              | **内存映射交换**          | 减少原生内存泄漏                        |

总而言之，ART 的垃圾回收通过 **并发标记、减少暂停、分代收集和智能堆整理** 等一系列组合拳，极大地降低了垃圾回收对应用性能和用户体验的负面影响，使得 Android 应用能够运行得更流畅、更稳定。这对于移动设备有限的资源和用户对流畅性的高要求至关重要。

DVM 使用 Mark-Sweep GC，不分代、不压缩，STW 时间很长，因此早期 Android 常卡顿。
 ART 使用分代 GC、并发标记、Sticky GC、部分压缩和 region-based GC，暂停时间极短，内存碎片大幅减少，同时 AOT 让 GC 更高效。

下面给你用 **超清晰、好理解、不绕弯子** 的方式解释这三种 GC：
 **Sticky GC、Generational GC、Region-based GC（基于 region 的 GC）**。
 它们都是 ART Runtime 在不同层次上的优化。

------

## 5 Sticky GC/Gen GC/Region-based GC



### 5.1 Sticky GC（ART 特有的轻量级 GC）

Sticky GC 用来处理：

- 最近被修改过引用的对象（Dirty Cards），利用 Write Barrier 标记：
  - 哪些内存区域被修改（Dirty）
  - Sticky GC 只扫描“脏卡”区域
- 刚分配的新对象（Young Generation），这些对象通常还没晋升到老年代。
- 不扫描全部 Young Generation
- 不扫描 Old Generation
- 不进行压缩
- 不做并发标记
- 只扫“Dirty Cards + 新生代中的部分对象”

为什么叫 Sticky？因为它假设：

- 老年代（以前存活的对象）大概率还活着
- **只“黏住”扫描那些“最近修改过的区域”**

如何判断“最近修改”？

ART 使用：

- **Card Table（卡表）**
- **Write Barrier（写屏障）**

当某个对象引用发生变化时，对应内存区域被标记为“Dirty Card”。

Sticky GC 的特点：

- 扫描范围非常小（基本只扫新生代 + Dirty Card）
- 执行速度极快（通常 < 1ms）
- 减少 STW

类比举例：

- **普通 GC** = 把整个房子的垃圾全打扫
- **Sticky GC** = 只打扫“刚刚弄脏”的地方

------

### 5.2 Generational GC（分代 GC）

一句话理解：

Generational GC = 新生代频繁回收，老年代几乎不动。**

基本观察：

在几乎所有语言中（Java/C#/ART 都一样）对象分布规律是：

- **80% 的对象很快死亡（瞬时对象）**
- 只有小部分对象长期存活

所以 ART 把堆分成两类：

------

**（1）Young Generation（新生代）**

- 存放新创建的对象
- 死亡率高
- GC 非常快（通常就是 Sticky GC）
- 每次 Young GC 后，存活的对象可能晋升到 Old Generation



<font color=red>**Sticky GC 是 Young GC 中的“超轻量版”，主要清理最近脏的那一点点。Young GC 扫整个新生代，是正常的少量停顿回收。**</font>

------

**（2）Old Generation（老年代）**

- 存放长时间存活的对象
- GC 很少触发（减少暂停时间和扫描量）
- 通常使用并发 GC（Concurrent Mark Sweep）

------

为什么这样能变快？

只有新生代需要频繁扫描，老年代不动。

类比举例：

- **新生代** = 快递包装垃圾（每天都有，大多数一次性）
- **老年代** = 家具电器（很少扔）

=> 每天只清理快递垃圾，不需要每天检查家具。

------

### 5.3 Region-based GC（基于 Region 的 GC）

（Android 8+）

一句话理解：

Region GC = 不再把堆区分“老/新”，而是切成很多小块，每块都能单独 GC。**

为什么需要 Region GC？

在大型应用中：

- 对象生命周期复杂
- 新生代/老年代划分很难合适
- 特别是像 G1 那样减少全堆扫描更重要

因此 Android 8 开始引入更现代的结构。

------

Region GC 的核心思想：

- 把整个 heap 划分为几十到几百个 Region（每个大约 256KB～1MB）
- 每个 Region 包含生命周期接近的对象
- GC 时只处理“部分 Region”（partial/selected GC）
- 避免全堆扫描
- 结合 Concurrent 标记减少 STW

好处：

- 没有严格的“新生代/老年代”边界，动态更灵活
- Region 可以作为复制、压缩的单位
- 能类似 G1 GC 做 incremental / partial GC
- 处理大对象更灵活（可以放到大 Region）

类比：

- 以前的 GC 是把堆分两层（新生代、老年代）
- Region GC = 把堆分成很多小球场
  - 哪块脏，就扫哪块
  - 哪块空了，就回收哪块
  - 哪块碎了，就整理哪块

------

### 5.4 三者的关系（最关键）

它们不是互相替代，而是 **分层补充、叠加**：

| 机制                | 作用层面                            | ART 是否使用      |
| ------------------- | ----------------------------------- | ----------------- |
| **Sticky GC**       | 微型、小范围 GC（主要扫新对象）     | ✔ ART 独有        |
| **Generational GC** | 把对象按生命周期分代，提高回收效率  | ✔ ART 长期使用    |
| **Region-based GC** | 更细粒度划分 heap，提高并发与局部性 | ✔ Android 8+ 引入 |

最终形成：

> **Region-based heap + Generational strategy + Sticky GC + Concurrent GC 流程**
>  共同减少 STW、减少扫描量、减少碎片。

------

📌 最形象的总结（让你从此不糊涂）

```
               +--------------------+
               |    Region GC       |
               |  (分成小块来扫)       |
               +----------+---------+
                          |
                   分代策略（Generational）
                     /            \
         Young Region              Old Region
                |
           Sticky GC（扫最脏的部分）
```

------

✔ 面试官喜欢问的延伸点：

- 为什么 Sticky GC 能做到几百微秒？
- 为什么 Android 8 用 Region GC 而不是整套 G1？
- 新生代大小怎么影响性能？

Android ART 从 Android 8 以后采用 region-based heap，结合分代 GC、Sticky GC、并发标记和局部压缩。
整个 GC 是通过 region + generational + concurrent 来降低 STW。
所以最新 Android 使用的是 Region-based Generational Concurrent GC。

**对象实例和数组 → 一律在堆**
 **实例字段（哪怕是基本类型）→ 在堆**
 **static 字段本身 → 在 Metaspace（元空间）
 static 字段指向的对象 → 在堆**
 **方法局部变量（基本类型 & 引用）→ 栈
 局部 new 的对象 → 堆**