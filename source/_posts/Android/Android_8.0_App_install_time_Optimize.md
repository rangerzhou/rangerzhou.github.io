---
title: Android8.0-App安装时间优化
copyright: true
date: 2018-02-12 10:57:56
tags: appInstall
categories: Android
password:
---

> APP的安装有四种方式

<!--more-->

- 系统应用安装——开机时完成，没有安装界面；
- 应用市场安装——通过应用市场完成，有安装界面，有些market开启无障碍开关和root后可静默安装；
- adb安装：使用adb install安装，和pm install一样，没有安装界面；
- 第三方点击安装：点击存储在手机设备或者SD卡中的APK文件安装，通过PackageInstall处理，有安装界面；


``` java
import android.util.BoostFramework;
... ...
        private static BoostFramework sPerfBoost = null;
... ...
            if (sPerfBoost == null) {
                sPerfBoost = new BoostFramework();
            }
            if (sPerfBoost != null) {
                sPerfBoost.perfHint(BoostFramework.VENDOR_HINT_PACKAGE_INSTALL_BOOST, null, 6000, -1);
                Slog.d(TAG, "perflock acquired for PackageInstallService");
            }
```

