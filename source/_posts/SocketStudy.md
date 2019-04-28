---
title: SocketStudy
copyright: true
date: 2019-04-18 15:46:36
tags:
categories:
password:
top:
---



### 1. sss



Mina 官网：http://mina.apache.org/mina-project/

下载 [slf4j-nop-1.6.1.jar](http://www.java2s.com/Code/Jar/s/Downloadslf4jnop161jar.htm) , [slf4j-api-1.7.26.jar 和 mina-core-2.1.1.jar](http://mina.apache.org/mina-project/) , 导入 libs 目录(不导入 slf4j-nop-1.6.1.jar 运行时会报错 Failed to load class `org.slf4j.impl.StaticLoggerBinder`：，详见 https://www.slf4j.org/codes.html#StaticLoggerBinder )。

File-New-New Module，切换 Project 视图，复制 jar 包到libs目录；

Run - EditConfigurations - + Application，填写 Name, Main class, Working directory, Use classpath of module，点击OK，如下图:

![androidStudioRunClassConfiguration](https://raw.githubusercontent.com/rangerzhou/git_resource/master/blog_resource/2019/androidStudioRunClassConfiguration.png)

lsof -i:8989 可查看 8989 端口是否被占用，如被占用 kill PID 即可。

