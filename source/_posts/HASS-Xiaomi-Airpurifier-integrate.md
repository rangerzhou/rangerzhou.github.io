---
title: HomeAssistant 集成小米空气净化器2
copyright: true
date: 2019-06-03 13:42:56
tags:
categories: HASS
password:
top:
---

> 在 Home Assistant 中集成小米空气净化器2（底部标签型号：AC-M2-AA），网上各种配置比较杂乱，且没有找到针对此净化器完美的配置，可能是因为 HA 更新了，旧的配置失效了，本文写作时 HA 的版本是 0.93.2

<!--more-->

HA Release: 0.94.4

净化器型号: AC-M2-AA

Model info: zhimi.airpurifier.m2

首先上图：

![米空气净化器2](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/Hass_Resources/ScreenShots_AirPurifier2.PNG)

参考了 2 篇小米空气净化器2配置的文章：

- [最新小米空气净化器2代接入HASS方法及HA控制面板](https://bbs.hassbian.com/thread-1657-1-1.html) 
- [小米空气净化器2代接入HA控制面板问题](https://bbs.hassbian.com/thread-6065-1-1.html)

此文配置针对这两篇文章的配置文件有所修改，以解决可能由于 HA 版本更新出现的问题，下面是详细配置步骤。

### 1. 获取 Token

有 3 种方法获取 token 。

第一种，HACHINA 定制的树莓派集成了 miio 工具，可直接使用命令获取 token：

``` shell
$ miio discover
INFO  Discovering devices. Press Ctrl+C to stop.

Device ID: 6264xxxx
Model info: zhimi.airpurifier.m2
Address: 192.168.xxx.xxx
Token: 9c9aa**************************** via auto-token
Support: At least basic
```

第二种，安装 [米家 APP (5.4.63版本)](https://github.com/rangerzhou/ImageHosting/tree/master/apps)，此版本可以直接显示 token ，不知道会不会哪天就被封了……

第三种，安装 python-miio 工具：

``` shell
sudo pip3 install python-miio
mirobo discover --handshake 1
```

### 2. 新建 packages 目录

``` shell
# 在 /home/pi/homeassistant/ 新建 packages 目录
$ mkdir packages
```

### 3. 在 configuration.yaml 中配置 packages

``` shell
$ vim configuration.yaml
homeassistant:
  name: Home
  latitude: 
  longitude:
  unit_system: metric
  time_zone: Asia/Shanghai
  customize: !include customize.yaml
  packages: !include_dir_named packages
```

### 4. 下载 packages 文件

下载 [ xiaomi_air_pufifier.yaml](https://github.com/rangerzhou/HomeAssistant/tree/master/xiaomiAirPurifier2/packages) 放入 `~/homeassistant/packages` 目录下，此文件修复了上面参考链接里的bug和 HA 升级导致的几个问题，主要为：

- 增加 sensors: xiaomi_ap_filter_used 和 xiaomi_ap_filter_life，以在主界面显示滤芯使用时长和滤芯寿命
- 修复提示音无效（HA 升级，service 名称改变导致）

**注意：需要替换文件中的 host 和 token ！！！**  

### 5. 配置 home-assistant-custom-ui

根据 [home-assistant-custom-ui 官方 github](https://github.com/andrey-git/home-assistant-custom-ui) 中的 README 配置，具体如下：

**a. Installing:** [详细参考此文](https://github.com/andrey-git/home-assistant-custom-ui/blob/master/docs/installing.md) 

**自动安装**，在 ~/home/homeassistant/ 下载 update.sh ：

``` shell
# 在 ~/home/homeassistant/ 下载 update.sh
$ curl -o update.sh "https://raw.githubusercontent.com/andrey-git/home-assistant-custom-ui/master/update.sh?raw=true"

```

**手动安装**：

在 `~/homeassistant/` 创建 `www/custom_ui` 目录，从 [Github](https://github.com/andrey-git/home-assistant-custom-ui) 下载 state-card-custom-ui.html, state-card-custom-ui.html.gz, state-card-custom-ui-es5.html, state-card-custom-ui-es5.html.gz 放入到 `~/.homeassistant/www/custom_ui/` 。

下载 [此链接文件](https://github.com/andrey-git/home-assistant-customizer/tree/master/customizer)  到 `~/home/homeassistant/custom_components/customizer` 。

**b. Activating:** [详细参考此文](https://github.com/andrey-git/home-assistant-custom-ui/blob/master/docs/activating.md) ，1.1 ～ 1.8 选择其中一种方法即可，我是选的 1.2，配置 configuration.yaml:

``` yaml
homeassistant:
  name:
  latitude:
  longitude:
  ... ...
  packages: !include_dir_named packages
  customize_glob:
    "*.*":
      custom_ui_state_card: state-card-custom-ui
... ...
frontend:
  extra_html_url:
    - /local/custom_ui/state-card-custom-ui.html
  extra_html_url_es5:
    - /local/custom_ui/state-card-custom-ui-es5.html
    

```

### 6. 添加 HA 已有的空气净化器组件 (可选，加不加不影响，这个是官方支持的)

configuration.yaml

``` yaml
fan:
  - platform: xiaomi_miio
    name: AirPurifierm2
    host: 192.168.31.174
    token: *****************
    model: zhimi.airpurifier.m2
```

HA 官方支持小米空气净化器的，只是面板选项较少，如上图中的风扇卡片。

### 7. 检测配置并运行

保存以上配置文件后检测配置，可能会出现如下提示：

``` shell
Invalid config for [automation]: required key not provided @ data['action']. Got Nonerequired key not provided @ data['trigger']. Got None. (See ?, line ?). Please check the docs at https://home-assistant.io/components/automation/
```

原因是你的 automations.yaml 中没有内容，有人测试必须包含 `trigger:` 和 `action:` 两项内容才不报错，或者在 `configuration.yaml` 中注释 `automation: !include automations.yaml` 也可以。

重新运行 HA 不出意外应该可以显示上图中的内容了。

