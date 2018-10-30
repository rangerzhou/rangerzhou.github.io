---
title: Ubuntu18.04安装后必备操作
copyright: true
date: 2018-10-30 10:22:22
tags:
categories: Others
password:
---

## 一. Ubuntu 18.04 安装

### 1. Download Ubuntu-xxx.iso

https://www.ubuntu.com/download/desktop

### 制作优盘镜像时，选择 GPT 模式；

机器启动时，选择UEFI，Security off

## 二. Ubuntu 18.04 初始化

### 1. Update and Upgrade

```shell
sudo apt update
sudo apt upgrade
```

### 2. 安装 Typora

https://www.typora.io/#linux

### 3. 安装 Chrome

https://www.google.com/chrome/

### 4. 安装 Terminator

```shell
sudo apt install terminator
```

### 5. 安装搜狗输入法

```shell
# 卸载ibus
sudo apt remove ibus
# 清除ibus配置
sudo apt purge ibus
# 卸载顶部面板任务栏上的键盘指示
sudo  apt remove indicator-keyboard
# 安装fcitx输入法框架
sudo apt install fcitx-table-wbpy fcitx-config-gtk
# 切换为 Fcitx输入法
im-config -n fcitx
# im-config 配置需要重启系统才能生效
sudo shutdown -r now
# 下载安装包：https://pinyin.sogou.com/linux/?r=pinyin
# 安装搜狗输入法
sudo dpkg -i ~/Downloads/sogoupinyin_2.2.0.0108_amd64.deb
# 修复损坏缺少的包
sudo apt-get install -f
# 打开 Fcitx 输入法配置
fcitx-config-gtk3
# 点击 + 添加搜狗输入法，并把搜狗移动到顶端
# 输入法皮肤透明
fcitx设置 >>附加组件>>勾选高级 >>取消经典界面
Configure>>  Addon  >>Advanced>>Classic
```

### 6. sudo no password

```shell
sudo visudo
# 在末尾添加如下
# To allow a user to run all commands using sudo without a password
ranger ALL=(ALL) NOPASSWD: ALL
# All member of the sys group will run all commands using sudo without a passwo$
%sys ALL=(ALL) NOPASSWD: ALL

```

### 7. 安装 wps

下载地址：http://www.wps.cn/product/wpslinux/

```shell
sudo dpkg -i libpng12-0*.deb  #安装依赖
sudo dpkg -i wps*.deb  #安装wps
```

### 8. vim 配置

配置文件路径：`/etc/vim/vimrc` ，对所有用户生效，用户个人的配置在 `~/.vimrc` 。

参考：http://www.ruanyifeng.com/blog/2018/09/vimrc.html

### 9. 终端 tab 忽略大小写

```shell
vim ~/.inputrc
# 添加如下
# do not show hidden files in the list
set match-hidden-files off
 
# auto complete ignoring case
set show-all-if-ambiguous on
set completion-ignore-case on #忽略大小写

"\e[5~": history-search-backward
"\e[6~": history-search-forward
```

### 10. 安装 git

```shell
sudo apt install git
git config --global user.name "Your Name"
git config --global user.email "email@example.com"
# 通过命令 git config –list,查看是否设置成功
ranger@zr:~ $ git config --list
user.name=xxx.xxxx
user.email=xxx.xxxx@xxxxx.com
```



### 11. 安装卸载 JDK

#### 11.1 安装 openjdk

```shell
# ubuntu使用的是openjdk, 输入命令:
apt-cache search openjdk
# 找到我们需要安装的jdk版本
sudo apt install openjdk-11-jdk
java -version
```

#### 11.2 Ubuntu18.04 安装 jdk7

据说Ubuntu18.04已经去除了openJdk-7的源，所以本次进行了下载后手动安装：

