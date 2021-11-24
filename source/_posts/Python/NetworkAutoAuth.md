---
title: 自动认证公司网络
copyright: true
date: 2021-05-20 13:27:04
tags:
categories: Python
password: zr.
top:
---

> 公司自己安装的操作系统，网络每隔 8 小时需要手动 ~~点击登录~~ 认证一次，本脚本每隔 5 秒钟检测一次网络状态，若认证超时则自动重新认证，可代替手动认证，太懒了没办法 O(∩_∩)O~



**<font color = red>20211118更新：公司服务器迁移，认证方式修改，旧版本的账号密码登录直接行不通了，弹不出登录界面了</font>**

<!--more-->

---

### 1. 生成秘钥表（keytab）

#### 1.1 安装 krb5-user

``` shell
$ sudo apt install krb5-user
```

#### 1.2 生成秘钥表

``` shell
$ ktutil
ktutil:  addent -password -p ran.zhou@APTIV.COM -k 1 -e aes256-cts-hmac-sha1-96
Password for ran.zhou@APTIV.COM:
ktutil:  wkt /home/ranger/bin/NetworkAutoAuth/aptiv.keytab # 此处修改为自己的目录
ktutil:  l
slot KVNO Principal
---- ---- ---------------------------------------------------------------------
   1    1                       ran.zhou@APTIV.COM
ktutil:  l -e
slot KVNO Principal
---- ---- ---------------------------------------------------------------------
   1    1                       ran.zhou@APTIV.COM (aes256-cts-hmac-sha1-96)
ktutil:  q
```

<font color = red>**注意必须是大写的 @APTIV.COM，需要修改秘钥表的保存位置，在 Linux 生成 keytab 比较方便，经测试生成的 keytab 文件 windows 下也可使用**</font>

#### 1.3 认证

``` shell
# kinit 获取并缓存 principal（当前主体）的初始票据授予票据（TGT），用于 Kerberos 系统进行身份安全验证
$ kinit -k -t /home/ranger/bin/NetworkAutoAuth/ranger.keytab ran.zhou@APTIV.COM # 大写的 @APTIV.COM
# APTIV 网络认证
$ curl -v --negotiate -u : 'http://internet-ap.aptiv.com:6080/php/browser_challenge.php?vsys=1&rule=77&preauthid=&returnreq=y'
```



#### 1.4 测试

``` shell
# 认证成功
$ curl http://detectportal.firefox.com/success.txt
success
# 认证失败
$ curl http://detectportal.firefox.com/success.txt
curl: (56) Recv failure: Connection reset by peer
```



如果获取 TGT 过程提示 `kinit: Pre-authentication failed: No key table entry found for ran.zhou@aptiv.com while getting initial credentials`

可能是秘钥表加密方式不对，可以先不使用秘钥表获取 TGT，再使用 `klist -e` 命令获取加密方式

手动获取 TGT 命令：

``` shell
# 获取 TGT
$ kinit ran.zhou@APTIV.COM
Password for ran.zhou@APTIV.COM:
# 显示凭证高速缓存中每个凭证或密钥表文件中每个密钥的会话密钥和票证的加密类型
$ klist -e
Ticket cache: FILE:/tmp/krb5cc_1000
Default principal: ran.zhou@APTIV.COM

Valid starting       Expires              Service principal
2021-11-13T09:38:07  2021-11-13T09:40:09  krbtgt/APTIV.COM@APTIV.COM
	renew until 2021-11-13T09:40:09, Etype (skey, tkt): aes256-cts-hmac-sha1-96, aes256-cts-hmac-sha1-96
```

可以看到加密方式为 *aes256-cts-hmac-sha1-96*

### 2. 自动认证脚本

