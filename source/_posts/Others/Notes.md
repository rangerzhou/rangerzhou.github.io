---
title: Notes
copyright: true
date: 2017-10-10 13:19:50
tags:
categories: Others
password:
---



> Ubuntu 常见问题解决

<!--more-->

#### 1. Ubuntu添加代理

1. 安装squid；

2. 在/etc/squid/squid.conf末尾添加

   ```shell
   acl all src 0.0.0.0/0.0.0.0
   http_access allow all
   #cache_peer 10.201.220.168 parent 8081 0 login=wjl0n2:zr123456 default
   cache_peer 10.201.249.71 parent 8081 0 login=asia/xxxxxx:zr123456 default
   never_direct allow all
   ```

3. 在/etc/apt/apt.conf末尾添加（一般会自动生成）：

   ```shell
   Acquire::http::Proxy "http://localhost:3128";
   Acquire::ftp::proxy "ftp://localhost:3128";
   Acquire::https::proxy "https://localhost:3128";
   ```

4. `sudo service squid restart`

5. 配置Network

   ``` shell
   HTTP Proxy | localhost | 3128
   HTTPS Proxy | localhost | 3128
   FTP Proxy | localhost | 3128
   Socks Host | localhost | 3128
   Ignore Hosts | localhost, 127.0.0.0/8, ::1
   ```




#### 2. Google服务器配置SS

1. 升级vps内核开启BBR

   sudo apt update
   sudo apt upgrade
   查看内核版本:uname –a,如果版本过低就升级：apt install linux-image-4.xx
   卸载旧版本:sudo apt autoremove
   启用新内核:update-grub
   重启:reboot
   验证内核版本:uname -r
   写入配置:

   ``` shell
   sudo -i
   echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
   echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
   ```

   配置生效:sysctl -p
   检验: lsmod | grep bbr
   看到回显tcp_bbr 20480 0说明已经成功开启 BBR

2. 配置Shadowsocks

   ```shell
   sudo apt-get update
   sudo apt-get install python-pip
   sudo pip install --upgrade pip
   sudo pip install shadowsocks
   sudo vim /etc/shadowsocks.json
   #如下为添加单用户
   {
   "server":"0.0.0.0",
   "server_port":12018,
   "local_address":"127.0.0.1",
   "local_port":1080,
   "password":"123456",
   "timeout":600,
   "method":"aes-256-cfb"
   }
   #如下为添加多用户
   {
       "server":"0.0.0.0",
       "local_address":"127.0.0.1",
       "local_port":1080,
       "port_password":{
            "12xxx":"123456",
            "12xxx":"123456",
            "12xxx":"123456"
   
       },
       "timeout":300,
       "method":"aes-256-cfb",
       "fast_open": false
   }
   sudo /usr/local/bin/ssserver -c /etc/shadowsocks.json -d start
   sudo vim /etc/rc.local
   在exit 0前添加:/usr/local/bin/ssserver -c /etc/shadowsocks.json -d start
   ```

3. 控制台配置

   VPC网络-防火墙规则-创建防火墙规则(来源IP地址范围：0.0.0.0/0，协议端口：tcp:12018)
   VPC网络-外部IP地址-设置静态IP

4. Python版一键安装脚本

   https://teddysun.com/342.htmlShadowsocks 
   
5. SSH 连接服务器

   **通过 SSH 密码验证登录**

   ``` shell
   # 添加密码
   $ sudo passwd ${whoami} // 下面以 user 代替 ${whoami}
   # 切换到 root
   $ sudo -i
   # 编辑 ssh 配置文件
   $ vi /etc/ssh/sshd_config
   # 修改以下内容
   $ PermitRootLogin yes
   $ PasswordAuthentication yes
   # 重启 ssh
   $ service sshd restart
   ```

   **通过本地私钥登录**

   ``` shell
   # 生成 ssh key
   $ ssh-keygen
   $ cat c:\Users\RangerZhou\.ssh\id_rsa.pub
   # 进入谷歌云平台页面 -> 计算引擎 -> 元数据 -> SSH 密钥，粘贴保存
   # 谷歌就会把上面这段 public key 写入到 ~/.ssh/authorized_keys
   
   # 本地通过私钥登录
   $ ssh -i id_rsa.pub user@35.189.175.199
   
   ```

