---
title: EIIP 项目记录
copyright: true
date: 2020-02-26 10:31:07
tags:
categories: Work
password: zr.

---

### 安装 hadoop 2.7.7

https://www.jianshu.com/p/4c81a1e32161

``` shell
# http://apache.cs.utah.edu/hadoop/common/
$ wget http://apache.cs.utah.edu/hadoop/common/hadoop-2.7.7/hadoop-2.7.7.tar.gz
# 解压
$ x hadoop-2.7.7.tar.gz
# 建立软连接 方便以后更换hadoop的版本 避免重新更改环境变量
ln -s hadoop-2.7.7 hadoop
# 以后修改链接源目录的话：ln –snf  hadoop-2.x   hadoop

```



### 安装 SPARK

https://spark.apache.org/downloads.html

修改终端 spark log 级别：

``` shell
cd $SPARK_HOME/conf
# 修改 log4j.properties
cp log4j.properties.template log4j.properties
vim log4j.properties
# 将log4j.rootCategory=INFO, console 改成 log4j.rootCategory=WARN, console
```



### 安装 MongoDB

``` shell
# 导入公钥
$ sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 9DA31620334BD75D9DCB49F368818C72E52529D4
# 创建源列表文件 MongoDB
$ echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.0.list
# 在安装之前，先更新系统资源包
$ sudo apt update
# 安装mongodb资源包
$ sudo apt install -y mongodb-org # 这行命令是默认安装最新版本的mongodb
# 管理mongoDB Server
$ sudo systemctl enable mongod  # 加入mongod服务
$ sudo systemctl start mongod   # 开启mongod服务，也可用 sudo service mongod start
$ sudo systemctl stop mongod  # 停止mongod服务
# 查看mongo版本
$ mongo --version                                                                                                                                        
MongoDB shell version v4.0.16
git version: 2a5433168a53044cb6b4fa8083e4cfd7ba142221
OpenSSL version: OpenSSL 1.1.1  11 Sep 2018
allocator: tcmalloc
modules: none
build environment:
    distmod: ubuntu1804
    distarch: x86_64
    target_arch: x86_64

```



### 安装 Meteor

``` shell
curl https://install.meteor.com/ | sh
```

### 安装 nosqlclient

https://www.nosqlclient.com/docs/start.html#compile

###### TL;DR

