---
title: 自动认证公司网络
copyright: true
date: 2021-05-20 13:27:04
tags:
categories: Python
password:
top:
---



> 公司网络每隔 8 小时需要登录一次，用起来比较烦，使用 Python POST 自动认证网络。

<!--more-->

### 1. 获取 POST 请求的 URL

在登录界面，按 F12 进入 inspect，切换到 Network，清空所有请求，在账号密码区域输入账号密码，点击登录，可以看到有很多 POST 和 GET 请求，点击出现的请求，在 Headers 下的 **General** 中可以看到 `Request Method:`，找到请求方式为 POST 的请求，`Request URL` 就是 POST 的 URL 。

![getPostUrl](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2021/getPostUrl.png)

### 2. 获取 POST 请求时需要携带的参数

下拉到 Headers - Form Data，有几个参数，包括 user 和 passwd，这两个参数就是登录时需要输入的账号和密码，这些参数就是 POST 请求需要携带的参数。

![getFormData](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2021/getFormData.png)

### 3. 使用 requests.post 请求登录网站

代码如下：

network_auto_auth.py

``` python
import logging
import os
import re
import sys
import time
from logging.handlers import TimedRotatingFileHandler

import requests
import schedule


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


def login(user, passwd):
    format_time = time.strftime("[%Y-%m-%d %H:%M:%S]", time.localtime())
    test_url = 'http://www.baidu.com'
    try:
        logger.info("测试连接..." + test_url)
        r = requests.get(test_url)
        index = r.text.find('Kerberos V5 Authentication Redirection')
        if index != -1:
            # 测试连接失败，尝试认证
            logger.info("连接失败，用户认证中...")
            headers = {
                # "Host":"internet-na.aptiv.com:6082",
                # "Content-Type":"application/x-www-form-urlencoded",
                # "Referer":"https://internet-na.aptiv.com:6082/php/uid.php?vsys=2&rule=73",
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4430.212 Safari/537.36"
            }
            data = {
                'escapeUser': user,
                'user': user,
                'passwd': passwd,
                'ok': 'Login'  # 提交登录
            }
            url = 'https://internet-na.aptiv.com:6082/php/uid.php?vsys=2&rule=73'
            resp = requests.post(url, headers=headers, data=data)
            if resp.text.find('User Authenticated') != -1:
                logger.info("用户认证成功...\n")
            else:
                logger.warning("用户认证失败...status_code: " + str(resp.status_code) + ", text: " + str(resp.text) + "\n")
        elif r.status_code == 200:
            # 连接成功
            logger.info("连接成功，用户已认证...\n")
            return
        else:
            # 连接异常
            logger.error("测试连接异常...status_code: " + str(r.status_code) + ", text: " + str(r.text) + "\n")
            return
    except Exception as e:
        logger.error("网络连接异常---Exception: " + str(e))
        return


User = 'wjl0n2'
Passwd = '123456'
login(User, Passwd)
schedule.every(5).seconds.do(login, User, Passwd)

while 1:
    schedule.run_pending()
    time.sleep(5)

```

### 4. 配置开机启动脚本

network_auto_auth.service

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

配置启动

``` shell
# enable systemd service
$ sudo systemctl enable network_auto_auth.service
$ sudo systemctl is-enabled network_auto_auth.service
enable

$ sudo systemctl daemon-reload
# 启动服务
$ sudo systemctl start network_auto_auth.service
# 查看状态
$ sudo systemctl status network_auto_auth.service
● network_auto_auth.service - Aptiv Network Auto Authentication
     Loaded: loaded (/etc/systemd/system/network_auto_auth.service; enabled; vendor preset: enabled)
     Active: active (running) since Fri 2021-05-21 14:11:31 CST; 15ms ago
   Main PID: 881306 (python3)
      Tasks: 1 (limit: 38099)
     Memory: 1.8M
     CGroup: /system.slice/network_auto_auth.service
             └─881306 /usr/bin/python3 /home/ranger/bin/NetworkAutoAuth/network_auto_auth.py &
             
5月 21 14:11:31 mintos systemd[1]: Started Aptiv Network Auto Authentication.

# 查看进程看是否启动成功
$ ps -axu | grep network_auto_auth
ranger    881306  0.2  0.0  35228 22088 ?        Ss   14:11   0:00 /usr/bin/python3 /home/ranger/bin/NetworkAutoAuth/network_auto_auth.py &
```





参考：

https://blog.csdn.net/zhusongziye/article/details/91353222