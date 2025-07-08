---
title: CAN Bus协议详解
copyright: true
date: 2025-02-20 14:18:41
tags:
categories: Vehicle
password:
---

> **CAN 总线** 

<!--more-->



## CAN 报文结构

### 标准 CAN 报文结构（11位标识符）

| 字段名称                 | 长度        | 作用说明                                                     |
| ------------------------ | ----------- | ------------------------------------------------------------ |
| **SOF（起始帧标志）**    | 1 bit       | 标识帧的开始，恒为 0                                         |
| **Identifier（标识符）** | 11 bits     | 标识帧的优先级和数据类型（越小优先级越高）                   |
| **RTR（远程请求）**      | 1 bit       | 区分数据帧（0）和远程帧（1）                                 |
| **IDE（标识符扩展）**    | 1 bit       | 0 = 标准帧，1 = 扩展帧                                       |
| **r0（保留位）**         | 1 bit       | 保留，未来使用                                               |
| **DLC（数据长度）**      | 4 bits      | 数据区长度（0～8 字节）                                      |
| **Data（数据域）**       | 0～64 bits  | 实际传输的数据（最多 8 字节，CAN FD 最多 64 字节）           |
| **CRC（循环冗余校验）**  | 15 bits + 1 | 用于校验数据正确性                                           |
| **ACK（确认位）**        | 2 bits      | 接收端确认收到（主动填 0），若接收方收到数据无误，则在 ACK 位上置为显性电平（0） |
| **EOF（帧结束）**        | 7 bits      | 标识一帧数据结束                                             |
| **IFS（帧间隔）**        | ≥3 bits     | 帧之间的间隔时间                                             |

### 扩展帧（29位标识符）增加字段如下：

| 字段名称       | 长度    | 说明                                               |
| -------------- | ------- | -------------------------------------------------- |
| **Identifier** | 29 bits | 使用 IDE=1，分为 base ID（11位） + 扩展 ID（18位） |

其他字段结构与标准帧相同，仅标识符长度不同

- 属于 **经典 CAN 的帧格式变种**

- 报文 ID 长度从标准帧的 **11 位** → **扩展为 29 位**
- 用于支持更多的消息标识符（适合节点多的系统）
- 数据长度：**最多 8 字节（不变）**
- *用途**：仅改变了 ID 范围，带宽没变

举个例子：标准 CAN 数据帧结构简图

| SOF   | Identifier | RTR   | IDE   | r0    | DLC   | Data  | CRC     | ACK    | EOF    |
| ----- | ---------- | ----- | ----- | ----- | ----- | ----- | ------- | ------ | ------ |
| 1 bit | 11 bits    | 1 bit | 1 bit | 1 bit | 4 bit | 0~8 B | 16 bits | 2 bits | 7 bits |

### 拓展：CAN FD 报文（Flexible Data-Rate）

- 最大数据长度：**64 字节**
- 增加了 **BRS（波特率切换）**、**ESI（错误状态）** 等字段

### CAN 和 CAN FD 对比

| 项目             | 经典 CAN 标准帧 | 经典 CAN 扩展帧 | CAN FD 标准帧          | CAN FD 扩展帧 |
| ---------------- | --------------- | --------------- | ---------------------- | ------------- |
| 报文 ID 长度     | 11 位           | 29 位           | 11 位                  | 29 位         |
| 最大数据长度     | 8 字节          | 8 字节          | **64 字节**            | **64 字节**   |
| 速率             | ≤ 1 Mbps        | ≤ 1 Mbps        | **≤ 8 Mbps（数据段）** | 同左          |
| 是否支持动态速率 | 否              | 否              | 是                     | 是            |
| 是否需要特殊硬件 | 否              | 否              | **是**                 | 是            |

### CAN FD 和 Ethernet 对比

| 对比项          | **CAN FD**                                  | **汽车以太网（Automotive Ethernet）**    |
| --------------- | ------------------------------------------- | ---------------------------------------- |
| 带宽            | 最多 **8 Mbps**                             | **100 Mbps、1 Gbps，甚至 10 Gbps**       |
| 数据长度        | 最多 64 字节                                | 几千字节甚至更多                         |
| 硬件成本        | ✅ 低                                        | ❌ 高                                     |
| 实时性          | ✅ 强，天生为控制类设计                      | 中等，依赖协议栈（TSN可改善）            |
| 应用领域        | **车身控制、BCM、窗、门、电机等低带宽模块** | **ADAS、摄像头、雷达、中央网关、IVI 等** |
| 架构支持        | 传统ECU架构、分布式                         | **域控制器/Zonal/中央计算架构**          |
| 开发/维护复杂度 | 简单                                        | 相对复杂                                 |
| 协议栈          | 简单（CAN协议或SOME/IP over CAN）           | 复杂（TCP/IP、SOME/IP over Ethernet 等） |

