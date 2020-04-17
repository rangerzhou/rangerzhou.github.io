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

<!--more-->

安装 Linux Mint 双硬盘分区方案：

``` shell
SSD 500G分区
EFI 分区：1024M # 500M 足够
/boot 分区：2048M
/swap 分区：32768M # 等于内存大小
/ 分区：102400M
/home 分区： 剩余所有空间

HDD 1T分区：
/home/xxx/work # 挂载到 /home/xxx/ 目录下
```



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

``` shell
sudo dpkg -i openjdk-7-* libjpeg62-turbo* libfontconfig1* fontconfig-config*
```

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
sudo apt install terminator # 替换终端
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
sudo apt install shutter # 截图软件
sudo apt install build-essential
sudo apt-get install rar unrar # 解压 rar 工具
sudo apt-get install rar rar
sudo apt install vim
sudo apt install curl
sudo apt install wget
sudo apt install putty
sudo apt install sshpass # 免密码 ssh 连接
sudo apt install git
sudo apt install vim
sudo apt install flameshot # 截图,比 shutter 好用
sudo apt install img2simg #编译 QNX 时用到

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
mkdir ~/.themes # 
mkdir ~/.icons
```

- 切换主题，下载主题解压到 `~/.themes` ，就可以在 tweak 中选择主题了，如下是两个不错的 mac 主题：

  https://www.opendesktop.org/s/Gnome/p/1241688

  https://www.opendesktop.org/s/Gnome/p/1013714/

- 更换 icon，下载如下链接中的 icon 主题，解压到 .icons 目录，在 tweak 中切换即可

  https://www.opendesktop.org/s/Gnome/p/1102582/

- 更换 shell，下载如下链接中的 shell 主题，解压到 .themes 目录，在 tweak 中切换即可

  https://www.opendesktop.org/s/Gnome/p/1013741/

### 22. 安装 wine

``` shell
# https://linuxconfig.org/install-wine-on-ubuntu-18-04-bionic-beaver-linux
sudo dpkg --add-architecture i386 
wget -qO- https://dl.winehq.org/wine-builds/Release.key | sudo apt-key add -
sudo apt-add-repository 'deb http://dl.winehq.org/wine-builds/ubuntu/ bionic main'

# To install development WineHQ packages
sudo apt install wine-devel-amd64
sudo apt install wine-devel-i386
sudo apt install wine-devel
sudo apt install --install-recommends winehq-devel
wine --version
wine-3.19
```

### 23. sublime 输入中文

``` shell
sudo apt update && sudo apt upgrade
git clone https://github.com/lyfeyaj/sublime-text-imfix.git
cd sublime-text-imfix && ./sublime-imfix
```

https://github.com/lyfeyaj/sublime-text-imfix



### 24. 安装 anaconda

https://zhuanlan.zhihu.com/p/32925500

**创建环境**

``` shell
conda create -n <env_name> python=3.7
```



**切换环境**

``` shell
source activate python2
source activate python3
# 或者
conda activate python2
conda activate python3
```

**退出环境至root**

``` shell
source deactivate
# 或者
conda deactivate
```

**显示已创建环境**

``` shell
conda info --envs # 或者conda info -e，或者conda env list
```

**删除环境**

``` shell
#注意： <env_name> 为被删除环境的名称。环境名两边不加尖括号“<>”
conda remove --name <env_name> --all 
```

安装好Anaconda后每次打开终端都会自动帮你激活基本环境（`base`），有时候确实自己不需要激活Conda环境（因为打开终端不一定要用到 Python），而且该项操作还会拖慢打开的终端的响应速度，在终端输入：

``` shell
$ conda config --set auto_activate_base false
$ cat ~/.condarc
channels:
  - defaults