#### 3. JDK

##### 3.1 安装JDK

1. ubuntu使用的是openjdk，所以我们需要先找到合适的jdk版本。在命令行中输入命令：$apt-cache search openjdk

2. 从搜索的列表里找到我们需要安装的jdk版本

   openjdk-11-jdk - OpenJDK Development Kit (JDK)

3. 输入安装命令，进行安装：$sudo apt-get install openjdk-11-jdk

   等待命令行显示“done”，即安装成功过。

4. 查看安装结果。输入命令：$java -version

5. 安装成功后，还需要配置java_home变量：

   1)输入命令：echo $java_home 

   返回空行；

   2）which javac 

   返回：/usr/bin/javac

   3）file /usr/bin/javac 

   返回：/usr/bin/javac: symbolic link to /etc/alternatives/javac

   4）file /etc/alternatives/javac 

   返回：/etc/alternatives/javac: symbolic link to /usr/lib/jvm/java-11-openjdk-amd64/bin/javac

   5）file /usr/lib/jvm/java-11-openjdk/bin/javac 

   返回：/usr/lib/jvm/java-11-openjdk/bin/javac: cannot open `/usr/lib/jvm/java-11-openjdk-amd64/bin/javac' (No such file or directory)

   6）sudo echo export JAVA_HOME=”/usr/lib/jvm/java-11-openjdk-amd64”>>~/.bashrc   （只添加到bin目录之前，不然编译代码可能会有问题）

   输入密码；

   7）source ~/.bashrc

   8）测试命令：gedit ~/.bashrc 

   查看打开的文件末尾是否成功加入java_home



   **Ubuntu18.04 安装 jdk7**

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

​      如果在安装过程中报错，则执行以下命令：

   sudo apt --fix-broken install

   下面看一下openJDK-7的安装路径，执行一下命令：

   dpkg -L openjdk-7-jdk

##### 3.2 切换JDK

```shell
sudo apt update
sudo apt install openjdk-7-jdk
sudo update-alternatives --list java
sudo update-alternatives --config java #选择默认JDK
java -version
```



#### 4. 完整卸载JDK

1. 移除所有 Java相关包 (Sun, Oracle, OpenJDK, IcedTea plugins, GIJ):

   (1) apt-get update

   (2) apt-cache search java | awk '{print($1)}' | grep -E -e '^(ia32-)?(sun|oracle)-java' -e '^openjdk-' -e '^icedtea' -e '^(default|gcj)-j(re|dk)' -e '^gcj-(.*)-j(re|dk)' -e 'java-common' | xargs sudo apt-get -y remove

   (3) apt-get -y autoremove

2. 清除配置信息:  dpkg -l | grep ^rc | awk '{print($2)}' | xargs sudo apt-get -y purge

3. 清除java配置及缓存:  bash -c 'ls -d /home/*/.java' | xargs sudo rm -rf

4. 手动清除JVMs:  rm -rf /usr/lib/jvm/*



#### 5. 切换Python版本

```shell
rangerzhou@zr:~ $ update-alternatives --list python
update-alternatives: error: no alternatives for python

rangerzhou@zr:~ $ sudo update-alternatives --install /usr/bin/python python /usr/bin/python2.7 1
rangerzhou@zr:~ $ sudo update-alternatives --install /usr/bin/python python /usr/bin/python3.6 2
rangerzhou@zr:~ $ update-alternatives --list python
/usr/bin/python2.7
/usr/bin/python3.6
rangerzhou@zr:~ $ sudo update-alternatives --config python 
There are 2 choices for the alternative python (providing /usr/bin/python).

  Selection    Path                Priority   Status
------------------------------------------------------------
  0            /usr/bin/python3.6   2         auto mode
  1            /usr/bin/python2.7   1         manual mode
* 2            /usr/bin/python3.6   2         manual mode

Press <enter> to keep the current choice[*], or type selection number: 2
```

**Python 升级**

https://www.python.org/

下载最新版本 Python ，或者 `wget https://www.python.org/ftp/python/3.8.0/Python-3.8.0.tgz` 

