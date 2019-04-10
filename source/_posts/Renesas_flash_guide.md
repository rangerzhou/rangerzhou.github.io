---
title: Renesas Flash guide
copyright: true
date: 2018-11-20 10:09:13
tags:
categories: APTIV
password: zr.
---



> Renesas Flash guide.

<!--more-->

### 1. 编译

编译步骤：Android → QNX App → QNX Hypervisor

#### 1.1 编译 Android

``` shell
$ ./GWM_V3/AOSP/build_all.sh
# 生成 Android image:
out/target/product/salvator/system.img
out/target/product/salvator/vendor.img
out/target/product/salvator/userdata.img
out/host/linux-x86/bin/fastboot
# 生成 IPL:
out/target/product/salvator/bl2.srec
out/target/product/salvator/bl31.srec
out/target/product/salvator/bootparam_sa0.srec
out/target/product/salvator/cert_header_sa6.srec
out/target/product/salvator/tee.srec
out/target/product/salvator/u-boot-elf.srec
# Guest OS file(auto compile to QNX data.img):
out/target/product/salvator/obj/KERNEL_OBJ/arch/arm64/boot/dts/renesas/r8a7795-salvator-xs.dtb
out/target/product/salvator/obj/KERNEL_OBJ/arch/arm64/boot/Image
```

#### 1.2 编译 QNX APP

``` shell
$ ./GWM_V3/QNX/APP/ICC_CLUSTER/sw/buildv3.sh
```

#### 1.3 编译 QNX + Hypervisor

``` shell
$ ./GWM_V3/QNX/Hypervisor/qnx700/build_all.sh
# 生成 images：
GWM_V3/QNX/Hypervisor/qnx700/bsp/BSP_hypervisor-host_br-mainline_be-700_SVN854175_JBN863/images/generated/diskimage/boot.img

GWM_V3/QNX/Hypervisor/qnx700/bsp/BSP_hypervisor-host_br-mainline_be-700_SVN854175_JBN863/images/generated/diskimage/extbin.img

GWM_V3/QNX/Hypervisor/qnx700/bsp/BSP_hypervisor-host_br-mainline_be-700_SVN854175_JBN863/images/generated/diskimage/factory.img

GWM_V3/QNX/Hypervisor/qnx700/bsp/BSP_hypervisor-host_br-mainline_be-700_SVN854175_JBN863/images/generated/diskimage/persistence.img
# 如果编译出现 ERROR "make[1]: img2simg: Command not found"
$ sudo apt install android-tools-fsutils
# 或者 sudo apt install img2simg
```

### 2. 刷机

#### 2.1. 刷入 IPL

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

   执行 `xls2` 命令，选择 `3 : HyperFlash` ，输入2次 Y，

   ``` shell
   >xls2
   ===== Qspi/HyperFlash writing of Gen3 Board Command =============
   Load Program to Spiflash
   Writes to any of SPI address.
   Please select,FlashMemory.
      1 : QspiFlash       (U5 : S25FS128S)
      2 : QspiFlash Board (CN3: S25FL512S)
      3 : HyperFlash      (SiP internal)
     Select (1-3)>3
   SW1 SW2 All OFF!   Setting OK? (Push Y key)
   # 输入 Y 之后，会出现如下，再输入一次 Y
   SW3 ON!            Setting OK? (Push Y key)
   ```

   输入 2 次 Y 后，按要求输入 Top address 和 Save Address，然后 send 相应文件

   ``` shell
     Select (1-3)>3
    READ ID OK.
    READ ID = 0x007E0001
   Program Top Address & Qspi/HyperFlash Save Address
   ===== Please Input Program Top Address ============
     Please Input : H'44100000
   
   ===== Please Input Qspi/HyperFlash Save Address ===
     Please Input : H'200000
   Work RAM(H'50000000-H'53FFFFFF) Clear....
   please send ! ('.' & CR stop load
   # send 相应需要刷入的文件
   ```

   send 成功后

   ``` shell
   Work RAM(H'50000000-H'53FFFFFF) Clear....
   please send ! ('.' & CR stop load)
   SPI Data Clear(H'FF) Check :H'00180000-001BFFFF,Clear OK?(y/n)
   # 输入 y，随后：
   SPI Data Clear(H'FF) Check :H'00180000-001BFFFF Erasing..Erase Completed
   SAVE SPI-FLASH....... complete!
   
   ======= Qspi/HyperFlash Save Information  =================
    SpiFlashMemory Stat Address : H'00180000
    SpiFlashMemory End Address  : H'00184E67
   ===========================================================
   >
   ```



   按照要求输入选择，分别输入 Top Address 和 Save Address，选择相应文件 send，重复上面步骤依次刷入上表中所示文件。

5. Remove the power and red and yellow uart pin, Then Power the board. (关机开机？)

#### 2.2 刷入 QNX image

``` shell
$ cd GWM_V3/QNX/Hypervisor/qnx700/bsp/BSP_hypervisor-host_br-mainline_be-700_SVN854175_JBN863/images/generated/diskimage
# Copy 'fastboot' to the folder first
$ cp GWM_V3/AOSP/out/host/linux-x86/bin/fastboot  ./
$ chmod a+x ./fastboot
$ ./fastboot flash boot_a boot.img
$ ./fastboot flash extbin_a extbin.img
$ ./fastboot flash factory factory.img
$ ./fastboot flash persistence persistence.img
```

#### 2.3 刷入 Android

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

3. 单刷 Android

   ``` shell
   $./fastboot flash system_a system.img
   $./fastboot flash vendor_a vendor.img
   $./fastboot flash userdata userdata.img
   ```


#### 2.4 刷入 R7 image

``` shell
$ ./fastboot flash ipl_a v3_r7.bin
```

#### 2.5 运行 Android

``` shell
# sh /extbin/guests/android/android_guest_start.sh
```

