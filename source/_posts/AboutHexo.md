卸载安装 hexo

``` shell
安装
sudo npm install hexo-cli -g
sudo npm install hexo-deployer-git --save

卸载
sudo npm uninstall hexo-cli -g // 3.0.0 及之后版本
sudo npm uninstall hexo -g // 之前版本
```



升级npm

``` shell
sudo npm -g install npm@next
```



升级 node

``` shell
sudo npm install -g n // n模块是专门用来管理node.js版本的
sudo n latest // 最新版本
sudo n stable // 最新稳定版
```



一键脚本

``` shell
npm config set registry https://registry.npm.taobao.org
npm install hexo-cli -g
git clone https://git.oschina.net/neoFelhz/hexokit.git
rm install.sh
cd HexoKit
npm install
npm config set registry https://registry.npmjs.org/
hexo version
```

