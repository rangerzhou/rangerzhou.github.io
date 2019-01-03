---
title: BigDataProject_Guide
copyright: true
date: 2018-12-14 13:31:48
tags:
categories: APTIV
password:
---

> BigData Project Guide

<!--more-->

### 1. Android

#### 1.1 Compile c-ares

[点击此处下载](https://c-ares.haxx.se/) ，[官方 Github](https://github.com/c-ares/c-ares) ，关于 **c-ares** 的介绍可查看 **README.MD** 文件，此处示例版本为 **c-ares-1.15.0** 。

``` shell
# 放入 /external/bigdata/ 目录下，添加 Android.mk 和 ares_config.h
```



Android.mk

``` makefile
LOCAL_PATH := $(call my-dir)

include $(LOCAL_PATH)/Makefile.inc

include $(CLEAR_VARS)
LOCAL_MODULE := libcares
LOCAL_CFLAGS += -DHAVE_CONFIG_H
LOCAL_EXPORT_C_INCLUDE_DIRS := $(LOCAL_PATH)
LOCAL_SRC_FILES := $(CSOURCES)
include $(BUILD_SHARED_LIBRARY)
```

编译 **c-ares** 模块生成 **libcares.so** ，此文件用于编译下文的 **data_service** 和 **mosquitto** ：

``` shell
$ mmm external/bigdata/c-ares
```



#### 1.2 Compile mosquitto

``` shell
$ ll mosquitto/
total 1904
drwxr-xr-x 14 ranger ranger    4096 Dec 13 14:02 ./
drwxr-xr-x  6 ranger ranger    4096 Dec 18 09:57 ../
-rw-r--r--  1 ranger ranger      83 Dec 13 14:02 Android.mk
-rw-r--r--  1 ranger ranger    2745 Dec 13 14:02 CMakeLists.txt
-rw-r--r--  1 ranger ranger    3941 Dec 13 14:02 CONTRIBUTING.md
-rw-r--r--  1 ranger ranger   64076 Dec 13 14:02 ChangeLog.txt
-rw-r--r--  1 ranger ranger     155 Dec 13 14:02 LICENSE.txt
-rw-r--r--  1 ranger ranger    2593 Dec 13 14:02 Makefile
-rw-r--r--  1 ranger ranger     637 Dec 13 14:02 README.txt
-rw-r--r--  1 ranger ranger    2026 Dec 13 14:02 about.html
-rw-r--r--  1 ranger ranger     230 Dec 13 14:02 aclfile.example
drwxr-xr-x  5 ranger ranger    4096 Dec 13 14:02 certs/
drwxr-xr-x  2 ranger ranger    4096 Dec 13 17:00 client/
-rw-r--r--  1 ranger ranger     873 Dec 13 14:02 compiling.txt
-rw-r--r--  1 ranger ranger     782 Dec 13 14:02 config.h
-rw-r--r--  1 ranger ranger    7889 Dec 13 14:02 config.mk
-rw-r--r--  1 ranger ranger   36920 Dec 13 14:02 dash2-mosquitto.conf
-rw-r--r--  1 ranger ranger    1569 Dec 13 14:02 edl-v10
-rw-r--r--  1 ranger ranger   11695 Dec 13 14:02 epl-v10
-rw-r--r--  1 ranger ranger   13127 Dec 13 14:02 host-build-output.txt
drwxr-xr-x  2 ranger ranger    4096 Dec 13 14:02 installer/
drwxr-xr-x  3 ranger ranger    4096 Dec 13 17:00 lib/
drwxr-xr-x  3 ranger ranger    4096 Dec 13 14:02 logo/
-rw-r--r--  1 ranger ranger   37117 Dec 13 14:02 m2.conf
drwxr-xr-x  2 ranger ranger    4096 Dec 13 14:02 man/
drwxr-xr-x  3 ranger ranger    4096 Dec 13 14:02 misc/
-rw-r--r--  1 ranger ranger   37068 Dec 13 14:02 mosq-test.conf
-rw-r--r--  1 ranger ranger   37049 Dec 13 14:02 mosquitto.conf
-rw-r--r--  1 ranger ranger   36999 Dec 13 14:02 mrb-mosquitto.conf
-rw-r--r--  1 ranger ranger   36920 Dec 13 14:02 nexus-mosquitto.conf
-rw-r--r--  1 ranger ranger    9230 Dec 13 14:02 notice.html
-rw-r--r--  1 ranger ranger      23 Dec 13 14:02 pskfile.example
-rw-r--r--  1 ranger ranger     355 Dec 13 14:02 pwfile.example
-rw-r--r--  1 ranger ranger     696 Dec 13 14:02 qnx-env-setup
-rw-r--r--  1 ranger ranger    2096 Dec 13 14:02 readme-windows.txt
-rw-r--r--  1 ranger ranger    3026 Dec 13 14:02 readme.md
drwxr-xr-x  2 ranger ranger    4096 Dec 13 14:02 security/
drwxr-xr-x  5 ranger ranger    4096 Dec 13 14:02 service/
drwxr-xr-x  3 ranger ranger    4096 Dec 13 17:01 src/
-rw-r--r--  1 ranger ranger     268 Dec 13 14:02 tcu-env-setup
drwxr-xr-x  5 ranger ranger    4096 Dec 13 14:02 test/
drwxr-xr-x  2 ranger ranger    4096 Dec 13 14:02 tls/
-rw-r--r--  1 ranger ranger 1460649 Dec 13 14:02 understand-mosquitto.udb
```







#### 1.3 Compile data_service

此模块编译需要 *external/bigdata/protobuf* 同时存在，data_service 依赖 libpbdata 。

``` shell
$ ll data_service/
total 208
drwxr-xr-x 3 ranger ranger  4096 Dec 13 18:08 ./
drwxr-xr-x 6 ranger ranger  4096 Dec 18 09:57 ../
-rw-r--r-- 1 ranger ranger   905 Dec 13 14:02 Android.mk
-rw-r--r-- 1 ranger ranger  9698 Dec 13 15:24 android_data_retriever.cpp
-rw-r--r-- 1 ranger ranger   852 Dec 13 14:02 android_data_retriever.h
-rw-r--r-- 1 ranger ranger  7831 Dec 13 14:02 data_binder.cpp
-rw-r--r-- 1 ranger ranger    93 Dec 13 14:02 data_binder.h
-rw-r--r-- 1 ranger ranger   528 Dec 13 14:02 data_pool.h
-rw-r--r-- 1 ranger ranger  1931 Dec 13 14:02 data_report.cpp
-rw-r--r-- 1 ranger ranger  1506 Dec 13 14:02 data_report.h
-rw-r--r-- 1 ranger ranger 11098 Dec 13 14:02 data_retriever.cpp
-rw-r--r-- 1 ranger ranger  2408 Dec 13 14:02 data_retriever.h
-rw-r--r-- 1 ranger ranger   478 Dec 13 14:02 data_service.cpp
drwxr-xr-x 2 ranger ranger  4096 Dec 13 14:02 data_svc/
-rw-r--r-- 1 ranger ranger    89 Dec 13 14:02 data_svc.rc
-rw-r--r-- 1 ranger ranger 11155 Dec 13 14:02 data_types.cpp
-rw-r--r-- 1 ranger ranger  6086 Dec 13 14:02 data_types.h
-rw-r--r-- 1 ranger ranger  7979 Dec 13 15:37 error_detector.cpp
-rw-r--r-- 1 ranger ranger   172 Dec 13 14:02 error_detector.h
-rw-r--r-- 1 ranger ranger  9436 Dec 13 14:02 event_data.cpp
-rw-r--r-- 1 ranger ranger   231 Dec 13 14:02 event_data.h
-rw-r--r-- 1 ranger ranger  5898 Dec 13 14:02 idc_client_base_api.h
-rw-r--r-- 1 ranger ranger  8892 Dec 13 18:08 linux_data_retriever.cpp
-rw-r--r-- 1 ranger ranger   901 Dec 13 14:02 linux_data_retriever.h
-rw-r--r-- 1 ranger ranger   937 Dec 13 14:02 mqtt_data_publisher.cpp
-rw-r--r-- 1 ranger ranger   602 Dec 13 14:02 mqtt_data_publisher.h
-rw-r--r-- 1 ranger ranger 13787 Dec 13 14:02 mqtt_data_report.cpp
-rw-r--r-- 1 ranger ranger  1453 Dec 13 14:02 mqtt_data_report.h
-rw-r--r-- 1 ranger ranger  7891 Dec 13 14:02 usb_writer.cpp
-rw-r--r-- 1 ranger ranger   198 Dec 13 14:02 usb_writer.h
-rw-r--r-- 1 ranger ranger    39 Dec 13 14:02 usb_writer_cfg.h
-rw-r--r-- 1 ranger ranger  7563 Dec 13 14:02 utils.cpp
-rw-r--r-- 1 ranger ranger  1659 Dec 13 14:02 utils.h

$ ll protobuf/
total 20
drwxr-xr-x 2 ranger ranger 4096 Dec 13 17:23 ./
drwxr-xr-x 6 ranger ranger 4096 Dec 18 09:57 ../
-rw-r--r-- 1 ranger ranger  573 Dec 13 14:02 Android.mk
-rw-r--r-- 1 ranger ranger    0 Dec 13 14:02 README.txt
-rw-r--r-- 1 ranger ranger 6350 Dec 13 14:02 big_data.proto
```

**Note:**

a. **linux_data_retriever.cpp** and **android_data_retriever.cpp**

Add “namespace android{}” before “using namespace android”

b. **error_detector.cpp**

Add “static_cast<int>()” at line 102



### 2. Ubuntu

此处示例版本为 **mosquitto-1.5.5** 。

**Download:**

https://github.com/eclipse/mosquitto    --- Build Dependencies

https://mosquitto.org/download/

#### 2.1 Install mosquitto

``` shell
$ make
$ sudo make install
```

**Note:**

$ make WITH_SRV=no WITH_UUID=no

$ sudo make install

### Build Dependencies

- c-ares (libc-ares-dev on Debian based systems) - disable with `make WITH_SRV=no`
- libuuid (uuid-dev) - disable with `make WITH_UUID=no`
- libwebsockets (libwebsockets-dev) - enable with `make WITH_WEBSOCKETS=yes`
- openssl (libssl-dev on Debian based systems) - disable with `make WITH_TLS=no`
- xsltproc (xsltproc and docbook-xsl on Debian based systems) - only needed when building from git sources - disable with `make WITH_DOCS=no`



安装完成后检查是否生成如下文件：

``` shell
$ ll /usr/local/bin/mosquitto*
-rwxr-xr-x 1 root root  53016 Dec 17 19:08 /usr/local/bin/mosquitto_passwd*
-rwxr-xr-x 1 root root 117312 Dec 17 19:08 /usr/local/bin/mosquitto_pub*
-rwxr-xr-x 1 root root 131000 Dec 17 19:08 /usr/local/bin/mosquitto_sub*

ll /usr/local/sbin/mosquitto*
-rwxr-xr-x 1 root root 1017600 Dec 17 19:08 /usr/local/sbin/mosquitto*

$ ll /usr/local/lib/*mosq*
lrwxrwxrwx 1 root root     17 Dec 17 19:08 /usr/local/lib/libmosquitto.so -> libmosquitto.so.1*
-rwxr-xr-x 1 root root 403376 Dec 17 19:08 /usr/local/lib/libmosquitto.so.1*
lrwxrwxrwx 1 root root     19 Dec 17 19:08 /usr/local/lib/libmosquittopp.so -> libmosquittopp.so.1*
-rwxr-xr-x 1 root root  64912 Dec 17 19:08 /usr/local/lib/libmosquittopp.so.1*

# 旧版本 /usr/local/lib/ 下有如下6个文件：
ll /usr/local/lib/*mos*
-rw-r--r-- 1 root root 1269118 Dec 13 17:02 /usr/local/lib/libmosquitto.a
lrwxrwxrwx 1 root root      17 Dec 13 17:02 /usr/local/lib/libmosquitto.so -> libmosquitto.so.1*
-rwxr-xr-x 1 root root   64392 Dec 13 17:02 /usr/local/lib/libmosquitto.so.1*
-rw-r--r-- 1 root root   80912 Dec 13 17:02 /usr/local/lib/libmosquittopp.a
lrwxrwxrwx 1 root root      19 Dec 13 17:02 /usr/local/lib/libmosquittopp.so -> libmosquittopp.so.1*
-rwxr-xr-x 1 root root   18864 Dec 13 17:02 /usr/local/lib/libmosquittopp.so.1*
```

事实证明 **libmosquitto.a** 和 **libmosquittopp.a** 在编译 **data_receiver** 时会用到，所以还是用旧版本 **mosquitto** 编译。



#### 2.2 Install protobuf

https://developers.google.com/protocol-buffers/docs/downloads

报错：

``` shell
autogen.sh:31:# The absence of a m4 directory in googletest causes autoreconf to fail when
autogen.sh:37:autoreconf -f -i -Wall,no-obsolete
```

原因是 linux 缺少 autoreconf 工具，安装后即可解决：

``` shell
sudo apt install autoconf automake libtool
```

``` shell
$ ./autogen.sh
$ ./configure –disable-shared
$ make
$ sudo make install
$ sudo ldconfig

$ protoc --version 
libprotoc 3.6.1
```



#### 2.3 Install LAMP(Linux, Apache, MySQL, PHP) Server

#### 2.3.1 Apache

``` shell
# 安装 apache
sudo apt install apache2
$ apache2 -v       
Server version: Apache/2.4.29 (Ubuntu)
Server built:   2018-10-10T18:59:25
# 打开 http://10.244.6.199/ 
```

打开 http://your_server_IP_address ，例如 http://10.244.6.199/ ，会显示 **Apache2 Ubuntu Default Page** 页面，如果您看到此页面，则您的Web服务器现在可以正确安装并通过防火墙访问。

查找服务器公网 IP ：

``` shell
$ ip addr show eno1 | grep inet | awk '{ print $2; }' | sed 's/\/.*$//'
10.244.6.199
fe80::882b:520d:3097:6d0c
# 或者 ifconfig
```

#### 2.3.2 MySQL

``` shell
# 安装 mysql
$ sudo apt install mysql-server
$ mysql --version
mysql  Ver 14.14 Distrib 5.7.24, for Linux (x86_64) using  EditLine wrapper
```



#### 2.3.3 PHP

``` shell
# 安装 php
$ sudo apt install php libapache2-mod-php php-mysql
$ php -v
PHP 7.2.10-0ubuntu0.18.04.1 (cli) (built: Sep 13 2018 13:45:02) ( NTS )
Copyright (c) 1997-2018 The PHP Group
Zend Engine v3.2.0, Copyright (c) 1998-2018 Zend Technologies
    with Zend OPcache v7.2.10-0ubuntu0.18.04.1, Copyright (c) 1999-2018, by Zend Technologies
```



``` shell
# 重新启动Apache Web服务器
$ sudo /etc/init.d/apache2 restart
# 或者
sudo systemctl restart apache2

# 查看 apache2 服务的状态
sudo systemctl status apache2

# 检查 PHP
$ php -r 'echo "\n\nYour PHP installation is working fine.\n\n\n";'


Your PHP installation is working fine.

```

**在 Web 服务器上测试 PHP 处理**

为了测试您的系统配置是否适合 PHP ，请创建一个名为`info.php`的非常基本的 PHP 脚本。 为了让 Apache 找到这个文件并正确提供它，它必须保存到一个非常特定的目录中，这个目录称为“ web 根目录”。

在 Ubuntu 18.04 中，这个目录位于`/var/www/html/` 。 通过运行以下位置在该位置创建文件：

``` shell
$ sudo vim /var/www/html/info.php
<?php
phpinfo();
?>
```

现在您可以测试您的Web服务器是否能够正确显示由此PHP脚本生成的内容。 要尝试此操作，请在您的Web浏览器中访问此页面，例如 `http://10.244.6.199/info.php` 。

``` shell
http://your_server_ip/info.php
```

#### 2.4 Login mysql and import the specific data schema

``` shell
$ sudo mysql -u root -p
Enter password: 
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 760
Server version: 5.7.24-0ubuntu0.18.04.1 (Ubuntu)

Copyright (c) 2000, 2018, Oracle and/or its affiliates. All rights reserved.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> create database iviData;
Query OK, 1 row affected (0.00 sec)

mysql> use iviData;
Database changed
mysql> source /home/ranger/work/Ubuntu_tools/10031472_data_receiver/database_schema/iviData.sql
Query OK, 0 rows affected (0.00 sec)

Query OK, 0 rows affected (0.00 sec)
... ...
```

#### 2.5 Install data_receiver

**报错一：**

``` shell
$ make clean
make: pkg-config: Command not found
rm -rf ./generated/cpp ./generated/java ./bin ./lib ./obj
rm -f .gen_cpp .gen_java
```

**pkg-config** 是一个在[源代码](https://zh.wikipedia.org/wiki/%E6%BA%90%E4%BB%A3%E7%A0%81)[编译](https://zh.wikipedia.org/wiki/%E7%BC%96%E8%AF%91)时查询已安装的[库](https://zh.wikipedia.org/wiki/%E5%BA%93)的使用接口的计算机工具[软件](https://zh.wikipedia.org/wiki/%E8%BD%AF%E4%BB%B6)。pkg-config原本是设计用于[Linux](https://zh.wikipedia.org/wiki/Linux)的，但现在在各个版本的[BSD](https://zh.wikipedia.org/wiki/BSD)、[windows](https://zh.wikipedia.org/wiki/Windows)、[Mac OS X](https://zh.wikipedia.org/wiki/Mac_OS_X)和[Solaris](https://zh.wikipedia.org/wiki/Solaris)上都有着可用的版本。

它输出已安装的库的相关信息，包括：

- [C](https://zh.wikipedia.org/wiki/C)/[C++](https://zh.wikipedia.org/wiki/C%2B%2B)[编译器](https://zh.wikipedia.org/wiki/%E7%BC%96%E8%AF%91%E5%99%A8)需要的输入参数
- [链接器](https://zh.wikipedia.org/wiki/%E9%93%BE%E6%8E%A5%E5%99%A8)需要的输入参数
- 已安装软件包的版本信息

安装 `pkg-config` 解决如上问题：

``` shell
sudo apt install pkg-config
```

**报错二：**

``` shell
$ sudo make clean
rm -rf ./generated/cpp ./generated/java ./bin ./lib ./obj
rm -f .gen_cpp .gen_java

$ sudo make all
... ...
/bin/sh: 1: mysql_config: not found
sub_bigdata_src/sub_bigdata.cpp:4:10: fatal error: mysql.h: No such file or directory
 #include <mysql.h>
          ^~~~~~~~~
compilation terminated.
sub_bigdata_src/mqtt_bigdata_client.cpp:10:10: fatal error: my_global.h: No such file or directory
 #include <my_global.h>
          ^~~~~~~~~~~~~
compilation terminated.
Makefile:52: recipe for target 'bin/sub_bigdata' failed
make: *** [bin/sub_bigdata] Error 1
```

报错，安装如下解决：

``` shell
sudo apt install libmysqlclient-dev
```

**报错三：**

``` shell
/usr/bin/ld: cannot find -lcares
collect2: error: ld returned 1 exit status
Makefile:53: recipe for target 'bin/sub_bigdata' failed
make: *** [bin/sub_bigdata] Error 1
```

`/usr/bin/ld: cannot find -lxxx` 意思是缺少 **libxxx.so** 文件，即缺少 **libcares.so** ，此 so 为 **c-ares** 编译生成，[c-ares Github 地址](https://github.com/c-ares/c-ares) ，下载后运行如下编译：

``` shell
$ sudo ./configure
$ sudo make
$ sudo make install
```

如此 **libcares.so**  就生成到 */usr/local/lib/* 目录下。

**编译 data_receiver**

``` shell
$ sudo make clean
$ sudo make all
```



### 3. Run the application







``` shell
$ ./SocketServer 
./SocketServer: error while loading shared libraries: libjson-c.so.2: cannot open shared object file: No such file or directory
```

解决（安装libjson-c2)：https://ubuntu.pkgs.org/16.04/ubuntu-main-amd64/libjson-c2_0.11-4ubuntu2_amd64.deb.html