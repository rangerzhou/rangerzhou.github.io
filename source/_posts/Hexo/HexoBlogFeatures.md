---
title: Hexo Features
date: 2019-04-30 08:51:03
tags:
categories: Hexo
copyright: true
---

> Hexo Blog 各种配置及定制化，之前做的很多定制化经常忘记，特写此文记录。

<!--more-->

___

<center><iframe frameborder="no" border="0" marginwidth="0" marginheight="0" width=500 height=86 src="http://music.163.com/outchain/player?type=2&id=29722263&auto=0&height=66"></iframe></center>

### 1. 添加评论系统

Next 主题支持多种评论系统：

- [Disqus](https://disqus.com/)：欧美 UI 风格，支持 Tweet、Facebook 等国外社交软件的三方登陆和一键分享。
- [Gitalk](https://gitalk.github.io/)：必须用 github 账号登陆才能评论，支持 Markdown 语法，与 github issues 页面风格一致。
- [Livere](https://www.livere.com/)：韩国的来必力，支持插入图片和 GIF，支持国内外多种社交媒体的三方登陆。
- [Valine](https://valine.js.org/)：支持匿名评论，支持 Markdown 语法，界面简洁美观。
- [畅言](http://changyan.kuaizhan.com/)：国产评论系统，可区分热评和最新评论，论坛贴吧风。

并且 Next 主题允许同时加载多种评论系统，我选择了 Disqus、Gitalk 和 Livere 。

#### 1.1 DISQUS

首页点击 `GET STARTED`

![GET STARTED](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/disqus_01.png)



点击 `I want to install Disqus on my site`

![install](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/disqus_02.png)

输入 `Website Name` ，这个名字会成为你的 `shortname` ，点击 `Create Site`

![CreateNewSite](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/disqus_03.png)

直接点击 `Install Disqus` ，选择最下面

![Install Disqus](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/disqus_04.png)

点击 `Configure`

![Configure](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/disqus_05.png)

此处的 `Website Name` 可以和上面不一样，`shortname` 已经生成了

![Configure Disqus](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/disqus_06.png)

可以点击左侧 `General` 查看 `shortname`

![General](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/disqus_07.png)

修改 next 主题配置文件 _config.yml

``` yaml
# Multiple Comment System Support
comments:
  # Available values: tabs | buttons
  style: tabs
  # Choose a comment system to be displayed by default.
  # Available values: changyan | disqus | disqusjs | gitalk | livere | valine
  active: disqus
  # Setting `true` means remembering the comment system selected by the visitor.
  storage: true
  # Lazyload all comment systems.
  lazyload: true
  # Modify texts or order for any navs, here are some examples.
  nav:
    #disqus:
    #  text: Load Disqus
    #  order: -1
    #gitalk:
    #  order: -2

# Disqus
disqus:
  enable: true
  shortname: yourshortname
  count: true
  #post_meta_order: 0
```

重新部署博客即可显示 Disqus 评论系统。

#### 1.2 Gitalk

创建 OAuth Apps：https://github.com/settings/developers

![Gitalk](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/gitalk.png)

注册后会生成 `Client ID` 和 `Client Secret` .

修改 next 主题配置文件 _config.yml

``` yaml
# Gitalk
# For more information: https://gitalk.github.io, https://github.com/gitalk/gitalk
gitalk:
  enable: true
  github_id: rangerzhou
  repo: rangerzhou.github.io
  client_id: xxx
  client_secret: xxx
  admin_user: rangerzhou
  distraction_free_mode: true # Facebook-like distraction free mode
  # Gitalk's display language depends on user's browser or system environment
  # If you want everyone visiting your site to see a uniform language, you can set a force language value
  # Available values: en | es-ES | fr | ru | zh-CN | zh-TW
  language: zh-CN
```

重新部署博客即可显示 Gitalk 评论系统。

#### 1.3 Livere

登录注册后，点击顶部 `安装`，安装完成后进入管理页面，点击左侧 [代码管理](https://www.livere.com/insight/myCode) ，复制 `data-uid` 的值。

![Livere](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/livere.png)

修改 next主题配置文件 _config.yml，输入刚才复制的 `data-uid` 即可。

``` yaml
# LiveRe comments system
# You can get your uid from https://livere.com/insight/myCode (General web site)
livere_uid: data-uid-value
```

重新部署博客即可显示 Livere 评论系统。



### 2. 添加页面加载进度条

新建 `source/_data/head.swig` ，添加如下 2 行：

``` yaml
<script src="//cdn.bootcss.com/pace/1.0.2/pace.min.js"></script>
<link href="//cdn.bootcss.com/pace/1.0.2/themes/pink/pace-theme-flash.css" rel="stylesheet">
```

