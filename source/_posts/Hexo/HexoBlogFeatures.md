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

### 3. 添加音乐播放器

#### 3.1 方法一

[参考]( https://enfangzhong.github.io/2019/12/08/Hexo%E4%B8%AA%E4%BA%BA%E5%8D%9A%E5%AE%A2%E6%B7%BB%E5%8A%A0APlayer%E9%9F%B3%E4%B9%90%E6%92%AD%E6%94%BE%E5%99%A8%E5%8A%9F%E8%83%BD/)

##### 3.1.1 下载 APlayer 源码

``` shell
git clone https://github.com/DIYgod/APlayer.git
```

把 *dist* 文件夹复制到 *\themes\next\source* 目录中。

##### 3.1.2 编辑喜欢的音乐列表

在 *dist* 目录里，新建 *music.js* 文件，并把如下代码粘贴进去：

``` js
const ap = new APlayer({
    container: document.getElementById('aplayer'),
    fixed: true,
    autoplay: true,
    order: 'random', // 音频循环顺序, 可选值: 'list'列表循环, 'random'随机循环
    preload: 'auto', // 预加载，可选值: 'none', 'metadata', 'auto'
    theme: '#FADFA3', // 主题
    volume: 0.7, // 默认音量
    mutex: false, // 互斥，阻止多个播放器同时播放，当前播放器播放时暂停其他播放器
    listFolded: false, // 列表默认折叠
    //lrcType: 3, // 歌词传递方式
    audio: [{
        name: '麻雀',
        artist: '李荣浩',
        url: '/dist/MusicList/麻雀.mp3',
        cover: 'http://p1.music.126.net/c5NVKUIAUcyN4BQUDbGnEg==/109951163221157827.jpg?param=130y130',
    },
    {
        name: "平凡之路",
        artist: '朴树',
        url: 'http://www.ytmp3.cn/down/59211.mp3',
        cover: 'http://p1.music.126.net/W_5XiCv3rGS1-J7EXpHSCQ==/18885211718782327.jpg?param=130y130',
    },
    {
        name: '这些民谣 - 一次听个够',
        artist: '翁大涵',
        url: 'http://www.ytmp3.cn/down/60222.mp3',
        cover: 'http://p2.music.126.net/Wx5GNJEpay2JbfVUJc4Aew==/109951163094853876.jpg?param=130y130',
    },
    {
        name: '你的酒馆对我打了烊',
        artist: '陈雪凝',
        url: 'http://www.ytmp3.cn/down/59770.mp3',
        cover: 'http://p1.music.126.net/LiRR__0pJHSivqBHZzbMUw==/109951163816225567.jpg?param=130y130',
    },
    {
        name: 'Something Just Like This',
        artist: 'The Chainsmokers',
        url: 'http://www.ytmp3.cn/down/50463.mp3',
        cover: 'http://p2.music.126.net/ggnyubDdMxrhpqYvpZbhEQ==/3302932937412681.jpg?param=130y130',
    },
    {
        name: 'Good Time',
        artist: 'Owl City&Carly Rae Jepsen',
        url: 'http://www.ytmp3.cn/down/34148.mp3',
        cover: 'http://p1.music.126.net/c5NVKUIAUcyN4BQUDbGnEg==/109951163221157827.jpg?param=130y130',
    }]
});
```

可以使用网上链接，也可以使用本地音乐文件（比如麻雀.mp3）。

##### 3.1.3 在 next 主题下的 layout 中引入 APlayer 音乐播放器源码

在 *\themes\next\layout_layout.swig* 文件 *body* 标签体内中，里新增如下代码：

``` html
<body itemscope itemtype="http://schema.org/WebPage">

<!-- 加入APlayer音乐播放器 start-->
<link rel="stylesheet" href="/dist/APlayer.min.css">
<div id="aplayer"></div>
<script type="text/javascript" src="/dist/APlayer.min.js"></script>
<script type="text/javascript" src="/dist/music.js"></script>
<!-- 加入APlayer音乐播放器 end-->

  <div class="container{%- if theme.motion.enable %} use-motion{%- endif %}">
    <div class="headband"></div>
```

其实也可以添加到这个  */themes/next/layout/_partials/head/head.swig_* 中，添加位置：

``` html
{%- if theme.favicon.apple_touch_icon %}
  <link rel="apple-touch-icon" sizes="180x180" href="{{ url_for(theme.favicon.apple_touch_icon) }}">
  <!-- 加入APlayer音乐播放器 start-->
  <link rel="stylesheet" href="/dist/APlayer.min.css">
  <div id="aplayer"></div>
  <script type="text/javascript" src="/dist/APlayer.min.js"></script>
  <script type="text/javascript" src="/dist/music.js"></script>
  <!-- 加入APlayer音乐播放器 end-->
```

##### 3.1.4 配置 pjax 防止页面切换时音乐暂停

在 */themes/next/layout/_partials/head/head.swig_* 中 meta 标签下面添加如下代码：

``` html
<meta name="generator" content="Hexo {{ hexo_version }}">
<!-- pjax：防止跳转页面音乐暂停 -->
<script src="https://cdn.jsdelivr.net/npm/pjax@0.2.8/pjax.js"></script>
```

但是添加这行代码后会影响方法二，方法二歌单页面必须按 F5 刷新一下才显示播放器，蛋疼。。。

修改主题 _config.yml 启动 pjax

``` yml
pjax: true
```



##### 3.1.5 重新部署

``` shell
hexo clean;hexo g;hexo d
```

#### 3.2 方法二

##### 3.2.1 安装插件

``` shell
npm install --save hexo-tag-aplayer
```

##### 3.2.2 _config.yml 部署

根目录 *_config.yml* 文件添加如下：

``` yml
aplayer:
  meting: true       # MetingJS 支持
#  cdn: https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.js  # 引用 APlayer.js 外部 CDN 地址 (默认不开启)
#  style_cdn: https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.css
#  meting_cdn: https://cdn.jsdelivr.net/npm/meting/dist/Meting.min.js # 引用 Meting.js 外部 CDN 地址 (默认不开启)
```

##### 3.2.3 创建歌单页面

**新建页面**

``` shell
hexo new page playlist
```

这时候在 /source 文件夹下会生成一个 playlist 文件夹，修改 index.md：

``` markdown
{% meting "3796675695" "tencent" "playlist" "autoplay" "order:random" "mutex:false" "listmaxheight:340px" "preload:none" "theme:#228B22"%}
```

**配置歌单 menu**

修改主题 _config.yml 文件，menu 选项添加：

``` yml
playlist: /playlist/ || fa fa-music
```

图标选择：http://www.fontawesome.com.cn/faicons/

**汉化 menu**

修改 themes/next/languages/zh-CN.yml

``` yml
menu:
  home: 首页
  archives: 归档
  categories: 分类
  tags: 标签
  about: 关于
  playlist: 歌单
  search: 搜索
  schedule: 日程表
  sitemap: 站点地图
  commonweal: 公益 404
```

##### 3.2.4 配置 pjax 防止页面切换时音乐暂停

方法同 3.1.4，不过配置此选项后，点击博客 menu 中的歌单页面不显示播放器，必须刷新一下页面才显示；