``` python
import logging
import os
import re
import sys
import time
from logging.handlers import TimedRotatingFileHandler

import requests
import schedule
import subprocess


def setup_log(log_name):
    # 创建logger对象, 传入logger名字
    mylogger = logging.getLogger(log_name)
    log_path = os.path.join(sys.path[0], "./", log_name)
    mylogger.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "[%(asctime)s] [%(process)d] [%(levelname)s] - %(module)s.%(funcName)s (%(filename)s:%(lineno)d) - %(message)s")

    # 定义日志输出格式,interval: 滚动周期;
    # when="MIDNIGHT": 表示每天0点为更新点
    # interval=1: 每天生成一个文件;
    # backupCount: 表示日志保存个数

    # 使用 FileHandler 输出到文件
    file_handler = TimedRotatingFileHandler(
        filename=log_path, when="MIDNIGHT", interval=1, backupCount=3
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(formatter)

    # filename="mylog" suffix设置，会生成文件名为mylog.2020-02-25.log
    file_handler.suffix = "%Y-%m-%d.log"
    # extMatch是编译好正则表达式，用于匹配日志文件名后缀
    # 需要注意的是suffix和extMatch一定要匹配的上，如果不匹配，过期日志不会被删除。
    file_handler.extMatch = re.compile(r"^\d{4}-\d{2}-\d{2}.log$")

    # # 使用 StreamHandler 输出到屏幕
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(formatter)

    mylogger.addHandler(file_handler)
    mylogger.addHandler(stream_handler)
    return mylogger


logger = setup_log("mylog")


def login():
    format_time = time.strftime("[%Y-%m-%d %H:%M:%S]", time.localtime())
    # http://www.msftconnecttest.com/connecttest.txt    Microsoft Connect Test%
    # http://detectportal.firefox.com/success.txt    success
    test_url = 'http://detectportal.firefox.com/success.txt'
    try:
        logger.info("测试连接..." + test_url)
        r = requests.get(test_url)
        if r.text == "success\n":
            # 连接成功
            logger.info("连接成功，用户已认证...\n")
            return
        else:
            # 测试连接失败，尝试认证
            logger.info("连接失败，用户认证中...")

            kinitcmd = "kinit -k -t /home/ranger/bin/NetworkAutoAuth/aptiv.keytab ran.zhou@APTIV.COM"
            kinitres = subprocess.call(kinitcmd, shell=True)

            curlcmd = "curl -v --negotiate -u : 'http://internet-ap.aptiv.com:6080/php/browser_challenge.php?vsys=1&rule=77&preauthid=&returnreq=y'"
            curlres = subprocess.call(curlcmd, shell=True)

            if kinitres ==0 and curlres == 0:
                resp = requests.get(test_url)
                if resp.text == "success\n":
                    logger.info("用户认证成功\n")
                else:
                    logger.warning("用户认证失败...status_code: " + str(resp.status_code) + ", text: " + str(resp.text) + "\n")
            else:
                logger.warning("shell 命令执行失败\n")
    except Exception as e:
        logger.error("网络连接异常---Exception: " + str(e) + "\n")
        return

login()
schedule.every(5).seconds.do(login)

while 1:
    schedule.run_pending()
    time.sleep(5)
```

<font color = red>**需修改 *kinitcmd* 值为自己 keytab 的目录 和 *用户名*** </font>

编辑 **network_auto_auth.service** ，和 **bootstart.sh** 放在同一目录，执行 **bootstart.sh** 即可启动脚本认证并开机自动启动。

---



### ~~修改账号密码（旧版本认证，已废弃）~~

~~**<font color = red>替换 network_auto_auth.py 中的账号密码，改为自己的 netid 和密码</font>**~~

``` python
User = 'wjl0n2'
Passwd = '123456'
```

### 3. 配置开机启动（Linux 系统）

**network_auto_auth.service**

``` shell
[Unit]
Description=Aptiv Network Auto Authentication
After=network.target

[Service]
Type=simple
User=ranger
Group=ranger
ExecStart=/usr/bin/python3 /home/ranger/bin/NetworkAutoAuth/network_auto_auth.py &

[Install]
WantedBy=multi-user.target
```

**<font color = red>根据自己电脑环境修改 `ExecStart, User, Group`，User 和 Group 直接改为 root 也可以 。</font>**



**bootstart.sh**