[openjdk-7-jdk](https://packages.debian.org/experimental/openjdk-7-jdk)

[openjdk-7-jre](https://packages.debian.org/experimental/openjdk-7-jre)

[openjdk-7-jre-headless](https://packages.debian.org/experimental/openjdk-7-jre-headless)

[libjpeg62-turbo](https://packages.debian.org/sid/libjpeg62-turbo)

[libfontconfig1](https://packages.debian.org/sid/libfontconfig1)

[fontconfig-config](https://packages.debian.org/sid/fontconfig-config)

下载以上安装包，然后执行命令：

sudo dpkg -i openjdk-7-* libjpeg62-turbo* libfontconfig1* fontconfig-config*

如果在安装过程中报错，则执行以下命令：

```shell
sudo apt --fix-broken install
```

#### 11.4 切换 JDK

```shell
sudo apt update
sudo apt install openjdk-7-jdk
sudo update-alternatives --list java
sudo update-alternatives --config java #选择默认JDK
java -version
```

#### 11.5 完整卸载 JDK

```shell
# 移除所有 Java相关包 (Sun, Oracle, OpenJDK, IcedTea plugins, GIJ):
sudo apt update
sudo apt-cache search java | awk '{print($1)}' | grep -E -e '^(ia32-)?(sun|oracle)-java' -e '^openjdk-' -e '^icedtea' -e '^(default|gcj)-j(re|dk)' -e '^gcj-(.*)-j(re|dk)' -e 'java-common' | xargs sudo apt-get -y remove
sudo apt -y autoremove

# 清除配置信息
dpkg -l | grep ^rc | awk '{print($2)}' | xargs sudo apt-get -y purge

# 清除java配置及缓存
bash -c 'ls -d /home/*/.java' | xargs sudo rm -rf

# 手动清除JVMs
rm -rf /usr/lib/jvm/*
```



### 12. 终端配色

```shell
PS1='${debian_chroot:+($debian_chroot)}\[\033[01;35;01m\]\u\[\033[00;00;01m\]@\[\033[01;35;01m\]\h\[\033[00;31;01m\]:\[\033[00;00;01m\]\w \[\033[01;32;01m\]\$ \[\033[01;01;01m\]'
```

添加如上到 `~/.bashrc` 最后即可。

### 13. 编译&其他必备工具

```shell
sudo apt install m4
sudo apt install bison
sudo apt install g++-multilib gcc-multilib lib32ncurses5-dev lib32z1-dev
sudo apt install gitk
sudo apt install libxml2-utils
sudo apt install libssl-dev
sudo apt install device-tree-compiler
sudo apt install liblz4-tool
sudo apt install net-tools # 安装后才可使用 ifconfig, ping 等命令
sudo apt install python-lunch
sudo apt install python-pip
pip install pycrypto
pip install wand
sudo apt install shutter #截图软件
sudo apt install build-essential
sudo apt-get install rar unrar #解压 rar 工具
sudo apt-get install rar rar
sudo apt install vim
sudo apt install curl
sudo apt install wget
sudo apt install putty

```

### 14. ssh 连接远程服务器

#### 14.1. 直接使用 ssh 连接

```shell
ssh user@10.243.54.188 # 此命令需要输入密码
```

#### 14.2. 使用 ssh-key 登录服务器

```shell
ssh-keygen -t rsa -C "youremail@example.com"
ssh-copy-id -i ~/.ssh/id_rsa.pub  user@10.243.54.188
ssh user@10.243.54.188
```

#### 14.3. 使用 sshpass 在命令中附带密码连接

```shell
sudo apt install sshpass
sshpass -p password ssh user@10.243.54.188
```

### 15. 安装 sublime3

https://www.sublimetext.com/3

### 16. 截图

```shell
sudo apt install flameshot
```

Settings - Devices - keyboard，设置一个自定义快捷键CTRL+ALT+A（拉到最下面）命令填写：**flameshot gui**

截完图后保存Ctrl+S，复制到剪贴板 Ctrl+C

注：可能会和 terminator 快捷键冲突，禁用 terminator 中的 ctrl+alt+A 和 shift+ctrl+alt+A 即可。

### 17. 强制关闭UI

添加快捷键，Name: ForceQuit，Command: xkill，快捷键: shift+ctrl+X

### 18. 安装 AndroidStudio

```shell
# 快捷方式
vim /usr/share/applicatons/Studio.desktop
[Desktop Entry]
Version=3.2
Name=AndroidStudio
Exec=/opt/android-studio/bin/studio.sh
Termina=false
Icon=/opt/android-studio/bin/studio.png
Type=Application
Categories=Development
Name[en_US]=AndroidStudio.txt
```

### 19. 配置 samba 共享

```shell
#1. 安装
sudo apt install samba
sudo apt install smbclient

#2. 配置
sudo cp /etc/samba/smb.conf /etc/samba/smb.conf.bak
sudo vim /etc/samba/smb.conf
# 末尾添加如下：
[share]
    comment = Shared Folder with username and password
    path = /home/rangerzhou/share/
    available = yes
    browseable = yes
    public = yes
    writable = yes
    
#3. 创建共享目录
mkdir ~/share
chmod 777 ~/share

#4. 创建Samba用户,如果创建共享目录，前三步就可以了
sudo touch /etc/samba/smbpasswd
sudo smbpasswd -a rangerzhou #设置Windows访问时需要的密码
sudo samba restart
# https://www.cnblogs.com/phinecos/archive/2009/06/06/1497717.html
#https://blog.csdn.net/qiqzhang/article/details/78148682
```



```shell
# /dev/kvm permission denied. 使用自制镜像启动 Android 模拟器问题
sudo apt install qemu-kvm
sudo adduser <Replace with username> kvm
sudo chown <Replace with username> /dev/kvm
```

### 20. 安装 jd-gui/apktool

jd-gui: http://jd.benow.ca/

apktool: https://ibotpeaches.github.io/Apktool/install/

1. Download Linux [wrapper script](https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/linux/apktool) (Right click, Save Link As `apktool`)
2. Download apktool-2 ([find newest here](https://bitbucket.org/iBotPeaches/apktool/downloads/))
3. Rename downloaded jar to `apktool.jar`
4. Move both files (`apktool.jar` & `apktool`) to `/usr/local/bin` (root needed)
5. Make sure both files are executable (`chmod +x`)
6. Try running apktool via cli

```shell
sudo mkdir ~/bin
vim ~/.bashrc
export PATH=$PATH:/home/ranger/bin
source ~/.bashrc
# 把 apktol.jar 和 apktool 脚本 copy 到 ~/bin 下
sudo chmod 777 ~/bin/apktool
sudo chmod 777 ~/bin/apktool.jar
```

### 21. Ubuntu 18.04 美化

```shell
# 安装 gnome-tweak-tool
sudo apt install gnome-tweak-tool
# 安装后即可在 tweak 中配置相关选项，但是发现 Appearance-Shell 项无法选择
sudo apt-get install gnome-shell-extensions
sudo apt install chrome-gnome-shell
# 安装完成后打开Tweaks选择 “Extensions”选项，“User themes” 按钮设置成 on 即可
# 或者安装 chrome-gnome-shell，再安装如下链接插件后即可：
# https://extensions.gnome.org/extension/19/user-themes/

# 安装插件：pixel-saver（一款应用标题栏合并插件，可以把应用程序的窗口控制（最大/小化，关闭）和标题合并到顶栏中，以达到节约屏幕空间的目的），链接如下：
https://extensions.gnome.org/extension/723/pixel-saver/

```

安装主题

主题目录 `/usr/share/themes`，或者 

```shell
mkdir ~/.themes
mkdir ~/.icons
```

- 切换主题，下载主题解压到 `~/.themes` ，就可以在 tweak 中选择主题了，如下是两个不错的 mac 主题：

  https://www.opendesktop.org/s/Gnome/p/1241688

  https://www.opendesktop.org/s/Gnome/p/1013714/

- 更换 icon，下载如下链接中的 icon 主题，解压到 .icons 目录，在 tweak 中切换即可

  https://www.opendesktop.org/s/Gnome/p/1102582/

- 更换 shell，下载如下链接中的 shell 主题，解压到 .themes 目录，在 tweak 中切换即可

  https://www.opendesktop.org/s/Gnome/p/1013741/