1. Install [MeteorJS](https://www.meteor.com/) (supports all platforms)
2. Download latest [Nosqlclient source](https://github.com/nosqlclient/nosqlclient/archive/master.zip)
3. Unzip source code and navigate into **nosqlclient-master**
4. Execute `meteor npm install`
5. Execute `meteor --port 3000`
6. All set, now you can reach Nosqlclient from your browser **localhost:3000**

Nosqlclient uses MeteorJS version 1.5.1 as of version 2.2.0. To read complete MeteorJS guide you can follow [this link](http://docs.meteor.com/). To read more about code guideline, and how to contribute, you can [check here](https://www.nosqlclient.com/docs/user_manual.html)

### 安装 Mongodb Compass

https://www.mongodb.com/download-center/compass

### 运行 sample(sparkcore)

``` shell
$ ~/opt/spark/sbin/start-all.sh
$ spark-submit --class SimpleZeroMQPublisher /home/ranger/Work/EIIP/samples/Spark/sparkcore-1.0-Tricia.jar tcp://127.0.0.1:1234 /home/ranger/Work/EIIP/samples/Spark/template.json
$ spark-submit --class ZMQReceiver --packages org.mongodb.spark:mongo-spark-connector_2.11:2.3.3 /home/ranger/Work/EIIP/samples/Spark/sparkcore-1.0-Tricia.jar
```

生成 jar 包：jar cvf sparkcore-1.0-new.jar *

解压 jar 包：jar xvf sparkcorexxx.jar



### 安装 Maven

下载 [apache-maven-3.x.x-bin.tar.gz](https://maven.apache.org/download.cgi)

``` shell
$ cd ~/opt
$ x apache-maven-3.x.x-bin.tar.gz
$ cd apache-maven-3.x.x
$ vim ~/.bashrc
# 添加如下配置：
export M2_HOME=/usr/local/apache-maven-3.x.x
export PATH=${M2_HOME}/bin:$PATH
$ source ~/.bashrc #立即生效
$ mvn -v
Apache Maven 3.6.3 (cecedd343002696d0abb50b32b541b8a6ba2883f)
Maven home: /home/ranger/opt/apache-maven-3.6.3
Java version: 1.8.0_232, vendor: Private Build, runtime: /usr/lib/jvm/java-8-openjdk-amd64/jre
Default locale: en_US, platform encoding: UTF-8
OS name: "linux", version: "5.3.0-26-generic", arch: "amd64", family: "unix"
```

### 安装 Dbeaver

https://dbeaver.io/download/

https://blog.csdn.net/horses/article/details/89683422

教程：[https://www.ignite-service.cn/doc/sql/ToolsAndAnalytics.html#_1-sql%E5%B7%A5%E5%85%B7](https://www.ignite-service.cn/doc/sql/ToolsAndAnalytics.html#_1-sql工具)

### 安装 superset

使用：

https://juejin.im/post/5ce3db825188252d23796a5f

https://zhuanlan.zhihu.com/p/28485468

``` bash
# https://superset.incubator.apache.org/installation.html
# Install　Anaconda：https://zhuanlan.zhihu.com/p/32925500
# Download anaconda: https://www.anaconda.com/distribution/#linux
$ bash ~/Download/Anaconda3-2020.02-Linux-x86_64.sh
# Create conda env
$ conda create -n superset python=3.7
# Activate env
$ conda activate superset
# Install superset
$ pip install apache-superset
# Install flask-appbuilder
$ pip install flask-appbuilder
# Install necessary modules
$ pip install wtforms_json flask_compress celery flask_migrate flask_talisman flask_caching sqlparse bleach markdown numpy pandas parsedatetime pathlib2 simplejson humanize python-geohash polyline geopy cryptography backoff msgpack pyarrow contextlib2 croniter retry selenium isodate
# Initialize the database
$ superset db upgrade 
# Create an admin user # fabmanager create-admin --app superset
$ export FLASK_APP=superset
$ flask fab create-admin
# Load some data to play with
$ superset load_examples
# Create default roles and permissions
$ superset init
# To start a development web server on port 8088, use -p to bind to another port
$ superset run -p 8088 --with-threads --reload --debugger
```



按照如上步骤操作，基本无异常，如有异常请重新安装，重新安装的话在 superset db upgrade 时可能的异常：

``` shell
Error: Can't locate revision identified by 'e96dbf2cfef0'
```

解决：删除 ~/.superset 即可

``` shell
pip freeze | grep -i superset
```



汉化：

``` shell
$ vim /home/ranger/anaconda3/envs/superset/lib/python3.7/site-packages/superset/config.py
# 修改 BABEL_DEFAULT_LOCALE = "zh"
```



参考：https://zhuanlan.zhihu.com/p/28485468



### 错误 log

#### 在 yarn 上运行 spark时：

``` shell
$ ~/opt/hadoop/sbin/start-dfs.sh
$ ~/opt/hadoop/sbin/start-yarn.sh
$ spark-submit \           
--class org.apache.spark.examples.SparkPi \
--master yarn \
--deploy-mode client \
/home/ranger/opt/spark/examples/jars/spark-examples_2.11-2.4.5.jar \
100
```

报错如下：

``` shell
20/02/27 11:22:57 WARN Client: Failed to cleanup staging dir hdfs://127.0.0.1:9000/user/ranger/.sparkStaging/application_1582773754436_0001
java.net.ConnectException: Call From Tricia/127.0.1.1 to localhost:9000 failed on connection exception: java.net.ConnectException: Connection refused; For more details see:  http://wiki.apache.org/hadoop/ConnectionRefused
```

可能的解决方案：`hadoop namenode -format` 

#### 设置spark.yarn.jars

``` shell
Neither spark.yarn.jars nor spark.yarn.archive is set, falling back to uploading libraries under SPARK_HOME.
```

解决方案：

https://www.jianshu.com/p/eef73f3f4819

https://www.cnblogs.com/honeybee/p/6379599.html



#### WordCount 报错

``` shell
20/02/27 16:28:12 ERROR Executor: Exception in task 0.0 in stage 0.0 (TID 0)
java.lang.NoSuchMethodError: scala.Predef$.refArrayOps([Ljava/lang/Object;)[Ljava/lang/Object;
	at com.aptiv.spark.WordCount$.$anonfun$main$1(WordCount.scala:23)
	at com.aptiv.spark.WordCount$.$anonfun$main$1$adapted(WordCount.scala:23)
	at scala.collection.Iterator$$anon$12.nextCur(Iterator.scala:435)
	at scala.collection.Iterator$$anon$12.hasNext(Iterator.scala:441)
	at scala.collection.Iterator$$anon$11.hasNext(Iterator.scala:409)

```

#### Lambda expressions are not supported at language level '5'

File → Project Structure → Project/Modules，把 Language level 改为 8 .

#### Error:java: javacTask: source release 8 requires target release 1.8

File - settings - Build, Execution, Deployment - Compiler - Java Compiler - Per-module bytecode version - Target bytecode version 改为8

![image-20200317094727794](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/TargetBytecodeVersion.png)

一劳永逸的方法是在 pom.xml 中加入如下配置：

``` xml
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <configuration>
                    <source>8</source>
                    <target>8</target>
                </configuration>
            </plugin>
        </plugins>
    </build>
```



### 相关配置

a. 修改终端显示 log 级别

``` shell
$ vim $SPARK_HOME/conf/log4j.properties
log4j.rootCategory=WARN, console
```

### 参数配置

板子 IP：192.168.20.10

电脑 IP：192.168.20.55