``` shell
# 配置配置文件
$ ./configure --with-ssl
# 安装依赖
$ sudo apt update
$ sudo apt upgrade
$ sudo apt dist-upgrade
$ sudo apt-get install build-essential python-dev python-setuptools python-pip python-smbus libncursesw5-dev libgdbm-dev libc6-dev zlib1g-dev libsqlite3-dev tk-dev libssl-dev openssl libffi-dev
# 编译
$ make
# 安装
$ sudo make install
# 删除软链接
$ sudo rm -rf /usr/bin/python3
$ sudo rm -rf /usr/bin/pip3
# 添加python3的符号链接
$ sudo ln -s /usr/local/bin/python3.8 /usr/bin/python3
# 添加pip3的符号链接
$ sudo ln -s /usr/local/bin/pip3.8 /usr/bin/pip3
# 查看版本
$ python3
$ pip3 -V
pip 19.1.1 from /usr/local/python3/lib/python3.7/site-packages/pip (python 3.7)
```

**卸载 python** 

https://www.howtoinstall.co/en/ubuntu/xenial/python3.5?action=remove

#### 6. JACK介绍

http://taobaofed.org/blog/2016/05/05/new-compiler-for-android/



#### 7. Ubuntu登录远程服务器

a. 通过ssh连接

```shell
sudo apt install openssh-server
/etc/init.d/ssh restart
ssh -l user 10.241.9.102
#接下来会提示输入密码，输入按回车即可
```

b. 通过sshpass，可在命令行中直接输入密码

```shell
sudo apt install sshpass
sshpass -p user000 ssh user@10.241.9.102
```



#### 8. samba配置共享目录

```shell
#1. 安装
sudo apt install samba
sudo apt install smbclient

#2. 配置
sudo cp /etc/samba/smb.conf /etc/samba/smb.conf.bak
sudo vim /etc/samba/smb.conf
末尾添加如下：
[share]
    comment = Shared Folder with username and password
    path = /home/rangerzhou/share/
    available = yes
    browseable = yes
    public = yes
    writable = yes
#    create mask = 777
#    directory mask = 777
#    force user = nobody
#    force group = nogroup
#    valid users = ran.zhou

#3. 创建共享目录
mkdir ~/share
chmod 777 ~/share

#4. 创建Samba用户
sudo touch /etc/samba/smbpasswd
sudo smbpasswd -a rangerzhou #设置Windows访问时需要的密码
sudo samba restart
# https://www.cnblogs.com/phinecos/archive/2009/06/06/1497717.html
#https://blog.csdn.net/qiqzhang/article/details/78148682
```

#### 9. apk签名

https://developer.android.com/studio/publish/app-signing?hl=zh-cn

Key store path: /home/rangerzhou/Android/keystores/android.jks
Key store password: 123456
Key alias: ZrAndroidKey
Key password: 654321



#### 10 AndroidStudio 导入调整 jar 包优先级

1. 把 jar 包放到 `app/libs/` 目录下，点击 jar 包右键 add as library ，在 `Project Structure-app-Dependencies` 修改导入 jar包的 Scope 为 **Compile only** 

2. 在 Project 下的 `build.gradle` 文件中添加

   ```java
       gradle.projectsEvaluated {
           tasks.withType(JavaCompile) {
               options.compilerArgs.add('-Xbootclasspath/p:app/libs/framework_APEV_DEMO_v20181009.jar')
           }
       }
   ```

   *注意：`gradle.projectsEvaluated` 是放在 `allprojects` 标签内*

3. 在 `app.iml` 中把导入的 jar 包放在 sdk 之前，这样Androidstudio 编译时优先使用导入的 jar 包

4. 每次重新打开Android stuio或者sync gradle，都会使得jdk的顺序发生变动，type=”jdk”所在的行会跑到前面去，为了方便起见，可使用下面的代码自动将type=’jdk’的行移动到最后，把这段代码加到 app 下的 build.gradle 中即可：

   ```java
   preBuild {
       doLast {
           def imlFile = file("app.iml")
           println 'Change app.iml order'
           try {
               def parsedXml = (new XmlParser()).parse(imlFile)
               def jdkNode = parsedXml.component[1].orderEntry.find { it.'@type' == 'jdk' }
               parsedXml.component[1].remove(jdkNode)
               def sdkString = "Android API " + android.compileSdkVersion.substring("android-".length()) + " Platform"
               new Node(parsedXml.component[1], 'orderEntry', ['type': 'jdk', 'jdkName': sdkString, 'jdkType': 'Android SDK'])
               def writer = new StringWriter()
               new XmlNodePrinter(new PrintWriter(writer)).print(parsedXml)
               imlFile.text = writer.toString()
               groovy.xml.XmlUtil.serialize(parsedXml, new FileOutputStream(imlFile))
           } catch (FileNotFoundException e) {
               // nop, iml not found
           }
       }
   }
   ```