### 适用场景举例

| 场景                | 推荐通信方式      | 原因                 |
| ------------------- | ----------------- | -------------------- |
| 车窗/空调/座椅控制  | CAN / CAN FD      | 低速、可靠、实时性好 |
| ADAS 摄像头数据传输 | Ethernet          | 带宽需求高           |
| 电池管理系统（BMS） | CAN FD            | 实时、帧长大         |
| OTA/车载娱乐系统    | Ethernet          | 文件/音视频传输多    |
| 自动泊车雷达控制    | CAN FD / Ethernet | 视具体架构           |

``` mermaid
graph TD
    subgraph High-Bandwidth & Compute Domain [高速计算与信息娱乐域]
        ADAS_ECU[高级驾驶辅助系统 ADAS ECU]
        IVI_ECU[信息娱乐系统 IVI ECU]
        DOMAIN_CTRL[域控制器 / 区域网关]
        ADAS_ECU -- 以太网 (Ethernet) --> CENTRAL_GATEWAY
        IVI_ECU -- 以太网 (Ethernet) --> CENTRAL_GATEWAY
        DOMAIN_CTRL -- 以太网 (Ethernet) --> CENTRAL_GATEWAY
    end

    subgraph Powertrain & Chassis Domain [动力总成与底盘域]
        ENGINE_ECU[发动机控制单元]
        TRANS_ECU[变速箱控制单元]
        BRAKE_ECU[制动控制单元]
        STEER_ECU[转向系统ECU]
        ENGINE_ECU -- CAN FD --> CENTRAL_GATEWAY
        TRANS_ECU -- CAN FD --> CENTRAL_GATEWAY
        BRAKE_ECU -- CAN FD --> CENTRAL_GATEWAY
        STEER_ECU -- CAN FD --> CENTRAL_GATEWAY
    end

    subgraph Body & Comfort Domain [车身与舒适域]
        BCM_ECU[车身控制模块 BCM]
        HVAC_ECU[空调控制单元]
        DOOR_ECU_1[车门控制单元 1]
        DOOR_ECU_2[车门控制单元 2]
        BCM_ECU -- CAN FD --> CENTRAL_GATEWAY
        HVAC_ECU -- CAN FD --> CENTRAL_GATEWAY
        BCM_ECU -- LIN 总线 --> DOOR_ECU_1
        BCM_ECU -- LIN 总线 --> DOOR_ECU_2
    end

    subgraph Diagnostic & External Access [诊断与外部访问]
        OBD_PORT[OBD-II 诊断端口]
        OBD_PORT -- CAN FD / 以太网 --> CENTRAL_GATEWAY
    end

    CENTRAL_GATEWAY(中央网关ECU)

    style CENTRAL_GATEWAY fill:#FFD700,stroke:#B8860B,stroke-width:2px,font-weight:bold
    style ADAS_ECU fill:#ADD8E6,stroke:#00008B,stroke-width:1px
    style IVI_ECU fill:#ADD8E6,stroke:#00008B,stroke-width:1px
    style DOMAIN_CTRL fill:#ADD8E6,stroke:#00008B,stroke-width:1px
    style ENGINE_ECU fill:#90EE90,stroke:#228B22,stroke-width:1px
    style TRANS_ECU fill:#90EE90,stroke:#228B22,stroke-width:1px
    style BRAKE_ECU fill:#90EE90,stroke:#228B22,stroke-width:1px
    style STEER_ECU fill:#90EE90,stroke:#228B22,stroke-width:1px
    style BCM_ECU fill:#FFB6C1,stroke:#FF69B4,stroke-width:1px
    style HVAC_ECU fill:#FFB6C1,stroke:#FF69B4,stroke-width:1px
    style DOOR_ECU_1 fill:#DDA0DD,stroke:#9400D3,stroke-width:1px
    style DOOR_ECU_2 fill:#DDA0DD,stroke:#9400D3,stroke-width:1px
    style OBD_PORT fill:#E6E6FA,stroke:#8A2BE2,stroke-width:1px

```