``` shell
#!/bin/bash
# 把开机启动 service 添加到 /etc/systemd/system/ 目录下
sudo cp network_auto_auth.service /etc/systemd/system/network_auto_auth.service

sudo systemctl stop network_auto_auth.service
sudo systemctl enable network_auto_auth.service
sudo systemctl is-enabled network_auto_auth.service
sudo systemctl daemon-reload
# 启动服务
sudo systemctl start network_auto_auth.service
# 查看状态
sudo systemctl status network_auto_auth.service
ps -axu | grep network_auto_auth
exit
```



**把开机启动 service 添加到 /etc/systemd/system/ 目录下，并使其生效：**

``` shell
# 配置启动
$ ./bootstart.sh
enabled
● network_auto_auth.service - Aptiv Network Auto Authentication
     Loaded: loaded (/etc/systemd/system/network_auto_auth.service; enabled; vendor preset: enabled)
     Active: active (running) since Fri 2021-05-21 14:11:31 CST; 15ms ago
   Main PID: 881306 (python3)
      Tasks: 1 (limit: 38099)
     Memory: 1.8M
     CGroup: /system.slice/network_auto_auth.service
             └─881306 /usr/bin/python3 /home/ranger/bin/NetworkAutoAuth/network_auto_auth.py &

5月 21 14:11:31 mintos systemd[1]: Started Aptiv Network Auto Authentication.

# 查看脚本是否启动成功
$ ps -axu | grep network_auto_auth
ranger    881306  0.2  0.0  35228 22088 ?        Ss   14:11   0:00 /usr/bin/python3 /home/ranger/bin/NetworkAutoAuth/network_auto_auth.py &
```

### 4. 监控进程状态(有 bug)

进程有时会被终结，添加一个守护进程对其监控，一旦被终结，则自动重启

monitor.sh

``` shell
#! /bin/sh

# 当前用户根目录
host_dir=`echo ~`
# 进程名
proc_name="network_auto_auth"
# 日志文件
file_name="/home/ranger/bin/NetworkAutoAuth/monitor.log"
pid=0

# 计算进程数
proc_num()
{
    num=`ps -ef | grep $proc_name | grep -v grep | wc -l`
    return $num
}

# 进程号
proc_id()
{
    pid=`ps -ef | grep $proc_name | grep -v grep | awk '{print $2}'`
}

proc_num
number=$?
# 判断进程是否存在
if [ $number -eq 0 ]
then
    # 重启进程的命令，请相应修改
    sh ~/bin/NetworkAutoAuth/bootstart.sh
    # 获取新进程号
    proc_id
    # 将新进程号和重启时间记录
    echo ${pid}, `date` >> $file_name
fi
```

配置守护进程

``` shell
$ crontab -e
*/5 * * * * /home/ranger/bin/NetworkAutoAuth/monitor.sh
$ sudo service cron restart
$ sudo service cron reload
```

测试

``` shell
# 查询进程号
$ ps aux | grep network_auto_auth
# 终结进程测试
$ sudo kill -9 1591904
$ ps aux | grep network_auto_auth
ranger   1593664  0.0  0.0  35236 21916 ?        Ss   11:10   0:02 /usr/bin/python3 /home/ranger/bin/NetworkAutoAuth/network_auto_auth.py &
$ cat monitor.log
1593664, Tue 27 Jul 2021 11:10:02 AM CST
```

### 5. Windows 下使用

#### 5.1 安装 Kerberos-Windows 客户端

下载地址：http://web.mit.edu/kerberos/dist/，选择 MIT Kerberos for Windows 4.1，重启电脑，会自动配置环境变量到 path，但是需要把对应的环境变量移动到最前面，默认安装路径：C:\Program Files\MIT\Kerberos\bin ，使用 *C:\Program Files\MIT\Kerberos\bin* 下的 `klist` `kinit` 命令

#### 5.2 Windows 安装 curl

下载地址：https://curl.se/windows/

#### 5.3 其他步骤

同 Linux

在 Linux 生成 keytab 比较方便，经测试生成的 keytab 文件 windows 下也可使用