参考：

https://www.jianshu.com/p/82cce7f91d5e

https://blog.csdn.net/li_huai_dong/article/details/81137355

#### 11 . Ubuntu 18.04美化

https://zhuanlan.zhihu.com/p/36200924

https://zhuanlan.zhihu.com/p/36265103



#### 12. Ubuntu 18.04 过滤CSDN广告

1.安装Adblock Plus，进入“选项”设置 

2.在过滤规则选择: Adblock Warning Removal List 模式 

3.”在自定义过滤（My filter list）“添加一行：blog.csdn.net###layerd 

4.刷新网页，Enjoy it….



#### 13. Repo 切换所有分支

**创建分支**

**方式一**

repo init -b branch-name

repo sync

repo start branch-name --all



**方式二**

repo forall -c git checkout -b branch-name



区别及原理后面补充。

**删除分支**

repo abandon branch-name

repo abandon branch-name



#### 14. 访问删除 /root 目录

``` shell
cd /
sudo passwd root
# 按照提示输入密码
su root
cd root
# 即可操作 /root 目录
```



#### 15. crontab 定时任务

**方法一**

执行 `crontab -e` 后，任务会被写入到 */var/spool/cron/crontabs/* 目录下，生成一个和用户名一致的文件，文件内容就是我们编辑的定时脚本。

直接用 crontab 命令编辑

cron服务提供 crontab 命令来设定 cron 服务的，以下是这个命令的一些参数与说明：

- crontab -u //设定某个用户的cron服务，一般 root 用户在执行这个命令的时候需要此参数
- crontab -l //列出某个用户cron服务的详细内容
- crontab -r //删除某个用户的cron服务
- crontab -e //编辑某个用户的cron服务

比如说 root 查看自己的 cron 设置：crontab -u root -l

再例如，root 想删除 fred 的 cron 设置：crontab -u fred -r 

基本格式 :
分　 时　 日　 月　 周　 命令
第1列表示分钟1～59 每分钟用*或者 */1表示
第2列表示小时1～23（0表示0点）
第3列表示日期1～31
第4列表示月份1～12
第5列标识号星期0～6（0表示星期天）

``` shell
crontab -e
# 末尾添加， 分，时，天，月，周
59 23 * * * /home/xxx/xxx.sh
# 重启 service
sudo service cron restart
# 也可以用 sudo /etc/init.d/cron restart

# 其他命令
sudo service cron status // 查看 crontab 服务状态
sudo service cron start // 启动服务
sudo service cron stop // 关闭服务
sudo service cron restart // 重启服务
sudo service cron reload // 重新载入配置
vim /var/mail/xxx // 失败会发送邮件？

sudo vim /var/spool/cron/crontabs/root // 
```

**方法2**

使用命令 vi /etc/crontab 编辑定时脚本。

它包括下面几行：

``` shell
SHELL=/bin/bash
PATH=/sbin:/bin:/usr/sbin:/usr/bin
MAILTO=root
HOME=/

\# run-parts
01 * * * * root run-parts /etc/cron.hourly
02 4 * * * root run-parts /etc/cron.daily
22 4 * * 0 root run-parts /etc/cron.weekly
42 4 1 * * root run-parts /etc/cron.monthly
```

前四行是用来配置 cron 任务运行环境的变量。
SHELL 变量的值告诉系统要使用哪个 shell 环境（在这个例子里是 bash shell）；
PATH 变量定义用来执行命令的路径。
cron 任务的输出被邮寄给 MAILTO 变量定义的用户名。
如果 MAILTO 变量被定义为空白字符串（MAILTO=""），电子邮件就不会被寄出。
HOME 变量可以用来设置在执行命令或脚本时使用的主目录。
如果不加run-parts参数，可是直接写任务文件，而不是文件夹。

