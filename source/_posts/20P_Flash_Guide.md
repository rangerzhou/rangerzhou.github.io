---
title: 20P_Flash_Guide
copyright: true
date: 2018-12-11 10:31:07
tags:
categories: APTIV
password: zr

---



> 20P 项目刷机指南。

<!--more-->

### 1. 刷入 SGM_ICI2_FBLFlash

解压 **SGM_ICI2_FBLFlash_p358.zip** 到当前目录，复制解压后的 **GM_refreshpkg_p358** 文件夹复制到 U 盘，U 盘插入设备（大容量 U 盘有可能不识别，此处所用为 sanDisk 32G U盘），连接方式如下：

![sanDisk](/home/ranger/work/tmps/sanDisk.jpg)

上电开机后会自动开始刷入：

``` shell
----------------------------------------------------------------------------------------------------
[65016632] 2:3; flash_mgr_ctrl.cpp:2177; INFO_HI - Set Mark for: /dev/mtd6
[65017431] 2:3; FBL_EnvOpt.cpp:83; INFO_HI - SetEnv:FBL_rootfs_addr 0x15c0000
[65017432] 2:3; FBL_EnvOpt.cpp:115; INFO_HI - SetEnv:FBL_rootfs_addr Ok.
[65018234] 2:3; flash_mgr_Reflash.cpp:375; INFO_HI - ---------begin reflash file /reflash/mnt/usbdrive/GM_refreshpkg_p358/kernel-fbl_1920_720.img [3791328]

... ...

----------------------------------------------------------
... ...
[65036642] 2:3; flash_mgr_Reflash.cpp:375; INFO_HI - ---------begin reflash file /reflash/mnt/usbdrive/GM_refreshpkg_p358/rootfs_fbl.img [8525267]

... ...
[65052194] 2:3; flash_mgr_Reflash.cpp:230; INFO_LO - Correct MTD erase
[65052194] 2:3; FlashUsbMonitor.cpp:11; NOTIFY - ----CheckConnection----
=====
----------------------------------------------------------------------------------------------------

```

屏幕显示：

![001](/home/ranger/work/tmps/001.jpg)

![002](/home/ranger/work/tmps/002.jpg)

![003](/home/ranger/work/tmps/003.jpg)

![004](/home/ranger/work/tmps/004.jpg)

![005](/home/ranger/work/tmps/005.jpg)

出现 **Programming Successfully** 后拔掉 U 盘，会启动设备，随后开始刷入 **system.img** 和 **userdata.img** 。

### 2. 刷入 system.img && userdata.img

- 连接串口线，一端插在电脑上，一端插在主机板上：

  ![007](/home/ranger/work/tmps/007.jpg)

  ![](/home/ranger/work/tmps/008.jpg)

- 使用 USB转Micro USB线连接电脑；

- 打开串口窗口，按住键盘 C 键的同时上电开机，进入 fastboot 模式，串口窗口显示如下：

  ``` shell
  ... ...
  Net:   Net Initialization Skipped
  No ethernet found.
  Hit any key to stop autoboot:  0 
  => ccc 
  # 输入 fastboot 0 进入 fastboot 模式
  => fastboot 0
  
  ```

- 打开新的终端窗口，进入 **fastboot** 目录，输入如下命令刷入 system.img 和 userdata.img ：

  ``` shell
  $ sudo ./fastboot flash system /YOUR_PATH/system.img
  Sending 'system' (1178549 KB)                      OKAY [ 67.025s]
  Writing 'system'                                   OKAY [ 36.242s]
  Finished. Total time: 103.279s
  
  $ sudo ./fastboot flash userdata /YOUR_PATH/userdata.img
  Sending 'userdata' (91021 KB)                      OKAY [  5.228s]
  Writing 'userdata'                                 OKAY [  1.213s]
  Finished. Total time: 6.453s
  
  ```

  刷完后重启：

  ``` shell
  $ sudo ./fastboot reboot
  Rebooting                                          
  Finished. Total time: 0.305s
  ```

  **注：**

  fastboot 完第一次启动时进入到 **别克logo** 后断电重启即可进入系统。



### 3. 替换 DomULinux.img

插入 U 盘，连接串口线，上电开机：

```shell
# 开机后串口 log 会打印，出现 dra7xx-evm login: 后输入 root
dra7xx-evm login: root
root@dra7xx-evm:~# cd /
root@dra7xx-evm:/# mount -o rw,remount /
[  336.421823] EXT4-fs (sda5): re-mounted. Opts: data=ordered
# copy U 盘中的DomULinux.img 替换 /xen/images/ 下的 DomULinux.img
root@dra7xx-evm:/# cp /tmp/devmgr_msc/dummylabel_sdb_0/DomULinux.img /xen/images/DomULinux.img
root@dra7xx-evm:/# chmod 755 /xen/images/DomULinux.img

```

断电重启，随后进入系统：

``` shell
dra7xx-evm login:root
root@dra7xx-evm:~# xl console 1
shell@jacinto6evm:/ $ 
# 确保 zenda 进程已启动
shell@jacinto6evm:/ $ ps | grep zenda                                          
root      1347  1     4036   2468           0 00000000 S /system/bin/zenda
```

