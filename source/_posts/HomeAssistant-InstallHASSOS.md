---
title: HomeAssistant 安装 HASSOS
copyright: true
date: 2019-12-16 11:07:09
tags: HomeAssistant
categories:
password:
top:
---

> **Home Assistant 安装 HASSOS**，基于 [HassOS Release-3 build 6 (RC)](https://github.com/home-assistant/hassos/releases/tag/3.6) 。

<!--more-->

### 刷入 HASSOS 到 microSD 卡

下载最新 [HASSOS](https://github.com/home-assistant/hassos/releases) 镜像，使用 [balena Etcher](https://www.balena.io/etcher/) 工具烧录到 microSD 卡。

### 配置网络连接

准备一个 U 盘，标签格式化为 CONFIG （[有网友说](https://bbs.hassbian.com/forum.php?mod=viewthread&tid=6757&extra=&highlight=hassos&page=1)也有说无需 U 盘，烧录镜像的 microSD 卡插入 Windows 电脑，修改 hassos-boot 标签为 CONFIG 也可以，本人没有尝试），在根目录创建 network 目录，在其中新建文件 my-network：

wifi 连接：

``` conf
[connection]
id=my-network
uuid=72111c67-4a5d-4d5c-925e-f8ee26efb3c3
type=802-11-wireless

[802-11-wireless]
mode=infrastructure
ssid=MY_SSID
# Uncomment below if your SSID is not broadcasted
#hidden=true

[802-11-wireless-security]
auth-alg=open
key-mgmt=wpa-psk
psk=MY_WLAN_SECRET_KEY

[ipv4]
method=auto

[ipv6]
addr-gen-mode=stable-privacy
method=auto
```

网线连接：

``` conf
[connection]
id=my-network
uuid=d55162b4-6152-4310-9312-8f4c54d86afa
type=802-3-ethernet

[ipv4]
method=auto

[ipv6]
addr-gen-mode=stable-privacy
method=auto
```

wifi 连接需替换 ssid 和 psk，uuid 可以通过 https://www.uuidgenerator.net/ 生成。

配置静态 IP，可以替换以上文件中 ipv4 参数：

``` conf
[ipv4]
method=manual
address=192.168.53.188/24;192.168.53.1
dns=8.8.8.8;8.8.4.4;
```

如果已经连接启动树莓派，也可以 ssh 登陆后通过 nmcli 配置（[官方 network 配置文档](https://github.com/home-assistant/hassos/blob/dev/Documentation/network.md)）：

``` shell
hassio > login
# nmcli connection show
NAME                UUID                                  TYPE      DEVICE 
Wired connection 1  890cd810-f501-32a1-8fbe-9fac83693afa  ethernet  eth0   
my-network      e258af4f-f0bc-4492-955c-2c944355aaad  wifi      --     
# nmcli con edit "Wired connection 1" //此处选择输入需要配置的网络
nmcli> set ipv4.addresses 192.168.100.10/24
Do you also want to set 'ipv4.method' to 'manual'? [yes]:

```

### 配置时区

[查看官方配置文档](https://github.com/home-assistant/hassos/blob/dev/Documentation/configuration.md)

HASSOS 时间同步服务器是 google，由于国内网络的问题导致无法同步，进而导致 http://hassio.local:8123 打不开，更新日期和时间即可，在 U 盘根目录新建文件 timesyncd.conf ，

``` conf
[Time]
NTP=0.pool.ntp.org 1.pool.ntp.org 2.pool.ntp.org 3.pool.ntp.org
FallbackNTP=0.pool.ntp.org 1.pool.ntp.org 2.pool.ntp.org 3.pool.ntp.org
```

如果已经 ssh 进入树莓派，可以按照官方文档所写的编辑 `/etc/systemd/timesyncd.conf`。

### 配置 ssh 连接

有 2 种 ssh 连接方式，通过 SSH Server 插件和

#### SSH Server 插件

[官方文档](https://www.home-assistant.io/addons/ssh/)

这种方式官方指出`This add-on will not enable you to install packages or do anything as root. This is not allowed with Hass.io.`，即权限较低。

来到Home Assistant主页**http://hassio.local:8123**，在菜单栏点击**http://Hass.io**，选择**ADD-ON STORE**，搜索 **SSH Server**，点击 INSTALL 安装，安装完成后会变成 OPEN，点击进入 SSH Server 界面。

进入 SSH Server 界面，往下滚动进入配置 ssh 选项 Config，配置 authorized_keys ，输入需要 ssh 访问 HA 的电脑的 id_rsa.pub ，设置完成后在电脑终端输入 `ssh root@hassio.local`  ，登入成功：

``` shell
$ ssh root@hassio.local
Warning: the ECDSA host key for 'hassio.local' differs from the key for the IP address '192.168.53.188'
Offending key for IP in /home/ranger/.ssh/known_hosts:14
Matching host key in /home/ranger/.ssh/known_hosts:18
Are you sure you want to continue connecting (yes/no)? yes

  _    _                 _       
 | |  | |               (_)      
 | |__| | __ _ ___ ___   _  ___  
 |  __  |/ _` / __/ __| | |/ _ \ 
 | |  | | (_| \__ \__ \_| | (_) |
 |_|  |_|\__,_|___/___(_)_|\___/ 
                                 


Our Cli:
$ hassio help

core-ssh:~#
```

参考：https://zhuanlan.zhihu.com/p/30620342

#### Debugging Hass.io

[查看官方配置文档](https://developers.home-assistant.io/docs/en/hassio_debugging.html)

这种方式可以获取所有权限：

`SSH access through the [SSH add-on](https://www.home-assistant.io/addons/ssh/) (which will give you SSH access through port 22) will not provide you with all the necessary privileges, and you will be asked for a username and password when typing the 'login' command. You need to follow the steps below, which will setup a separate SSH access through port 22222 with all necessary privileges.`

在 U 盘根目录新建文件 authorized_keys，导入 PC id_rsa.pub 内容到 authorized_keys，随后 ssh 连接：

``` shell
$ ssh root@hassio.local -p 22222
Warning: the ECDSA host key for '[hassio.local]:22222' differs from the key for the IP address '[192.168.53.188]:22222'
Offending key for IP in /home/ranger/.ssh/known_hosts:16
Matching host key in /home/ranger/.ssh/known_hosts:17
Are you sure you want to continue connecting (yes/no)? yes
  _    _                 _       
 | |  | |               (_)      
 | |__| | __ _ ___ ___   _  ___  
 |  __  |/ _` / __/ __| | |/ _ \ 
 | |  | | (_| \__ \__ \_| | (_) |
 |_|  |_|\__,_|___/___(_)_|\___/ 

Welcome on Hass.io CLI.

For more details use 'help' and 'exit' to close.
If you need access to host system use 'login'.

hassio > login
#
```









### References

https://github.com/home-assistant/hassos/blob/dev/Documentation/network.md

https://github.com/home-assistant/hassos/blob/dev/Documentation/configuration.md

[HASSIO(HASSOS)新版本安装填坑方案](https://bbs.hassbian.com/thread-5191-1-1.html)