（系统级的）做系统级配置我们会直接配置 /etc/crontab
（用户级的）一般还是建议大家使用 crontab -e ，这样系统也会帮着检查我们配置的脚本语法。



#### 16. systemd 配置 service 开机启动

以启动 HomeAssistant 为例：

``` shell
# 配置启动脚本
$ sudo vim /etc/systemd/system/home-assistant.service
[Unit]
Description=Home Assistant
After=network.target

[Service]
Type=simple
User=ranger   # hass 所属user
Group=ranger  # hass 所属group
ExecStart=/usr/bin/python3 /usr/local/bin/hass

[Install]
WantedBy=multi-user.target
# 其他配置
$ sudo systemctl enable home-assistant.service
$ sudo systemctl is-enabled home-assistant.service
enabled
$ sudo systemctl daemon-reload
$ sudo systemctl start home-assistant.service
$ sudo systemctl status home-assistant.service
* home-assistant.service - Home Assistant
   Loaded: loaded (/etc/systemd/system/home-assistant.service; enabled; vendor preset: enabled)
   Active: active (running) since Wed 2019-07-03 13:04:45 CST; 22min ago
 Main PID: 17003 (python3)
    Tasks: 34 (limit: 4915)
   CGroup: /system.slice/home-assistant.service
           |-17003 /usr/bin/python3 /usr/local/bin/hass
           `-17048 /usr/bin/pulseaudio --start --log-target=syslog

$ ll /etc/systemd/system/home-assistant.service
-rw-r--r-- 1 root root 188 Jul  3 13:04 /etc/systemd/system/home-assistant.service
$ ll /usr/local/bin/hass
-rwxr-xr-x 1 ranger ranger 224 Jul  1 13:05 /usr/local/bin/hass*
```

其他命令（参考：https://linux.cn/article-5926-1.html）

``` shell
$ sudo systemctl start apache.service						# 立即启动一个服务
$ sudo systemctl stop apache.service						# 立即停止一个服务
$ sudo systemctl restart apache.service						# 重启一个服务
$ sudo systemctl kill apache.service						# 杀死一个服务的所有子进程
$ sudo systemctl reload apache.service						# 重新加载一个服务的配置文件
$ sudo systemctl daemon-reload								# 重载所有修改过的配置文件
$ systemctl show httpd.service								# 显示某个 Unit 的所有底层参数
$ systemctl show -p CPUShares httpd.service					# 显示某个 Unit 的指定属性的值
$ sudo systemctl set-property httpd.service CPUShares=500	# 设置某个 Unit 的指定属性

$ sudo systemctl reboot 		# 重启系统
$ sudo systemctl poweroff 		# 关闭系统，切断电源
$ sudo systemctl halt 			# CPU停止工作
$ sudo systemctl suspend 		# 暂停系统
$ sudo systemctl hibernate 		# 让系统进入冬眠状态
$ sudo systemctl hybrid-sleep	# 让系统进入交互式休眠状态
$ sudo systemctl rescue 		# 启动进入救援状态（单用户状态）
$ systemctl list-units			# 列出正在运行的 Unit
$ systemctl list-units --all	# 列出所有Unit，包括没有找到配置文件的或者启动失败的
$ systemctl list-units --all --state=inactive	# 列出所有没有运行的 Unit
$ systemctl list-units --failed					# 列出所有加载失败的 Unit
$ systemctl list-units --type=service			# 列出所有正在运行的、类型为 service 的 Unit
# Unit 的状态
$ systemctl status 								# 显示系统状态
$ sysystemctl status bluetooth.service			# 显示单个 Unit 的状态
```

#### 17. 使用 AndroidStudio 调试源码

``` shell
# 生成 idegen.jar
source build/envsetup.sh
lunch xxx
make idegen -j8 # 或者 ./development/tools/idegen/idegen.sh

# 执行脚本
./development/tools/idegen/idegen.sh
```

执行脚本后在源码根目录生成 android.iml 和 android.ipr ，编辑 android.iml，添加 <excludeFolder> 过滤不需要调试的目录，随后用 AndroidStudio `Open an existing Android Studio project` 打开 android.ipr 文件，第一次打开，AndroidStudio下方的状态栏会提示Scanning files to index... ，耐心等待即可。

**配置 Project SDK**

```
主要是配置一个空的JDK，使代码在AOSP源码目录中跳转，不会跳到JDK中去