ssl_verify: true
auto_activate_base: false
```

第一次运行它时，它将在主目录中创建`~/.condarc`，并使用该设置覆盖默认值。

### 25. 切换 python 版本

``` shell
# update-alternatives --list python
update-alternatives: error: no alternatives for python
```

如果出现以上所示的错误信息，则表示 Python 的替代版本尚未被 update-alternatives 命令识别。想解决这个问题，我们需要更新一下替代列表，将安装的 python 放入其中：

``` shell
$ sudo update-alternatives --install /usr/bin/python python /usr/bin/python2.7 1
update-alternatives: using /usr/bin/python2.7 to provide /usr/bin/python (python) in auto mode
$ sudo update-alternatives --install /usr/bin/python python /usr/bin/python3.6 2
update-alternatives: using /usr/bin/python3.6 to provide /usr/bin/python (python) in auto mode
$ sudo update-alternatives --install /usr/bin/python python /home/ranger/anaconda3/bin/python3.7 3
update-alternatives: using /home/ranger/anaconda3/bin/python3.7 to provide /usr/bin/python (python) in auto mode
```

--install 选项使用了多个参数用于创建符号链接。最后一个参数指定了此选项的优先级，如果我们没有手动来设置替代选项，那么具有最高优先级的选项就会被选中。这个例子中，我们为 /usr/bin/python3.6 设置的优先级为2，所以update-alternatives 命令会自动将它设置为默认 Python 版本。现在开始，我们就可以使用下方的命令随时在列出的 Python 替代版本中任意切换了：

``` shell
sudo update-alternatives --config python
# 由于安装了 anaconda，所以一直没切换成功，从 PATH 环境中移除 annconda 中的 /bin 目录即可，或者修改 anaconda 下的 bin 目录名称，使 PATH 找不到 bin 目录。
```

### 26. 串口 log 工具

#### 26.1 minicom

minicom 是 linux 下常用的一款查看串口 log 的工具，安装：

``` shell
sudo apt install minicom
```

配置：

``` shell
sudo minicom -s
```

使用方向键选择需要配置的选项，如 Serial port setup，回车进入配置，此时光标在最下方，输入对应修改配置项对应的字母，编辑，回车确认，光标重新回到最下方，一般只需修改如下三项：

``` shell
A -    Serial Device
E -    Bps/Par/Bits
F -    Hardware Flow Control
```

A 配置项指定 USB 装置，使用命令 `ls -l /dev/ttyUSB*` 查看，修改成需要的 **ttyUSB*** 。

E配置项根据时间情况指定波特率，如115200。

F配置项为硬件流控，如果没有或者不确定则指定为 No。

修改完成后回车退到上一界面，选择 **Save setup as dfl** ，将刚才的修改存储为预设配置，避免下次使用重新配置，选择 **Exit** 退出配置界面，并开启 **minicom** 。

****

**快捷键**

**Ctrl+A**：执行特殊操作时都需要先按Ctrl+A，另一个功能是暂停屏幕输出，方便查看 log 。

**Ctrl+A, Z：** 查看帮助，也可直接使用命令 `minicom -h` 。

**Ctrl+A, X：** 退出。

**Ctrl+A, N：** 启用时间戳，在每行 log 前添加当前系统的时间戳。

**Ctrl+A, W：** 开启 minicom 的自动换行功能。



****

**配置权限**

minicom 本身无序 sudo 权限，但是因为要开启串口 */dev/xxx* ，所以需要 sudo 启动，修改如下信息即可免除输入 sudo。

- 直接使用 chmod 命令修改

  ``` shell
  sudo chmod 666 /dev/ttyUSB0
  ```

- 配置 udev 规则（推荐）

  ``` shell
  sudo vim /etc/udev/rules.d/70-ttyusb.rules
  # 添加一行
  KERNEL=="ttyUSB[0-9]*", MODE="0666"
  ```

  修改后重新插拔设备即可。

****

**自动设置 ttyUSB***

如果日常只需一个设备，设备名指定为 */dev/ttyUSB0* ，每次直接开启 minicom 即可，但当需要使用多个串口时，就需要每次查看 `ls /dev/ttyUSB*` ，手动修改配置才能使用，比较麻烦，使用如下 minicom 的 -D 参数可解决问题。

``` shell
# 编写脚本
vim ~/.minicom.sh
# 输入如下
com() {
    ports_USB=$(ls /dev/ttyUSB*)
    ports_ACM=$(ls /dev/ttyACM*)  #arduino
    ports="$ports_USB $ports_ACM"
    select port in $ports;do
        if [ "$port" ]; then
            echo "You select the choice '$port'"
            minicom -D "$port" $@"
            break
        else
            echo "Invaild selection"
        fi
    done
}
# 随后在 ~/.bashrc 中引入
echo 'source ~/.minicom.sh' >> ~/.bashrc
source ~/.bashrc
```

这样就可以直接通过 **com** 命令调用 minicom 了。

``` shell
ranger@zr:~ $ com
1) /dev/ttyUSB0
2) /dev/ttyUSB1
#?
```

****

**自动存储 log **

minicom 可使用 -C 参数指定存储 log 文件，修改 minicom.sh 脚本，把 log 存储在指定目录下。

``` shell
com() {
    ports_USB=$(ls /dev/ttyUSB*)
    ports_ACM=$(ls /dev/ttyACM*)  #arduino
    ports="$ports_USB $ports_ACM"
    datename=$(date +%Y%m%d-%H%M%S)
    select port in $ports;do
        if [ "$port" ]; then
            echo "You select the choice '$port'"
            minicom -D "$port" -C /home/ranger/work/tmps/"$datename".log "$@"
            break
        else
            echo "Invaild selection"
        fi
    done
}

