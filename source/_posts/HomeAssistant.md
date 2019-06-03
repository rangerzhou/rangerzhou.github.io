---
title: HomeAssistant
copyright: true
date: 2019-05-20 15:51:57
tags:
categories:
password: zr.
top:
---

> **Home Assistant 是一款基于 Python 的智能家居开源系统，支持众多品牌的智能家居设备，可以轻松实现设备的语音控制、自动化等。基于Home Assistant，可以方便地连接各种外部设备（智能设备、摄像头、邮件、短消息、云服务等，成熟的可连接组件有近千种），手动或按照自己的需求自动化地联动这些外部设备，构建随心所欲的智慧空间。。**

<!--more-->

### 安装与启动

安装：https://www.hachina.io/docs/330.html

升级

``` shell
sudo pip3 install --upgrade homeassistant
sudo pip3 install homeassistant==X.XX.X  # 指定哪个版本的安装
```



### 基础配置

在不同操作系统中，配置文件所在缺省目录是不同的：

- macOS：~/.homeassistant/
- Linux：~/.homeassistant/
- Windows：C:\Users\用户名\AppData\Roaming\\.homeassistant\

如果你希望使用其它目录作为配置文件所在地，可以使用以下命令启动 home assistant：

``` shell
hass --config path/to/config
```



在配置目录下，有一个文件 configuration.yaml，这就是 Home Assistant 的主配置文件，包含了要加载的组件（component）以及这些组件的配置信息。当配置文件更改后，需要重新启动 Home Assistant 使其生效。

在修改了配置文件后，可以通过以下命令，在不启动 Home Assistant 的情况下，测试配置文件的有效性：

``` shell
hass --script check_config
```

#### 添加红点

- 建立目录`~/.homeassistant/custom_components/redpoint`
- 将`__init__.py`与`manifest.json`放置在`redpoint`目录下
- 配置文件 configuration.yaml ：

```
redpoint:
```

- HomeAssistant 0.74.2之前版本，需要在配置文件的`http`配置中，增加跨域访问配置（`cors_allowed_origins`），如下：

```
http:
  # 其它的一些配置保留，增加以下两行配置内容
  cors_allowed_origins:
    - 'http://redpoint.hachina.io'
```

- HomeAssistant 0.74.2及以后版本，不需要增加以上配置。

**脚本下载：https://github.com/rangerzhou/HomeAssistant**

#### 添加和风天气

下载 [脚本文件](https://github.com/rangerzhou/HomeAssistant/tree/master/custom_components/HeWeather) 放入**custom_components** 目录，

在红点中添加和风天气，配置密钥 Appkey，选择天气预报内容选项，不要勾选 **运动指数** ，会报错，原因未查，重启配置。

HA 首页概览中配置 UI，添加 ENTITLES，选择天气添加卡片。

#### 树莓派 3B+ 配置 wifi

1. 树莓派系统默认没有开启 SSH 连接，将 SD 卡连接到电脑上并打开，在根目录直接新建 “SSH” 文件（无后缀名）即可。

2. 用网线连接笔记本和树莓派，输入：`ssh pi@raspberrypi.local` ，这个命令自动查找树莓派的ip地址，并连接树莓派，初始默认密码raspberry。
3. 使用命令：`sudo raspi-config` 进行树莓派配置，选择 **2 Network Options - WIFI - China - 输入 SSID 和密码**
4. 另一种方法：`sudo vi /etc/wpa_supplicant/wpa_supplicant.conf` （priority 设置优先级）

#### 树莓派配置静态 IP 地址

``` shell
sudo vim /etc/dhcpcd.conf
# 在文件末尾添加以下内容即可（IP 地址后面的24不可忽略）
interface wlan0
static ip_address=192.168.1.3/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1
```

#### 查询小米设备 ip 和 token

``` shell
sudo pip3 install python-miio
mirobo discover --handshake 1

# hachina 自带安装工具
# 小米设备 token 探查工具 miio
miio --help
miio discover
```



### Google Calendar 接入

``` yaml
google:
  client_id: 568199804597-aetsiu6c606iqa5ugt2i0uktu5dvaq4u.apps.googleusercontent.com
  client_secret: PkinMxCStvcyRuyTmOdLdALh
```





Key

openweathermap: b7c3b4e47df3aef31dad19601e0649fe / b8993bdaf9f50e889436e1d272579707

heweather: 1697fec8cff949c49b38e909147b5f56

京东万象: 905195741bfe46e9de5743627c7f781d

darksky: 247d5cbd3ad7c67d8872b0d1b93f900c

高德：2eec41586a85b251d7e872c536ef41e2    （https://lbs.amap.com/dev/index）

Todoist在线日历：191f278fbdd5ba5c663d8fe82ae3588ec5d976d9

Juhe_stock: be0ed0f8d39f2138131c4447d405fdd5

Juhe_juke: 8ad9dbb7d43528138e6ad32bb3a1714f



安卓安装HA：https://gist.github.com/Caldis/7646df406de43e6c6581ff491dfd8afe

在最后 `pip install homeassistant`  的时候遇到错误，运行了 `pkg install clang` 和 `pkg install python-dev` 和 'pkg install openssl-dev' 之后竟然成功了！！！（参考：http://chenyue404.blogspot.com/2017/12/androidhome-assistant.html）

### 高德路径规划

[Component 下载](https://github.com/zhujisheng/HAComponent/tree/master/gaode_travel_time) 

Put the file `sensor.py` `__init__.py` `manifest.json` in the dir: `~/.homeassistant/custom_components/gaode_travel_time/`



### References: 

Home Assistant：https://www.home-assistant.io/

积木构建智慧空间：https://www.hachina.io

Home Assistant 中文文档：https://home-assistant.cc/

瀚思彼岸：https://bbs.hassbian.com