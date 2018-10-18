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
   cache_peer 10.201.249.71 parent 8081 0 login=wjl0n2:zr123456 default
   never_direct allow all
   ```

3. 在/etc/apt/apt.conf末尾添加（一般会自动生成）：

   ```shell
   Acquire::http::Proxy "http://localhost:3128";
   Acquire::ftp::proxy "ftp://localhost:3128";
   Acquire::https::proxy "https://localhost:3128";
   ```

4. `sudo service squid restart`



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
   sudo -i
   echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
   echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
   配置生效:sysctl -p
   检验:lsmod | grep bbr
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

   sudo dpkg -i openjdk-7-* libjpeg62-turbo* libfontconfig1* fontconfig-config*

   如果在安装过程中报错，则执行以下命令：

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