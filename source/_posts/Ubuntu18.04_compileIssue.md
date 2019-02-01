---
title: Ubuntu18.04编译问题
copyright: true
date: 2018-08-29 19:23:11
tags:
categories: Others
password:
---



> Ubuntu18.04编译问题

> 记录Ubuntu18.04编译问题。

<!--more-->

### 一. XEN项目

##### 1.make -j4 ALLOW_MISSING_DEPENDENCIES=true

##### 2.sudo apt install m4

##### 3.sudo apt install bison

##### 4.sudo apt-get install  g++-multilib gcc-multilib lib32ncurses5-dev lib32z1-dev

##### 5.

FAILED: out/target/product/gordon_peak_xen/obj/STATIC_LIBRARIES/libedify_intermediates/lexer.cpp 
/bin/bash -c "prebuilts/misc/linux-x86/flex/flex-2.5.39 -oout/target/product/gordon_peak_xen/obj/STATIC_LIBRARIES/libedify_intermediates/lexer.cpp bootable/recovery/edify/lexer.ll"
flex-2.5.39: loadlocale.c:130: _nl_intern_locale_data: Assertion `cnt < (sizeof (_nl_value_type_LC_TIME) / sizeof (_nl_value_type_LC_TIME[0]))' failed.
**解决**：

在这个链接中找到解法 https://stackoverflow.com/questions/49955137/error-when-build-lineageos-make-ninja-wrapper-error-1
把 export LC_ALL=C 这行代码添加到bashrc 文件中，LC_ALL=C 是为了去除所有本地化的设置，让命令能正确执行

##### 6.

FAILED: out/target/product/gordon_peak_xen/gen/STATIC_LIBRARIES/libmesa_glsl_intermediates/glsl/ir_expression_operation.h 
/bin/bash -c "python vendor/intel/external/mesa3d-intel/src/compiler/glsl/ir_expression_operation.py enum > out/target/product/gordon_peak_xen/gen/STATIC_LIBRARIES/libmesa_glsl_intermediates/glsl/ir_expression_operation.h"
Traceback (most recent call last):
  File "vendor/intel/external/mesa3d-intel/src/compiler/glsl/ir_expression_operation.py", line 23, in <module>
    import mako.template
ImportError: No module named mako.template
[  8% 6972/83760] target  C++: libasou...artx_plugin/IasAlsaSmartXConnector.cpp
ninja: build stopped: subcommand failed.
**解决**：sudo apt-get install python-mako

##### 7.

FAILED: out/target/product/gordon_peak_xen/vendor/etc/permissions/android.hardware.camera.xml 
/bin/bash -c "(xmllint frameworks/native/data/etc/android.hardware.camera.xml >/dev/null ) && (mkdir -p out/target/product/gordon_peak_xen/vendor/etc/permissions/ ) && (rm -f out/target/product/gordon_peak_xen/vendor/etc/permissions/android.hardware.camera.xml ) && (cp frameworks/native/data/etc/android.hardware.camera.xml out/target/product/gordon_peak_xen/vendor/etc/permissions/android.hardware.camera.xml )"
/bin/bash: xmllint: command not found
**解决**：sudo apt-get  install libxml2-utils

##### 8.

/home/rangerzhou/work/xen_o_ww09/xen_o_ww09/kernel/bxt/scripts/sign-file.c:25:10: fatal error: openssl/opensslv.h: No such file or directory
 #include <openssl/opensslv.h>
          ^~~~~~~~~~~~~~~~~~~~
compilation terminated.
scripts/Makefile.host:107: recipe for target 'scripts/sign-file' failed
make[2]: *** [scripts/sign-file] Error 1
make[2]: *** Waiting for unfinished jobs....
/home/rangerzhou/work/xen_o_ww09/xen_o_ww09/kernel/bxt/Makefile:555: recipe for target 'scripts' failed
make[1]: *** [scripts] Error 2
make[1]: Leaving directory '/home/rangerzhou/work/xen_o_ww09/xen_o_ww09/out/target/product/gordon_peak_xen/obj/kernel'
Makefile:150: recipe for target 'sub-make' failed
make: *** [sub-make] Error 2
make: Leaving directory '/home/rangerzhou/work/xen_o_ww09/xen_o_ww09/kernel/bxt'
[ 98% 72231/73211] target Strip (mini debug info): i965_dri (out/target/product/gordon_peak_xen/obj/SHARED_LIBRARIES/i965_dri_intermediates/i965_dri.so)
ninja: build stopped: subcommand failed.
**解决**：sudo apt-get install libssl-dev

##### 9.

make[1]: Leaving directory '/home/rangerzhou/work/xen_o_ww09/xen_o_ww09/out/target/product/gordon_peak_xen/obj/kernel'
Makefile:150: recipe for target 'sub-make' failed
make: *** [sub-make] Error 2
make: Leaving directory '/home/rangerzhou/work/xen_o_ww09/xen_o_ww09/kernel/bxt'
ninja: build stopped: subcommand failed.
**解决**：apt-get install device-tree-compiler

##### 10.

/bin/bash: lz4c: command not found
/home/rangerzhou/work/xen_o_ww09/xen_o_ww09/kernel/bxt/arch/x86/boot/compressed/Makefile:134: recipe for target 'arch/x86/boot/compressed/vmlinux.bin.lz4' failed
make[3]: *** [arch/x86/boot/compressed/vmlinux.bin.lz4] Error 1
/home/rangerzhou/work/xen_o_ww09/xen_o_ww09/kernel/bxt/arch/x86/boot/Makefile:111: recipe for target 'arch/x86/boot/compressed/vmlinux' failed
make[2]: *** [arch/x86/boot/compressed/vmlinux] Error 2
arch/x86/Makefile:255: recipe for target 'bzImage' failed
make[1]: *** [bzImage] Error 2
**解决**：apt-get install liblz4-tool





### 二. Google sourcecode android-8.1.0_r9

##### 1. error: ro.build.fingerprint cannot exceed 91 bytes

```shell
1. #build/tools/post_process_props.py
diff --git a/tools/post_process_props.py b/tools/post_process_props.py
index 9355e4b22..2f0d47503 100755
--- a/tools/post_process_props.py
+++ b/tools/post_process_props.py
@@ -22,7 +22,7 @@ import sys
 # See PROP_VALUE_MAX in system_properties.h.
 # The constant in system_properties.h includes the terminating NUL,
 # so we decrease the value by 1 here.
