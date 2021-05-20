---
title: Python POST 自动登录认证网络
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

aptiv-network.py

``` python
import requests
import schedule
import time

def login(User,Passwd):
	format_time = time.strftime("[%Y-%m-%d %H:%M:%S]", time.localtime())
	test_url = 'http://www.baidu.com'
	try:
		print(format_time,"测试连接...")
		r = requests.get(test_url)
		index = r.text.find('Kerberos V5 Authentication Redirection')
		if index != -1:
			print(format_time,"连接失败，用户认证中...")
			headers = {
				#"Host":"internet-na.aptiv.com:6082",
				#"Content-Type":"application/x-www-form-urlencoded",
				#"Referer":"https://internet-na.aptiv.com:6082/php/uid.php?vsys=2&rule=73",
    			"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36"
    		}
			data = {
				'escapeUser':User,
				'user':User,
				'passwd':Passwd,
				'ok':'Login' # 提交登录
			}
			url = 'https://internet-na.aptiv.com:6082/php/uid.php?vsys=2&rule=73'
			resp = requests.post(url,headers = headers,data = data)
			if resp.text.find('User Authenticated') != -1:
				print(format_time,'用户认证成功...')
				print()
			else:
				print(resp.status_code,resp.text)
		elif r.status_code == 200:
			print(format_time,'用户已认证')
			print()
			return
		else :
			print(format_time,r.status_code,r.text)
			return
	except Exception as e:
		print(format_time,"网络连接异常: ",e)
		print()
		return

User = 'wjl0n2'
Passwd = '123456'
login(User, Passwd)
schedule.every(5).seconds.do(login,User,Passwd) # 每隔 5 秒执行一次

while 1:
	schedule.run_pending()
	time.sleep(5) 
```

### 4. 配置开机启动脚本

``` shell
# 编辑 systemd service
$ sudo cat /etc/systemd/system/aptiv-network.service
[Unit]
Description=Aptiv Network Authentication
After=network.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/bin/python3 /home/ranger/bin/aptiv-network.py & # 使用绝对路径

[Install]
WantedBy=multi-user.target

# enable systemd service
$ sudo systemctl enable network.service
enabled

$ sudo systemctl is-enabled network.service
enable

$ sudo systemctl daemon-reload
$ sudo systemctl start network.service

$ sudo systemctl status network.service
● aptiv-network.service - Aptiv Network Authentication
     Loaded: loaded (/etc/systemd/system/aptiv-network.service; enabled; vendor preset: enabled)
     Active: active (running) since Thu 2021-05-20 15:15:26 CST; 22ms ago
   Main PID: 807325 (python3)
      Tasks: 1 (limit: 38099)
     Memory: 2.8M
     CGroup: /system.slice/aptiv-network.service
             └─807325 /usr/bin/python3 /home/ranger/bin/aptiv-network.py &

5月 20 15:15:26 mintos systemd[1]: Started Aptiv Network Authentication.

# 查看进程看是否启动成功
$ ps -aux | grep aptiv-network                      
root      807325  2.0  0.0  34868 21708 ?        Ss   15:15   0:00 /usr/bin/python3 /home/ranger/bin/aptiv-network.py &
```





参考：

https://blog.csdn.net/zhusongziye/article/details/91353222