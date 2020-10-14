---
title: AboutHexo
copyright: true
date: 2017-10-11 10:31:07
tags:
categories: Hexo
password:
---



卸载安装 hexo

```shell
安装
sudo npm install hexo-cli -g
sudo npm install hexo-deployer-git --save
sudo npm install hexo --save

卸载
sudo npm uninstall hexo-cli -g // 3.0.0 及之后版本
sudo npm uninstall hexo -g // 之前版本
```

<!--more-->

升级npm

```shell
sudo npm -g install npm@next
```



升级 node

```shell
sudo npm install -g n // n模块是专门用来管理node.js版本的
sudo n latest // 最新版本
sudo n stable // 最新稳定版
```



一键脚本

```shell
npm config set registry https://registry.npm.taobao.org
npm install hexo-cli -g
git clone https://git.oschina.net/neoFelhz/hexokit.git
rm install.sh
cd HexoKit
npm install
npm config set registry https://registry.npmjs.org/
hexo version
```



**hexo s 命令直接打印帮助文档**

hexo3中 server 模块已经独立出来需要单独安装。 `npm install hexo-server` 安装后再运行 `hexo server`，

``` shell
sudo npm install hexo-server
hexo server
```



**Cannot GET /**

``` shell
npm install hexo-server --save
sudo npm install hexo-server --save
sudo npm install hexo-deployer-git --save
sudo npm audit fix
sudo npm install

```



公司屏蔽外部 ssh 时如何部署

因为公司把外部 **ssh** 给屏蔽掉了，所以使用 `git clone xxx` 从 github 上下载 project 时需要使用 **HTTPS** 的链接，同理在使用 `hexo d` 的时候同样要把 *_config.yml* 中的 repo 地址改成 **HTTPS** ，在 `git clone https://xxx.com/xxx` 和 `hexo d` 的时候会弹出信息：

``` shell
Username for 'https://github.com': 
Password for 'https://rangerzhou@github.com':
```

输入 github 账号和密码后即可成功下载和部署博客。