打开AndroidStudio菜单 File ---> Project Structure，

选择Platform Settings选项下的SDKs，紧接着点右侧上方的＋号，选择＋JDK，这里让选择JDK路径时直接默认的即可，点击OK；
然后将Name改为AOSP_nojar,然后将Classpath下的所有.jar文件全部选中删除，
再将Sourcepath,Annotations,Documentation Paths 下的文件全部删除，（当前AOSP源码是 android-9.0.0_r52, Project SDK 应为 Android API 28 Platform），
紧接着点击Android API 28 Platform,右侧选择 Java SDK 为刚创建的 AOSP_nojar，
然后选择Project Settings选项下的Project，将右侧的Project SDK 设置为与当前AOSP源码版本一致，如Android API 28 Platform

然后选择Project Settings选项下的Modules,点击右侧的Dependencies,保留最下面的 Module source 和Android API 27 Platform，其他的.jar文件全部删除

现在代码可以正确的跳转了
```



[Android 同一个TextView中多彩显示文字](https://yourzeromax.top/2018/08/13/Android-%E5%90%8C%E4%B8%80%E4%B8%AATextView%E4%B8%AD%E5%A4%9A%E5%BD%A9%E6%98%BE%E7%A4%BA%E6%96%87%E5%AD%97/) 



#### 18. 批量查找并替换字符串

``` shell
grep oldStr -rl ./source | xargs sed -i 's/oldStr/newStr/g'
```



#### 19. 项目迁移（包含提交记录）

**方法一：**

从原地址克隆一份裸版本库，比如原本托管于 GitHub，或者是本地的私有仓库：

``` bash
git clone --bare git://192.168.10.XX/git_repo/project_name.git
```

以镜像推送的方式上传代码到 新服务器上：

``` bash
cd project_name.git
git push --mirror git@192.168.20.XX/path/to/path/new_project_name.git
```

**方法二：**

假设你的remote是origin，用git remote set_url 更换地址：

``` bash
git remote set-url origin remote_git_address
```

然后用 git push 进行提交：

``` bash
git push
```

不过这种只会迁移当前分支到新的git上。



#### 20. VirtualBox 共享文件夹

1. 设置 - 共享文件夹 - + - 选择 PC 上的一个目录 Share - 点击 OK

2. 虚拟机中输入：

   ``` shell
   sudo mkdir pcshare
   sudo chmod 777 pcshare
   sudo mount -t vboxsf Share pcshare/
   ```




#### 21. Linux jar 包运行常用命令

##### 1. 运行方式1

``` shell
java -jar test.jar
```

当前 ssh 窗口被锁定，可按 CTRL+C 打断程序运行，或直接关闭窗口，程序退出。

如何让窗口不锁定呢？

##### 2. 运行方式2

``` shell
java -jar test.jar &
```

& 代表在后台运行。

当前 ssh 窗口不被锁定，但是当窗口关闭时，程序终止运行。

如何让窗口关闭时，程序仍然运行？

##### 3. 运行方式3

``` shell
nohup java -jar test.jar &
```

nohup 的意思是不挂断运行命令，当账户退出或终端关闭时，程序仍然运行。

当用 nohup 命令执行作业时，缺省情况下该作业的所有输出被重定向到 nohup.out 的文件中，除非另外指定输出文件。

##### 4. 运行方式4

``` shell
nohup jar -jar test.jar > temp.txt &
```

command > out.file: 将 command 的输出重定向到 out.file 文件，即输出内容不打印到屏幕上，而是输出到 out.file 文件中。

##### 5. 查看后台运行任务

``` shell
jobs
```

jobs 命令会列出所有后台执行的作业，并且每个作业前面会有个编号。

如果想将某个作业调到前台控制，使用 fg 命令：

``` shell
fg 23
```

##### 6. 查看某端口占用的线程的 pid

``` shell
netstat -nlp | grep :1234
```

如果忘记进程号，通过如下命令查看当前运行 jar 包程序进程号：

``` shell
ps -ef | grep test.jar
# 或者
ps -aux | grep java
```

##### 7. 关闭进程

``` shell
kill -s 9 12345
```



#### 22. Ubuntu 18.04 修改 mysql 数据库存放位置

停止 mysql

``` shell
sudo /etc/init.d/mysql stop
```

确认mysql 数据存放位置

``` shell
$ mysql -u root -p
# 输入密码后进入命令操作
mysql> show variables like '%dir%';
+-----------------------------------------+------------------------------+
| Variable_name                           | Value                        |
+-----------------------------------------+------------------------------+
| basedir                                 | /usr/                        |
| binlog_direct_non_transactional_updates | OFF                          |
| character_sets_dir                      | /usr/share/mysql/charsets/   |
| datadir                                 | /var/lib/mysql/              | # datadir 即为数据存储位置
| ignore_db_dirs                          |                              |
| innodb_data_home_dir                    |                              |
| innodb_log_group_home_dir               | ./                           |
| innodb_max_dirty_pages_pct              | 75.000000                    |
| innodb_max_dirty_pages_pct_lwm          | 0.000000                     |
| innodb_tmpdir                           |                              |
| innodb_undo_directory                   | ./                           |
| lc_messages_dir                         | /usr/share/mysql/            |
| plugin_dir                              | /usr/lib/mysql/plugin/       |
| slave_load_tmpdir                       | /tmp                         |
| tmpdir                                  | /tmp                         |
+-----------------------------------------+------------------------------+
15 rows in set (0.00 sec)

