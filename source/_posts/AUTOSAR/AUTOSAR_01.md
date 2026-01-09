---
title: AutoSar 学习
copyright: true
date: 2024-08-30 22:30:11
tags: AUTOSAR
categories: AUTOSAR
password:
---

> AutoSar 学习

<!--more-->

什么是 SWC



## SWC

### SWC 类型

- 原子级 SWC：不可拆分的 SWC，最小逻辑单元，对应一个 `.C` 文件
  - Application
    - 实现算法
  - Sensor/Actuator
    - 为 Application 提供 I/O 量
    - 与 ECU 绑定（不像 Application 那样能在各 ECU 上自由映射）
- 集合级 SWC：数个 SWC 的逻辑集合
- 特殊的 SWC：

SWC 之间通过虚拟功能总线(VFB，Virtual Function Bus) 通信，属于片内总线，ECU 之间则通过片外总线（CAN/LIN 等）通信；

### SWC 组成

- Ports
- Runnables
  - 包含实际实现的函数（具体的逻辑算法或者操作）
  - Runnables 由 RTE 周期性或事件触发调用

#### Ports

- 和其他 SWC 的通信端口
- 通信内容：Data elements(S/R) 与 operations(C/S)

##### Ports 类型

###### S/R 接口

- Send/Receiver(Receiver)：接收接口

- Send/Receiver(Send)：发送接口

主要用来 SWC 之间传输数据，不仅仅可以传输基础数据类型，也可以传输数组/结构体等，主要是**通过调用全局变量**来传输数据

###### C/S 接口

- Client/Server(Server)：服务接口
- Client/Server(Client)：客户接口
- Send/Receiver(Send & Receiver)：发送且接收接口

Server 提供服务，Client 通过调用 Server 提供的服务来完成一些操作，**通过函数(Runnable)调用**；

服务的调用可以是同步也可以是异步的

其中 Receiver 和 Client 属于 Require Ports(R-Ports) 需求接口，Send 和 Server 属于 Provide Ports(P-Ports) 提供接口，Send & Receiver 属于 Provide Require Ports(PR-Ports) 需求且提供接口；

- 提供 Operation 服务
- 通信方式：1:1 或者 n:1（与 S/R 对应），即一个 Client 可以对 1 个或多个 Server
  - Client 可以调用多个 Server 端口，也可以调用单个 Server 里的多个服务；
- 同步或异步
- 一个 C/S port 包含多种 Operations
- Operations 可以被单个调用

#### Runnable Entity

可运行实体，其实就是 `.c` 文件内的函数；

- 一个 SWC 可以包含多个 Runnable Entity，即一个 `.c` 文件可以包含多个函数，每个函数可以执行一个特定的操作；

  *Note：通过达芬奇工具生成函数时生成的是空函数，需要手动添加代码来实现功能；*

- Runnable Entity 必须要挂在 Task 上，就像函数如果只是放在那里没用被调用的话也不起作用，总归是要挂在某个 Task 上才会被运行；

## RTE(Run-Time Environment)

RTE 在 AUTOSAR 软件架构中介于应用层和基础软件层之间，**是 AUTOSAR 虚拟功能总线（VFB）接口的实现**，从而为应用软件（Application Software）组件之间的通信提供基础设施服务，并促进对包括 OS 在内的基础软件（BasicSoftware）组件的访问；

即可以理解为 SWC 之间传递数据或者函数调用的时候，就要通过 RTE，SWC 之间是不能直接传递/调用的；

RTE 功能

- 提供基础的通信服务
- 提供 AUTOSAR 软件组件访问基本软件模块服务

## BSW

![AutoSAR_Arch](../../images/2025/AutoSAR_Arch.jpg)

### BSW 分层

- Service Layer
- ECU Abstraction Layer
- Microcontroller Abstraction Layer

### Microcontroller Abstraction Layer(MCAL)

目的

- 使上层软件与微处理器（MCU）型号无关

功能

- 包含 MCU 中内部外设（比如 MCU 内部的 ROM/RAM 等）的驱动
- 包含使用 MCU 内存映射的外部设备的驱动

### ECU Abstraction Layer

目的

- 使上层软件与 ECU 硬件设计无关
  - 即 ECU 抽象层是和硬件设计有关的，硬件又包含 MCU，MCU 又与 Microcontroller Abstraction Layer 有关

功能

- 包含 ECU 板上外部设备的驱动
  - MCU 内部有很多外设，整个 PCB 上除了 MCU 还有其他的芯片（？），ECU 抽象层就是用来写一些 PCB 上面其他外部设备的一些驱动
- 内部设备与外部设备的接口（I/O）

### Service Layer

目的

- 提供给应用程序可用的服务

功能

- 诊断，非易失性内存管理，操作系统，通信
- 内存和 ECU 管理

### Complex Device Drivers

目的

- 提供复杂传感器和执行器的驱动

功能

- 重要的应用模块可以直接访问硬件资源
- 例如：喷油量控制，胎压监测

### RTE

目的

- 使 SWC 与 ECU 的映射无关

功能

- 提供通信服务的中间层（ECU 内部/间通信）



https://www.bilibili.com/video/BV1yP411L7J2/?spm_id_from=pageDriver&vd_source=f889f5c1247c251796db94759036033b

























