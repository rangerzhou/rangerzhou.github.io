---
title: Renesas Flash guide
copyright: true
date: 2018-11-20 10:09:13
tags:
categories: Others
password: zr
---



> 此文介绍 Renesas 项目刷机指南。

<!--more-->

### 1. 刷入 IPL

1. 安装 [Tera Term](https://osdn.net/projects/ttssh2/releases) ，打开后如果驱动安装正常，会自动选择相应端口（Setup - Serial port），Speed: 115200，Data: 8 bit，Parity: none，Stop bits: 1 bit，Flow control: none。

2. 连接串口线，断开左边 3 个跳冒。

3. 打开电源，显示如下：

   ```shell
    SCIF Download mode (w/o verification)
    (C) Renesas Electronics Corp.
   
   -- Load Program to SystemRAM ---------------
   please send !
   ```

   选择 File - Send file ，选择 .mot 文件，Open。

4. Writing data

   |        Filename        | Program Top Address | Flash Save Address |      Description       |
   | :--------------------: | :-----------------: | :----------------: | :--------------------: |
   |   bootparam_sa0.srec   |     0xE6320000      |      0x000000      | Loader(Boot parameter) |
   | bl2-<board_name>.srec  |     0xE6304000      |      0x040000      |         Loader         |
   |  cert_header_sa6.srec  |     0xE6320000      |      0x180000      | Loader(Certification)  |
   | bl31-<board_name>.srec |     0x44000000      |      0x1C0000      |  ARM Trusted Firmware  |
   | tee-<board_name>.srec  |     0x44100000      |      0x200000      |         OP-Tee         |
   |    u-boot-elf.srec     |     0x50000000      |      0x640000      |         U-Boot         |

   执行 `xls2` 命令，按照要求输入选择，分别输入 Top Address 和 Save Address，选择相应文件 send，重复上面步骤依次刷入上表中所示文件。

5. Remove the power and red and yellow uart pin, Then Power the board. (关机开机？)



### 2. 刷入 Android

1. 连接 USB 到电脑，Tera Term 中输入如下指令：

   ```shell
   # 按 C 中断 autoboot
   => env default -a
   => saveenv
   => reset
   # 按 C 中断 autoboot
   => fastboot
   ```

2. 进入 img 目录，赋予 fastboot 和 fastboot.sh 执行权限，在连接 USB 的电脑终端输入：

   ```shell
   $./fastboot oem format
   $./fastboot reboot-bootloader
   $./fastboot.sh --nobl
   ```

   等待刷机完成。