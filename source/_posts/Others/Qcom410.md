---
title: 骁龙 410 随身 WIFI 折腾记
copyright: true
date: 2024-11-15 22:14:36
tags:
categories: Others
password: zr.
top:
---

> 高通骁龙 410 随身 WIFI 折腾记录

<!--more-->

切卡密码：admin8888



![miko_service_tool](../../images/2025/骁龙410_miko_service_tool.png)



修改 IMEI

``` SHELL
am broadcast -a elink.action.limitSpeed --es imei 863993199317839
```



删除 app

``` shell
adb shell rm -rf system/priv-app/MifiService.apk  system/app/SoundRecoder.apk
```

授权码

``` shell
rddctjpiokizbgig
```



[B 站视频](https://www.bilibili.com/video/BV1QV4y1y7yf/?spm_id_from=333.788.videopod.sections&vd_source=f889f5c1247c251796db94759036033b)

[刷 Debian 教程](https://blog.iamsjy.com/2023/12/11/snapdragon-410-portable-wifi-hotspot-flash-debian-and-optimize/)
