---
title: Ubuntu搭建OpenGrok在线代码浏览环境
copyright: true
date: 2018-08-29 19:23:23
tags:
categories: Others
password:
---

### 1. 安装 JDK

需要安装java 1.8.x及以上：

```shell
sudo apt install java
```



### 2. 安装 exuberant-ctags

```shell
sudo apt-getinstall exuberant-ctags
```



### 3. Tomcat 环境配置

从 https://tomcat.apache.org/ 下载tomcat 9.0（apache-tomcat-9.0.11.tar.gz），解压到 `/opt/` 目录下，赋予 `apache-tomcat-9.0.11/bin` 可执行权限，启动tomcat：

```shell
ranger@adp:/opt/tomcat-9.0.11 $ ./bin/startup.sh 
Using CATALINA_BASE:   /opt/tomcat-9.0.11
Using CATALINA_HOME:   /opt/tomcat-9.0.11
Using CATALINA_TMPDIR: /opt/tomcat-9.0.11/temp
Using JRE_HOME:        /usr
Using CLASSPATH:       /opt/tomcat-9.0.11/bin/bootstrap.jar:/opt/tomcat-9.0.11/bin/tomcat-juli.jar
Tomcat started.
```

在浏览器中输入 <http://localhost:8080/> 检查tomcat是否正常启动，如显示欢迎页面则配置成功。

### 4. 配置 OpenGrok

1. 从 [官方github](https://github.com/oracle/opengrok/releases) 下载最新版本，建议不要使用最新版本，反正我用最新版本 `opengrok-1.1-rc38` 没有成功，最终使用 [opengrok-0.12.1.5](https://github.com/oracle/opengrok/releases/tag/0.12.1.5) 成功;

2. 使用如下脚本命令创建索引

   ```shell
   
   ```

   

3. 复制 source.war 到 `/opt/apache-tomcat-9.0.11/webapps` ，source.war 会自动解压为 source 目录，可修改此目录名；

   ```shell
   cp /opt/opengrok-0.12.1.5/lib/source.war /opt/apache-tomcat-9.0.11/webapps
   ```

   浏览器输入 http://localhost:8080/source ，显示搜索界面则成功；

   

4. 修改 `/opt/apache-tomcat-9.0.11/webapps/mychain/WEB-INF/web.xml` ，将CONFIGURATION 设置为实际的 configuration.xml

   ```xml
       <display-name>OpenGrok</display-name>
       <description>A wicked fast source browser</description>
       <context-param>
         <param-name>CONFIGURATION</param-name>
         <param-value>/opt/opengrok-0.12.1.5/source/indexing/configuration.xml</param-value> 
         <description>Full path to the configuration file where OpenGrok can read it's configuration</description>
       </context-param>  
   ```

   

   

### 5. 启动 tomcat ，在线浏览代码

```shell
bash /opt/apache-tomcat-9.0.11/bin/startup.sh
```

浏览器输入 http://localhost:8080/source 浏览代码。



### 6. Tomcat 开机启动

https://blog.csdn.net/wangli61289/article/details/37924785



### 7. OpenGrok 多项目索引配置

https://blog.csdn.net/luzhenrong45/article/details/52734781



参考：https://blog.csdn.net/yzx_zjut/article/details/81951869