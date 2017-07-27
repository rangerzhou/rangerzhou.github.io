---
title: Hexo博客注意事项
date: 2017-07-27 10:51:03
tags:
categories: Others
copyright: true
---

#### 1. 解决fs.SyncWriteStream报错问题

在执行hexo命令的时候，总会显示如下报错：

``` powershell
(node:7048) [DEP0061] DeprecationWarning: fs.SyncWriteStream is deprecated.
```

从报错信息来看是因为fs.SyncWriteStream is deprecated，node.js从8.0开始已经弃用了fs.SyncWriteStream方法，所以是因为我们node_modules中某个插件调用了这个方法，通过查看Hexo作者GitHub对应的项目，在issue中看到有人提到[这个问题](https://github.com/hexojs/hexo/issues/2598)，在hexo项目中其中有一个hexo-fs的插件调用了这个方法，所以需要更新hexo-fs插件，更新方法如下：

``` powershell
npm install hexo-fs --save
```

更新插件后问题解决。

但是不知道怎么回事，后面又出现了这个报错，而且更新插件也不管用了，强迫症忍不了啊，网上查了很久都找不到解决方法，终于自食其力，hexo命令有个--debug参数，我们在运行hexo命令的时候添加上这个参数，就能知道在哪里报的错误，如此就能定位问题所在，例如：

``` powershell
$ hexo clean --debug                                                                    
02:35:27.359 DEBUG Hexo version: 3.3.8                                                  
02:35:27.362 DEBUG Working directory: E:\github\blog\                                   
02:35:27.502 DEBUG Config loaded: E:\github\blog\_config.yml                            
02:35:27.531 DEBUG Plugin loaded: hexo-generator-archive                                
02:35:27.534 DEBUG Plugin loaded: hexo-generator-category                               
02:35:27.542 DEBUG Plugin loaded: hexo-generator-feed                                   
02:35:27.550 DEBUG Plugin loaded: hexo-generator-baidu-sitemap                          
02:35:27.554 DEBUG Plugin loaded: hexo-generator-index                                  
02:35:27.582 DEBUG Plugin loaded: hexo-deployer-git                                     
(node:5760) [DEP0061] DeprecationWarning: fs.SyncWriteStream is deprecated.             
02:35:27.593 DEBUG Plugin loaded: hexo-generator-searchdb                               
02:35:27.597 DEBUG Plugin loaded: hexo-generator-sitemap                                
02:35:27.603 DEBUG Plugin loaded: hexo-fs                                               
02:35:27.608 DEBUG Plugin loaded: hexo-renderer-ejs                                     
02:35:27.616 DEBUG Plugin loaded: hexo-renderer-marked                                  
02:35:27.697 DEBUG Plugin loaded: hexo-renderer-less                                    
02:35:27.700 DEBUG Plugin loaded: hexo-renderer-stylus                                  
02:35:27.775 DEBUG Plugin loaded: hexo-wordcount                                        
02:35:27.878 DEBUG Plugin loaded: hexo-server                                           
02:35:27.883 DEBUG Script loaded: themes\next\scripts\merge-configs.js                  
02:35:27.887 DEBUG Script loaded: themes\next\scripts\merge.js                          
02:35:27.890 DEBUG Plugin loaded: hexo-generator-tag                                    
02:35:27.891 DEBUG Script loaded: themes\next\scripts\tags\center-quote.js              
02:35:27.892 DEBUG Script loaded: themes\next\scripts\tags\button.js                    
02:35:27.893 DEBUG Script loaded: themes\next\scripts\tags\full-image.js                
02:35:27.895 DEBUG Script loaded: themes\next\scripts\tags\group-pictures.js            
02:35:28.260 DEBUG Plugin loaded: hexo-renderer-jade                                    
02:35:28.264 DEBUG Script loaded: themes\next\scripts\tags\exturl.js                    
02:35:28.265 DEBUG Script loaded: themes\next\scripts\tags\lazy-image.js                
02:35:28.266 DEBUG Script loaded: themes\next\scripts\tags\note.js                      
02:35:28.268 INFO  Deleted database.                                                    
02:35:28.271 DEBUG Database saved                                                       
```

可以看到我所在报错的位置是hexo-deployer-git，于是在hexo-deployer-git中搜索：

``` powershell
$ grep -irn "SyncWriteStream" .\node_modules\hexo-deployer-git\
.\hexo-deployer-git\/node_modules/hexo-fs/lib/fs.js:718:exports.SyncWriteStream = fs.SyncWriteStream;
```

可以看到是在.\hexo-deployer-git\/node_modules/hexo-fs/lib/fs.js的第718行用到的，进去后把这一行注释掉问题就解决了，但是为什么会在hexo-deployer-git中有个node_modules，而且在其中还有个hexo-fs呢，因为在根目录node_modules中也有个hexo-fs目录，进去[hexo-deployer-git官方Github网址](https://github.com/hexojs/hexo-deployer-git)查看是没有node_modules目录的，但是通过npm命令npm install hexo-deployer-git --save安装的hexo-deployer-git是有的，所以应该是npm源没有更新？

总之是解决了这个强迫症难以忍受的问题，通过--debug参数定位问题。