```

关闭 mysql 服务

``` shell
service mysql stop
# 或者
sudo /etc/init.d/mysql stop
```

创建新的数据库路径

``` shell
mkdir /home/ranger/database/mysql
```

复制 mysql 原有的数据

``` shell
mv /var/lib/mysql /home/ranger/database/mysql
```

修改配置文件

``` shell
# 修改mysqld.cnf 中的 datadir
sudo vim /etc/mysql/mysql.conf.d/mysqld.cnf
datadir = /home/ranger/database/mysql

# 修改启动文件
vim /etc/apparmor.d/usr.sbin.mysqld
# Allow data dir access
  /var/lib/mysql/ r,
  /var/lib/mysql/** rwk,
  # 添加如下两行
  /home/ranger/database/mysql/ r,
  /home/ranger/database/mysql/** rwk,

# 配置 AppArmor 访问控制规则
sudo vim /etc/apparmor.d/tunables/alias
alias /var/lib/mysql/ -> /home/ranger/database/mysql/,

# 修改 socket 地址
sudo vim /etc/apparmor.d/abstractions/mysql
/home/ranger/database/mysql{,d}/mysql{,d}.sock rw,

# 修改文件权限
sudo chown -R ranger:ranger /home/ranger/database/mysql
sudo chmod 755 /home/ranger/database/mysql
```

reload apparmor 配置并重启

``` shell
sudo service apparmor reload
sudo service apparmor restart
```

重启 mysql

``` shell
sudo service mysql restart
```

如果启动异常，

``` shell
$ sudo /etc/init.d/mysql restart
[....] Restarting mysql (via systemctl): mysql.serviceJob for mysql.service failed because the control process exited with error code.
See "systemctl status mysql.service" and "journalctl -xe" for details.
 failed!

```

输入 `journalctl -xe` 查看详细信息

``` shell
$ journalctl -xe
-- Unit mysql.service has finished shutting down.
Sep 17 14:01:08 Tricia systemd[1]: Starting MySQL Community Server...
-- Subject: Unit mysql.service has begun start-up
-- Defined-By: systemd
-- Support: http://www.ubuntu.com/support
--
-- Unit mysql.service has begun starting up.
Sep 17 14:01:08 Tricia mysql-systemd-start[32692]: my_print_defaults: [ERROR] Found option without preceding group in config file /etc/mysql/my.cnf at line 22!
Sep 17 14:01:08 Tricia mysql-systemd-start[32692]: my_print_defaults: [ERROR] Fatal error in defaults handling. Program aborted!
Sep 17 14:01:08 Tricia mysql-systemd-start[32692]: MySQL data dir not found at /var/lib/mysql. Please create one.
... ...
```

找到问题修改。



#### 23. Ubuntu 系统时间同步

直接输入如下命令即可同步最新时间

``` shell
sudo date -s "$(wget -qSO- --max-redirect=0 google.com 2>&1 | grep Date: | cut -d' ' -f5-8)Z"
```

定时执行：

``` shell
sudo vim /etc/crontab
# m h dom mon dow user command
30 8  * * * /home/ranger/bin/SyncTime.sh
```



#### 24. Ubuntu 安装 微信/QQ

[github]: https://github.com/zq1997/deepin-wine

##### 24.1 LinuxMint19.3（Ubuntu 18.04）版本安装

``` shell
wget -O- https://deepin-wine.i-m.dev/setup.sh | sh
sudo apt install deepin.com.wechat

```

安装后可能会出现界面中文字体显示方块的问题，解决方案如下：

``` shell
$ sudo apt-cache search wqy
fonts-wqy-microhei - Sans-serif style CJK font derived from Droid
fonts-wqy-zenhei - "WenQuanYi Zen Hei" A Hei-Ti Style (sans-serif) Chinese font
xfonts-wqy - WenQuanYi Bitmap Song CJK font for X
# 安装上面三个字体
$ sudo apt install fonts-wqy-microhei fonts-wqy-zenhei xfonts-wqy
```

其他异常：

``` shell
The following packages have unmet dependencies:
 com.qq.weixin.deepin:i386 : Depends: libc6:i386 (>= 2.28) but 2.27-3ubuntu1.4 is to be installed
E: Unable to correct problems, you have held broken packages.
```



同样可以替换安装包（deepin.com.wechat）为其他需要的软件，输入 sudo apt install install deepin. 按 tab 就显示了：

``` shell
$ sudo apt install deepin.com.qq.im
deepin.cn.360.yasuo                  deepin.com.baidu.pan                 deepin.com.qq.b.crm                  deepin.com.qq.office                 deepin.com.thunderspeed              deepin.org.7-zip                   
deepin.cn.com.winrar                 deepin.com.cmbchina                  deepin.com.qq.b.eim                  deepin.com.qq.rtx2015                deepin.com.wechat                    deepin.org.foobar2000              
deepin.com.95579.cjsc                deepin.com.foxmail                   deepin.com.qq.im                     deepin.com.taobao.aliclient.qianniu  deepin.com.weixin.work                                                  
deepin.com.aaa-logo                  deepin.com.gtja.fuyi                 deepin.com.qq.im.light               deepin.com.taobao.wangwang           deepin.net.263.em
```

##### 24.2 LinuxMint20（Ubuntu 20.04） 版本安装

``` shell
wget -O- https://deepin-wine.i-m.dev/setup.sh | sh
sudo apt install com.qq.weixin.deepin com.qq.im.deepin
```

官网最新版本依赖高版本 libc6 库，而 Ubuntu 18.04 最高只支持 libc6-2.27 版本，所以 Ubuntu 18.04 无法安装 deepin-wine github 中的新版本，**千万不要尝试升级 libc6**，不要问我是怎么知道的，除非你想重装系统……

#### 25. git status 中文显示为 ascii 码

- 原因
  在默认设置下，中文文件名在工作区状态输出，中文名不能正确显示，而是显示为八进制的字符编码。
- 解决办法
  将git 配置文件 `core.quotepath`项设置为false。
  quotepath表示引用路径
  加上`--global`表示全局配置

``` shell
git config --global core.quotepath false
```

#### 26. 更新 fork 而来的仓库代码

有两种方法

##### 26.1 git 命令操作

``` shell
# 查看远程分支列表
$ git remote -v
# 增加源分支地址到你项目远程分支列表中(此处是关键)，先得将原来的仓库指定为 upstream，命令为
$ git remote add upstream git@github.com:xxx/xxx.git
# fetch 源分支的新版本到本地
$ git fetch upstream
# 合并两个版本的代码
$ git merge upstream/master
# 将合并后的代码 push 到 github 上去
$ git push origin master
```

##### 26.2 github 方式

https://blog.csdn.net/qq1332479771/article/details/56087333

#### 27. Linux Mint20 添加打印机

Settings - Printers - Add - Find Network Print - 右侧输入打印机 IP - Find - 左侧 JetDirect(xxx.xxx.xxx.xxx) - 右侧 Forward