# 修改后
com() {
    ports_USB=$(ls /dev/ttyUSB*)
    #ports_ACM=$(ls /dev/ttyACM*)  #arduino
    #ports="$ports_USB $ports_ACM"
    ports="$ports_USB"
    datename=$(date +%Y%m%d-%H%M%S)
    select port in $ports;do
        if [ "$port" ]; then
            echo "You select the choice '$port'"
            minicom -D "$port" -C /home/ranger/work/tmps/"$datename".log "$@"
            break
        else
            echo "Invaild selection"
        fi
    done
}
```

PS: 出现 **Device /dev/ttyS0 is locked minicom** 错误

通常是因为 minicom 上次使用时没有正常退出，系统自动在目录 */var/lock* 中生成了 lockfile 所致，删除即可：

```shell
sudo rm -rf /var/lock/***
```

*Reference*: https://tw.saowen.com/a/72a306fdd0cf62f69032d77659e5667332140154cbe22e1e6b1b537f55ed77b7

#### 26.2 picocom

picocom 可以看作是 minicom 的简化版，安装配置简单。

**安装**

``` shell
sudo apt install picocom
```

**使用**

``` shell
sudo picocom -b 115200 /dev/ttyUSB0
```

可写入 *~/.bashrc* 中快捷启动：

``` shell
alias seri='sudo picocom -b 115200 /dev/ttyUSB0'
```

**退出**

Ctrl+A, Ctrl+Q 即可退出（Ctrl+a 是转义键）。

优点：简单，文字可以有颜色，不会改变终端的背景。
缺点：启动和关闭的速度较慢。

### 27. Wired 网络消失

某天开机后突然发现 Settings-Network 中的 Wired 消失了，电脑无法上网，通过如下方法解决：

``` shell
cat /etc/NetworkManager/NetworkManager.conf
[main]
plugins=ifupdown,keyfile

[ifupdown]
managed=true

[device]
wifi.scan-rand-mac-address=no

```

把 managed 值改为 true ，同时恢复了 `/etc/network/interfaces` 为默认，重启电脑，解决。



### 28. 文件管理器

查看默认的文件管理器

``` shell
xdg-mime query default inode/directory
```

将默认的文件管理器设置为 nemo

``` shell
xdg-mime default nemo.desktop inode/directory application/x-gnome-saved-search
```

恢复 nautilus.desktop

``` shell
xdg-mime default nautilus.desktop inode/directory application/x-gnome-saved-search
```

使用 `xdg-open $HOME` 来验证有没有生效。

### 29. 终端中文只能显示 ASCII 码

使用 locale 命令查看

``` shell
$ locale
LANG=en_US.UTF-8
LANGUAGE=en_US:en
LC_CTYPE="C"
LC_NUMERIC="C"
LC_TIME="C"
LC_COLLATE="C"
LC_MONETARY="C"
LC_MESSAGES="C"
LC_PAPER="C"
LC_NAME="C"
LC_ADDRESS="C"
LC_TELEPHONE="C"
LC_MEASUREMENT="C"
LC_IDENTIFICATION="C"
LC_ALL=C
```

随后执行 `sudo locale-gen zh_CN.UTF-8`

再执行：

``` shell
export LANG=en_US.UTF-8
export LANGUAGE=
export LC_CTYPE="en_US.UTF-8"
export LC_NUMERIC=zh_CN.UTF-8
export LC_TIME=zh_CN.UTF-8
export LC_COLLATE="en_US.UTF-8"
export LC_MONETARY=zh_CN.UTF-8
export LC_MESSAGES="en_US.UTF-8"
export LC_PAPER=zh_CN.UTF-8
export LC_NAME=zh_CN.UTF-8
export LC_ADDRESS=zh_CN.UTF-8
export LC_TELEPHONE=zh_CN.UTF-8
export LC_MEASUREMENT=zh_CN.UTF-8
export LC_IDENTIFICATION=zh_CN.UTF-8
export LC_ALL=
```

vim 中文乱码的解决方案：

设置 vimrc 文件，加上fileencodings、enc、fencs，代码如下：

```bash
$ vim /etc/vim/vimrc # 或者 vim ~/.vimrc
# 一般只需要这行就行了
set enc=utf8
# 如果还不行，可以再添加
set fileencodings=utf-8,gb2312,gb18030,gbk,ucs-bom,cp936,latin1
# 还不行就把第一行的utf8换成gbk，第二行的gbk挪到最前
set fencs=utf8,gbk,gb2312,gb18030
```



### 30. 安装 nodejs 和 npm

#### 30.1 卸载 node 和 npm

``` shell
    # apt-get 卸载
    sudo apt remove --purge npm
    sudo apt remove --purge nodejs
    sudo apt remove --purge nodejs-legacy
    sudo apt autoremove

    # 手动删除 npm 相关目录
    rm -r /usr/local/bin/npm
    rm -r /usr/local/lib/node-moudels
    find / -name npm
    rm -r /tmp/npm*
```

#### 30.2 安装最新的 node 和 npm

``` shell
    # apt-get 安装 nodejs
    sudo apt install nodejs
    sudo apt install nodejs-legacy
    node -v # v4.2.6

    # 安装最新的 node v12.x  https://github.com/nodesource/distributions
    curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
    sudo apt-get install -y nodejs
    node -v

    # 更新 npm
    sudo npm install npm -g
```

### 31. vim 记忆位置不生效（只有加上 sudo 时才生效）

原因：

``` shell
[ubuntu: ~]$ ls -l ~/.viminfo
-rw------- 1 root root 4558 2015-05-09 13:58 ~/.viminfo
```

解决办法：
删除文件~/.viminfo
然后重新打开vim(注意要以当前用户打开),vim会自动重建该文件.

### 32. Ubuntu LibreOffice 相关配置

#### 32.1 关闭 LibreOffice Calc 输入字母自动大写

`Tools - AutoCorrect Options... - Options` 中取消勾选 `Capitalize first letter of every sentence` 即可。

#### 32.2 关闭 boolean 型值 true/false 自动变为 TRUE/FALSE

暂未知

### 33. Ubuntu 终端录制工具

#### 33.1 ttygif

安装和使用方式见 github： https://github.com/icholy/ttygif

**1. Create ttyrec recording**

```
$ ttyrec myrecording
```

- Hit CTRL-D or type `exit` when done recording.

**2. Convert to gif**

```
$ ttygif myrecording
```

#### 33.2 termtosvg

安装和使用方式见 github：https://github.com/nbedos/termtosvg

**ttygif** 使用更简单。



Reference: [使用 NEMO 文件管理器](http://einverne.github.io/post/2018/08/nemo-file-manager.html) 