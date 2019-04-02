---
title: Ubuntu_Gerrit搭建
copyright: true
date: 2019-01-08 15:28:40
tags: Gerrit
categories: Android
password:
---

> Gerrit

<!--more-->



[Gerrit下载链接](https://www.gerritcodereview.com/) ，下载后是一个 *.war 文件，使用 `java -jar Downloads/gerrit-2.16.2.war init -d gerrit` 安装 gerrit，安装前首先安装 mysql，并且新建 安装 gerrit 时使用到的数据库：

``` shell
mysql -u root –p
>create database gerritdb;
> grant all on gerritdb.* to 'gerrituser'@'localhost' identified by 'gerritpass';
```



如下命令安装 Gerrit

``` shell
gerrit@aptivadp:~ $ java -jar Downloads/gerrit-2.16.2.war init -d gerrit
Using secure store: com.google.gerrit.server.securestore.DefaultSecureStore
[2019-01-08 16:39:04,277] [main] INFO  com.google.gerrit.server.config.GerritServerConfigProvider : No /home/gerrit/gerrit/etc/gerrit.config; assuming defaults

*** Gerrit Code Review 2.16.2
*** 


*** Git Repositories
*** 

Location of Git repositories   [git]: 

*** SQL Database
*** 

Database server type           [h2]: mysql
Server hostname                [localhost]: 
Server port                    [(mysql default)]: 
Database name                  [reviewdb]: gerritdb #前面设置的数据库名
Database username              [gerrit]: gerrituser #前面授权的用户
gerrituser's password          : #连续输入两次密码gerritpass
              confirm password : 

*** Index
*** 

Type                           [lucene/?]: 

*** User Authentication
*** 

Authentication method          [openid/?]: http
Get username from custom HTTP header [y/N]? 
SSO logout URL                 : 
Enable signed push support     [y/N]? 

*** Review Labels
*** 

Install Verified label         [y/N]? 

*** Email Delivery
*** 

SMTP server hostname           [localhost]: 
SMTP server port               [(default)]: 
SMTP encryption                [none/?]: 
SMTP username                  : 

*** Container Process
*** 

Run as                         [gerrit]: gerrit
Java runtime                   [/usr/lib/jvm/java-8-openjdk-amd64/jre]: 
Copy gerrit-2.16.2.war to gerrit/bin/gerrit.war [Y/n]? 
Copying gerrit-2.16.2.war to gerrit/bin/gerrit.war

*** SSH Daemon
*** 

Listen on address              [*]: 
Listen on port                 [29418]: 
Generating SSH host key ... rsa... ed25519... ecdsa 256... ecdsa 384... ecdsa 521... done

*** HTTP Daemon
*** 

Behind reverse proxy           [y/N]? y #选择y
Proxy uses SSL (https://)      [y/N]? 
Subdirectory on proxy server   [/]: 
Listen on address              [*]: 
Listen on port                 [8081]: 8082
Canonical URL                  [http://aptivadp.com/]: http://10.243.54.188 

*** Cache
*** 


*** Plugins
*** 

Installing plugins.
Install plugin codemirror-editor version v2.16.2 [y/N]? y
Installed codemirror-editor v2.16.2
Install plugin commit-message-length-validator version v2.16.2 [y/N]? y
Installed commit-message-length-validator v2.16.2
Install plugin download-commands version v2.16.2 [y/N]? y
Installed download-commands v2.16.2
Install plugin hooks version v2.16.2 [y/N]? y
Installed hooks v2.16.2
Install plugin replication version v2.16.2 [y/N]? y
Installed replication v2.16.2
Install plugin reviewnotes version v2.16.2 [y/N]? y
Installed reviewnotes v2.16.2
Install plugin singleusergroup version v2.16.2 [y/N]? y
Installed singleusergroup v2.16.2
Initializing plugins.

Initialized /home/gerrit/gerrit
Reindexing projects:    100% (2/2) with: reindex --site-path gerrit --threads 1 --index projects
Reindexed 2 documents in projects index in 0.1s (32.8/s)

```





``` shell
gerrit@aptivadp:~ $ netstat -lntup
gerrit@aptivadp:~ $ sudo kill 22693
gerrit@aptivadp:~ $ sudo gerrit/bin/gerrit.sh restart
Stopping Gerrit Code Review: OK
Starting Gerrit Code Review: OK

```



``` shell
$ touch ./review_site/etc/passwd
$ htpasswd -b ./review_site/etc/passwd admin admin
```

*/etc/apache2/sites-available/000-default.conf* 配置如下：

``` shell
<VirtualHost *:8888>
    ServerName 10.243.54.188
    ProxyPreserveHost On
    ProxyRequests Off
    <Proxy *>
        Order deny,allow
        Allow from all
    </Proxy>
    <Location />
        AuthType Basic
        AuthName "Gerrit Code Review"
        Require valid-user
        AuthUserFile /home/gerrit/gerrit/etc/passwd
    </Location>
    ProxyPass / http://10.243.54.188:8088/
    proxyPassReverse / http://127.0.0.1:8088/
</VirtualHost>

```

如上是参考网上其他人的配置，在 Gerrit官网 也给出了相关文档：https://gerrit-documentation.storage.googleapis.com/Documentation/2.16.2/config-reverseproxy.html ，参考配置如下：

``` shell
<VirtualHost *>
    ServerName 10.243.54.188

    ProxyRequests Off
    ProxyVia Off
    ProxyPreserveHost On

    <Proxy *>
        # Order deny,allow
        # Allow from all
        # 在 Apache >= 2.4的版本上可以用下面这句代替上面两句
        # Use following line instead of the previous two on Apache >= 2.4
        Require all granted
    </Proxy>

    <Location />
        AuthType Basic
        AuthName "Gerrit Code Review"
        Require valid-user
        AuthUserFile /home/gerrit/gerrit/etc/passwd
    </Location>

    #ProxyPass / http://10.243.54.188:8088/
    #proxyPassReverse / http://127.0.0.1:8088/
    AllowEncodedSlashes On
    ProxyPass / http://127.0.0.1:8088/ nocanon
    # The two options 'AllowEncodedSlashes On' and 'ProxyPass .. nocanon' are required since Gerrit 2.6.
</VirtualHost>
```

同时需要配置 */etc/apache2/ports.conf* ，添加所需的端口：

``` shell
# If you just change the port or add more ports here, you will likely also
# have to change the VirtualHost statement in
# /etc/apache2/sites-enabled/000-default.conf

Listen 80

# 如下添加 2 个端口，在浏览器中输入
Listen 8888
Listen 9999

<IfModule ssl_module>
	Listen 443
</IfModule>

<IfModule mod_gnutls.c>
	Listen 443
</IfModule>

# vim: syntax=apache ts=4 sw=4 sts=4 sr noet
```

配置了 2 个端口 8888 和 9999，在浏览器中输入 http://10.243.54.188:8888/ 或者 http://10.243.54.188:9999/ 都是可以访问的。



*/home/gerrit/gerrit/etc/gerrit.config*

``` shell
[gerrit]
	basePath = git
	serverId = f5a6836d-abf5-47e3-b79e-1c24f6b8700a
	canonicalWebUrl = http://10.243.54.188:8088
[database]
	type = mysql
	hostname = localhost
	database = gerritdb
	username = gerrituser
[container]
	javaOptions = "-Dflogger.backend_factory=com.google.common.flogger.backend.log4j.Log4jBackendFactory#getInstance"
	javaOptions = "-Dflogger.logging_context=com.google.gerrit.server.logging.LoggingContext#getInstance"
	user = gerrit
	javaHome = /usr/lib/jvm/java-8-openjdk-amd64/jre
[index]
	type = LUCENE
[auth]
	type = HTTP
[receive]
	enableSignedPush = false
[sendemail]
	smtpServer = localhost
[sshd]
	listenAddress = *:29418
[httpd]
	listenUrl = proxy-http://*:8088/
[cache]
	directory = cache

```

gerrit.config 中的 **httpd.listenUrl** 的端口号和 ports.conf 中 **Listen** 的端口号不能一样，否则 gerrit 或者 apache 有一个无法启动。

**设置第一个 Gerrit 用户名和密码**

``` shell
$ touch ./review_site/etc/passwd
$ htpasswd -b ./review_site/etc/passwd admin admin
Adding password for user admin
```

后续再添加 Gerrit 用户可使用 `htpasswd -b ./review_site/etc/passwd UserName PassWord` 。

查看端口状态：

``` shell
netstat -lntup
sudo lsof -i -P
```

配置 /etc/hosts ，以别名访问：

``` shell
ranger@zr:~/work/renesas_v3 $ sudo cat /etc/hosts
127.0.0.1	localhost
127.0.1.1	zr
10.243.54.188   gerrit.aptivadp.com
... ...
```



``` shell
gerrit@aptivadp:~/work $ ssh -p 29418 -i ~/.ssh/id_rsa 10.243.54.188 -l admin

  ****    Welcome to Gerrit Code Review    ****

  Hi admin, you have successfully connected over SSH.

  Unfortunately, interactive shells are disabled.
  To clone a hosted Git repository, use:

  git clone ssh://admin@10.243.54.188:29418/REPOSITORY_NAME.git

Connection to 10.243.54.188 closed by remote host.
Connection to 10.243.54.188 closed.

gerrit@aptivadp:~/work $ ssh -p 29418 admin@10.243.54.188

  ****    Welcome to Gerrit Code Review    ****

  Hi admin, you have successfully connected over SSH.

  Unfortunately, interactive shells are disabled.
  To clone a hosted Git repository, use:

  git clone ssh://admin@10.243.54.188:29418/REPOSITORY_NAME.git

Connection to 10.243.54.188 closed by remote host.
Connection to 10.243.54.188 closed.
```

配置~/.ssh/config文件来为ssh连接设置别名:

``` shell
Host gerrit
     User admin
     Port 29418
     HostName 10.243.54.188
     IdentityFile ~/.ssh/id_rsa
```

使用别名连接 ssh：

``` shell
gerrit@aptivadp:~/work $ ssh gerrit

  ****    Welcome to Gerrit Code Review    ****

  Hi admin, you have successfully connected over SSH.

  Unfortunately, interactive shells are disabled.
  To clone a hosted Git repository, use:

  git clone ssh://admin@10.243.54.188:29418/REPOSITORY_NAME.git

Connection to 10.243.54.188 closed by remote host.
Connection to 10.243.54.188 closed.

```



创建项目，创建后会在 */gerrit/gerrit/git*  下：

``` shell
gerrit@aptivadp:~ $ ssh -p 29418 admin@10.243.54.188 gerrit create-project Demo-project
```



配置自动启动，首先查看 gerrit.sh

``` shell
$ cat gerit/bin/gerrit.sh | head -n 50
# Configuration files:
#
# /etc/default/gerritcodereview
#   If it exists, sourced at the start of this script. It may perform any
#   sequence of shell commands, like setting relevant environment variables.
#
# The files will be checked for existence before being sourced.

# Configuration variables.  These may be set in /etc/default/gerritcodereview.
#
# GERRIT_SITE
#   Path of the Gerrit site to run.  $GERRIT_SITE/etc/gerrit.config
#   will be used to configure the process.
#
# GERRIT_WAR
#   Location of the gerrit.war download that we will execute.  Defaults to
#   container.war property in $GERRIT_SITE/etc/gerrit.config.
#
# NO_START
#   If set to "1" disables Gerrit from starting.
# 从以上注释得知 /etc/default/gerritcodereview 为配置文件，如下配置开机启动
$ sudo ln -snf /home/gerrit/gerrit/bin/gerrit.sh /etc/init.d/gerrit.sh
$ sduo ln -snf /etc/init.d/gerrit.sh /etc/rc2.d/S90gerrit
$ sduo ln -snf /etc/init.d/gerrit.sh /etc/rc3.d/S90gerrit
# 自动启动脚本 /etc/init.d/gerrit.sh 需要通过 /etc/default/gerritcodereview 文件来提供一些配置
$ sudo cat /etc/default/gerritcodereview
# 内容如下
GERRIT_SITE=/home/gerrit/gerrit
NO_START=0 # 值为 1 时取消开机启动

```





Reference: 

https://scm002.iteye.com/blog/2293641

https://www.zxblinux.com/archives/332

https://www.gerritcodereview.com/

http://www.hovercool.com/en/Gerrit%E6%9C%8D%E5%8A%A1%E5%99%A8%E6%90%AD%E5%BB%BA

http://www.mywiki.cn/hovercool/index.php/Gerrit%E6%9C%8D%E5%8A%A1%E5%99%A8%E6%90%AD%E5%BB%BA



ssh连接gerrit

http://www.gerrit.com.cn/1571.html