-PROP_VALUE_MAX = 91
+PROP_VALUE_MAX = 128
 
 # Put the modifications that you need to make into the /system/build.prop into this
 # function. The prop object has get(name) and put(name,value) methods.
 
 2. #bionic/libc/include/sys/system_properties.h
 diff --git a/libc/include/sys/system_properties.h b/libc/include/sys/system_properties.h
index d07585936..1b2104dc7 100644
--- a/libc/include/sys/system_properties.h
+++ b/libc/include/sys/system_properties.h
@@ -38,7 +38,7 @@ __BEGIN_DECLS
 
 typedef struct prop_info prop_info;
 
-#define PROP_VALUE_MAX  92
+#define PROP_VALUE_MAX  128
 
 /*
  * Sets system property `key` to `value`, creating the system property if it doesn't already exist.
```



##### 2. ckati failed with: signal: killed

内存问题

##### 3. frameworks/native/cmds/installd/installd.cpp:43:1: error: static_assert failed "Size mismatch."

frameworks/native/cmds/installd/installd_deps.h
// constexpr size_t kPropertyValueMax = 92u;
constexpr size_t kPropertyValueMax = 128u

##### 4. Jack out of memory error，try increasing heap size

export JACK_SERVER_VM_ARGUMENTS="-Dfile.encoding=UTF-8 -XX:+TieredCompilation -Xmx4096m"
out/host/linux-x86/bin/jack-admin kill-server
out/host/linux-x86/bin/jack-admin start-server



### 三. renesas编译问题

##### 1.文件缺失

error: external/e2fsprogs/lib/ss/Android.bp:3:1: module "libext2_ss" variant "linux_x86_64_static": source path external/e2fsprogs/lib/ss/ss_err.c does not exist
error: external/e2fsprogs/lib/ss/Android.bp:3:1: module "libext2_ss" variant "linux_x86_64_static": source path external/e2fsprogs/lib/ss/std_rqs.c does not exist

error: external/e2fsprogs/lib/ext2fs/Android.bp:3:1: module "libext2fs" variant "linux_x86_64_static": source path external/e2fsprogs/lib/ext2fs/ext2_err.c does not exist

error: external/e2fsprogs/debugfs/Android.bp:57:1: module "debugfs" variant "linux_x86_64": source path external/e2fsprogs/debugfs/debug_cmds.c does not exist
error: external/e2fsprogs/debugfs/Android.bp:57:1: module "debugfs" variant "linux_x86_64": source path external/e2fsprogs/debugfs/extent_cmds.c does not exist



解决：从AOSP源码copy

##### 2. ImportError: No module named Crypto.PublicKey

解决：

```shell
pip install pycrypto
```

##### 3. ImportError: No module named wand.image

```shell
pip install wand
```

##### 4. ../common/android/extra_config.mk:165: *** JAVA_HOME does not point to a valid java installation.  Stop.

make: Entering directory '/home/rangerzhou/work/renesas/device/renesas/proprietary/imgtec/rogue_km/build/linux/r8a7795_android'
WARNING: USE_CLANG=0 is deprecated for Android builds
******* Multiarch build: yes
******* Primary arch:    target_aarch64
******* Secondary arch:  none
../common/android/extra_config.mk:165: *** JAVA_HOME does not point to a valid java installation.  Stop.
make: Leaving directory '/home/rangerzhou/work/renesas/device/renesas/proprietary/imgtec/rogue_km/build/linux/r8a7795_android'
[ 40% 34093/83351] //frameworks/av/media/libstagefright/codecs/m4v_h263/dec:libstagefright_m4vh263dec clang++ src/chv_filter.cpp [arm]



解决：~/.bashrc中的JAVA_HOME指定路径要写到bin之前：

```shell
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64 #不要写成export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64/bin
```



##### 5. Syntax error: "(" unexpected

```shell
sudo dpkg-reconfigure dash
```

