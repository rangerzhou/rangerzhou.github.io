---
title: Apache-Ignite 相关记录
copyright: true
date: 2020-04-01 14:11:07
tags:
categories: IGNITE
password:
---

> Apache-ignite 相关记录。

<!--more-->

### 配置 Ignite Web 控制台

https://www.cnblogs.com/liugh/p/7425818.html

a. 下载 gridgain-web-console-agent

https://console.gridgain.com/configuration/overview

![Down WebConsoleAgent](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/downloadWebConsoleAgent.png)

b. 解压 gridgain-web-console-agent-2020.02.00.zip

c. 编辑解压目录中的 default.properties，其中 tokens 可从[官网](https://console.gridgain.com/monitoring/dashboard)获得(Monitoring dashboard页面-点击 check 即可)

d. 把 ignite-rest-http 从$IGNITE_HOME/libs/optional 拷贝到 $IGNITE_HOME/libs 目录下

e. 启动ignite节点

f. 启动Web Agent

``` shell
$ ./IGNITE_HOME/gridgain-web-console-agent.sh 
[2020-03-05T16:51:21,014][INFO ][main][AgentLauncher] Starting Apache GridGain Web Console Agent...
[2020-03-05T16:51:21,136][INFO ][main][AgentLauncher] 
[2020-03-05T16:51:21,136][INFO ][main][AgentLauncher] Web Console Agent configuration :
[2020-03-05T16:51:21,237][INFO ][main][AgentLauncher] User's security tokens             : ********************************8204
[2020-03-05T16:51:21,237][INFO ][main][AgentLauncher] URI to Ignite node REST server     : http://localhost:8080
[2020-03-05T16:51:21,237][INFO ][main][AgentLauncher] URI to GridGain Web Console        : https://console.gridgain.com
[2020-03-05T16:51:21,237][INFO ][main][AgentLauncher] Path to properties file            : default.properties
[2020-03-05T16:51:21,237][INFO ][main][AgentLauncher] Path to JDBC drivers folder        : /home/ranger/opt/apache-ignite-2.8.0-bin/gridgain-web-console-agent-2020.02.00/jdbc-drivers
[2020-03-05T16:51:21,237][INFO ][main][AgentLauncher] Demo mode                          : enabled
[2020-03-05T16:51:21,237][INFO ][main][AgentLauncher] 
[2020-03-05T16:51:21,320][INFO ][main][WebSocketRouter] Starting Web Console Agent...
[2020-03-05T16:51:21,342][INFO ][Connect thread][WebSocketRouter] Connecting to server: wss://console.gridgain.com
[2020-03-05T16:51:24,098][INFO ][http-client-17][WebSocketRouter] Successfully completes handshake with server
[2020-03-05T16:51:24,277][INFO ][pool-2-thread-1][ClusterHandler] Connected to node [url=http://localhost:8080]
[2020-03-05T16:51:24,305][INFO ][pool-2-thread-1][ClustersWatcher] Connection successfully established to cluster with nodes: [B2454006]
[2020-03-05T16:55:26,601][INFO ][http-client-19][AgentClusterDemo] DEMO: Starting embedded nodes for demo...

```

### idea 中配置 IGNITE_HOME

Run - Edit Configurations - 选中 Application 下需要配置的项 - 右侧 Configuration 选项 - 配置 Environment variables - 添加环境变量即可。

![image-20200317160517354](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2020/ConfigIGNITE_HOME.png)

### IGNITE 工具使用

#### ignitevisorcmd.sh 脚本

位置：`$IGNITE_HOME/bin/ignitevisorcmd.sh`

可查看 node, cache, config 等详细信息，使用方法如下：

``` bash
$ $IGNITE_HOME/bin/ignitevisorcmd.sh
... ...
# 输入 open 加入网格
visor> open
Local configuration files:
+========================================================================================+
|  #  |                                                    Configuration File            |
+========================================================================================+
| 0   | config/default-config.xml                                                        |
| 1   | benchmarks/config/ignite-base-config.xml                                         |
| 2   | benchmarks/config/ignite-localhost-config.xml                                    |
| 3   | benchmarks/config/ignite-multicast-config.xml                                    |
... ...
+----------------------------------------------------------------------------------------+
# 选择配置文件，选择 0 即可
Choose configuration file number ('c' to cancel) [0]: 0
... ...
Some useful commands:
+--------------------------------------------+
| Type 'top'    | to see full topology.      |
| Type 'node'   | to see node statistics.    |
| Type 'cache'  | to see cache statistics.   |
| Type 'tasks'  | to see tasks statistics.   |
| Type 'config' | to see node configuration. |
+--------------------------------------------+

Type 'help' to get help.

+---------------------------------------------------------------------------------+
| Status               | Connected                                                |
| Ignite instance name | <default>                                                |
| Config path          | /home/ranger/opt/apache-ignite/config/default-config.xml |
| Uptime               | 00:00:00                                                 |
+---------------------------------------------------------------------------------+
visor> cache
```

**查看 node**

<img src="https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/Pictures/ignitevisorcmd_node.png" alt="node"  />

**查看 cache**

![cache](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/Pictures/ignitevisorcmd_cache.png)

上图中的 `personCache` 是在代码中创建的（使用 ignite 的 setIndexedTypes ），[例子在此](https://github.com/sunwu51/bigdatatutorial/blob/master/Persistence/Ignite2.md) ；

`SQL_PUBLIC_CITY` 是通过 SQL 语句建表生成的：

``` sql
CREATE TABLE City (id LONG PRIMARY KEY, name VARCHAR)
```

`cache_person` 也是通过 SQL 语句建表生成的：

``` sql
CREATE TABLE Person (id LONG PRIMARY KEY, name VARCHAR) WITH "CACHE_NAME = cache_person"
```

详细文档点击 [ignite create-table](https://www.ignite-service.cn/doc/sql/SQLReference.html#_2-3-create-table) 查看。

#### sqlline 工具

[使用教程](https://www.ignite-service.cn/doc/sql/ToolsAndAnalytics.html#_2-sqlline)

位置：`$IGNITE_HOME/bin/sqlline.sh`

ignite 支持完整的 SQL，通过 `sqlline.sh` 可以直接连接 ignite 数据库服务，使用方法如下：

``` bash
$ sqlline.sh
sqlline version 1.3.0
sqlline>
# 连接
sqlline> !connect jdbc:ignite:thin://localhost
Enter username for jdbc:ignite:thin://localhost:
Enter password for jdbc:ignite:thin://localhost:
0: jdbc:ignite:thin://localhost>
# 随后即可输入 SQL 命令了
0: jdbc:ignite:thin://localhost> !tables

```

**查看 tables**

`0: jdbc:ignite:thin://localhost> !tables`

![](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/Pictures/sqlline_!tables.png)

如上图所示，在代码中创建 Cache，`CacheConfiguration.setIndexedTypes(Integer.class, Person.class);` 参数中的 Person.class 的类名即为生成的 TABLE_NAME（即类名会被用作表名），Cache 名即为 TABLE_SCHEM。

**查询**

`0: jdbc:ignite:thin://localhost> select * from "personCache".PERSON;`

![select](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/Pictures/sqlline_select*.png)



### Ignite 使用注意事项

- [只有 `TRANSACTIONAL` 原子化模式中才支持锁](https://www.ignite-service.cn/doc/java/Key-ValueDataGrid.html#_9-锁)，分布式锁 Lock 不支持原子化模式 `ATOMIC`，[事务原子化模式]([https://www.ignite-service.cn/doc/java/Key-ValueDataGrid.html#_8-%E4%BA%8B%E5%8A%A1](https://www.ignite-service.cn/doc/java/Key-ValueDataGrid.html#_8-事务)) 有三种（`TRANSACTIONAL`、`TRANSACTIONAL_SNAPSHOT`、`ATOMIC`），但是如果使用 `TRANSACTIONAL_SNAPSHOT` 的话，会提示 Lock 不支持 Enable [MVCC](https://www.ignite-service.cn/doc/sql/Architecture.html#_7-1-概述) ，所以要使用 `TRANSACTIONAL` 模式。

### Ignite 相关异常

#### Ignite 代码启动 client 无法连接终端启动的 server

``` verilog
javax.cache.CacheException: Failed to start continuous query.
at org.apache.ignite.internal.processors.cache.IgniteCacheProxyImpl.query(IgniteCacheProxyImpl.java:820)
at org.apache.ignite.internal.processors.cache.GatewayProtectedCacheProxy.query(GatewayProtectedCacheProxy.java:412)
at TOFListener.main(TOFListener.java:29)
at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
at sun.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
at sun.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
...
at com.intellij.rt.execution.application.AppMainV2.main(AppMainV2.java:131)
Caused by: class org.apache.ignite.IgniteException: Failed to start continuous query.
Caused by: java.lang.ClassNotFoundException: TOFListener
```

这是因为没有启动对等类加载，而终端使用 `ignite.sh` 启动 server 节点（remote 节点），如果不加配置文件的话，会默认加载 *$IGNITE_HOME/config/default-config.xml* 启动，需要在 *default_config.xml* 中配置对等类加载：

``` xml
    <bean class="org.apache.ignite.configuration.IgniteConfiguration">

        <!-- Enable peer class loading. -->
        <property name="peerClassLoadingEnabled" value="true"/>

        <!-- Set deployment mode. -->
        <property name="deploymentMode" value="CONTINUOUS"/>

    </bean>
```

同时启动 client 节点（local 节点）的时候也需要配置对等类加载：

``` java
IgniteConfiguration cfg = new IgniteConfiguration();

cfg.setPeerClassLoadingEnabled(true);
cfg.setDeploymentMode(DeploymentMode.CONTINUOUS);

// Start a node.
Ignite ignite = Ignition.start(cfg);
```

**注意：** 因为 *default-config.xml* 中同时配置了 **deploymentMode** ，所以在启动 client 节点的时候同样要配置 **deploymentMode** （当然也可以都不配置），也就是说启动了对等类加载，各个节点的配置要相同，否则假如只有一端配置了对等类加载、 **deploymentMode** 、或者其他配置，就会报出如下 ERROR：

``` verilog
[2020-04-01 10:50:57,652][ERROR][main][IgniteKernal] Failed to start manager: GridManagerAdapter [enabled=true, name=o.a.i.i.managers.discovery.GridDiscoveryManager]
class org.apache.ignite.IgniteCheckedException: Remote node has deployment mode different from local [locId8=a19b2080, locMode=SHARED, rmtId8=570d02e2, rmtMode=CONTINUOUS, rmtAddrs=[192.168.53.55/0:0:0:0:0:0:0:1%lo, /127.0.0.1, /192.168.53.55], rmtNode=ClusterNode [id=570d02e2-0cd3-4b17-8a50-24c4eb0657bc, order=1, addr=[0:0:0:0:0:0:0:1%lo, 127.0.0.1, 192.168.53.55], daemon=false]]
	at org.apache.ignite.internal.managers.discovery.GridDiscoveryManager.checkAttributes(GridDiscoveryManager.java:1190)
	at org.apache.ignite.internal.managers.discovery.GridDiscoveryManager.start(GridDiscoveryManager.java:967)
	at org.apache.ignite.internal.IgniteKernal.startManager(IgniteKernal.java:1960)
	at org.apache.ignite.internal.IgniteKernal.start(IgniteKernal.java:1276)
	at org.apache.ignite.internal.IgnitionEx$IgniteNamedInstance.start0(IgnitionEx.java:2038)
	at org.apache.ignite.internal.IgnitionEx$IgniteNamedInstance.start(IgnitionEx.java:1703)
	at org.apache.ignite.internal.IgnitionEx.start0(IgnitionEx.java:1117)
	at org.apache.ignite.internal.IgnitionEx.start(IgnitionEx.java:637)
	at org.apache.ignite.internal.IgnitionEx.start(IgnitionEx.java:563)
	at org.apache.ignite.Ignition.start(Ignition.java:321)
	at DMSAdapterListener.main(DMSAdapterListener.java:71)
	at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
	at sun.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
	at sun.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
	at java.lang.reflect.Method.invoke(Method.java:498)
	at com.intellij.rt.execution.application.AppMainV2.main(AppMainV2.java:131)
```

#### ignite 配置 web-console 报错

``` verilog
gyp ERR! build error 
gyp ERR! stack Error: `make` failed with exit code: 2
gyp ERR! stack     at ChildProcess.onExit (/home/ranger/opt/apache-ignite-2.8.0-src/modules/web-console/frontend/node_modules/node-gyp/lib/build.js:262:23)
gyp ERR! stack     at ChildProcess.emit (events.js:210:5)
gyp ERR! stack     at Process.ChildProcess._handle.onexit (internal/child_process.js:272:12)
gyp ERR! System Linux 5.3.0-26-generic
gyp ERR! command "/usr/local/bin/node" "/home/ranger/opt/apache-ignite-2.8.0-src/modules/web-console/frontend/node_modules/node-gyp/bin/node-gyp.js" "rebuild" "--verbose" "--libsass_ext=" "--libsass_cflags=" "--libsass_ldflags=" "--libsass_library="
gyp ERR! cwd /home/ranger/opt/apache-ignite-2.8.0-src/modules/web-console/frontend/node_modules/node-sass
gyp ERR! node -v v12.14.0
gyp ERR! node-gyp -v v3.8.0
gyp ERR! not ok 
Build failed with error code: 1
npm WARN optional SKIPPING OPTIONAL DEPENDENCY: fsevents@1.2.7 (node_modules/fsevents):
npm WARN notsup SKIPPING OPTIONAL DEPENDENCY: Unsupported platform for fsevents@1.2.7: wanted {"os":"darwin","arch":"any"} (current: {"os":"linux","arch":"x64"})

npm ERR! code ELIFECYCLE
npm ERR! errno 1
npm ERR! node-sass@4.10.0 postinstall: `node scripts/build.js`
npm ERR! Exit status 1
npm ERR! 
npm ERR! Failed at the node-sass@4.10.0 postinstall script.
npm ERR! This is probably not a problem with npm. There is likely additional logging output above.

npm ERR! A complete log of this run can be found in:
npm ERR!     /home/ranger/.npm/_logs/2020-03-05T07_36_53_598Z-debug.log
```

网上搜索的解决方案：https://juejin.im/post/5d74db2ef265da03bd054217

我用以上方法没有解决，随后查看 [node-sass 版本](https://github.com/sass/node-sass/releases) ，得知 node-sass 不支持 node 12版本，升级 node-sass 版本解决：

``` shell
npm install node-sass@4.13.1
```

#### Ignite 启动异常

Ignition.start("/home/ranger/opt/apache-ignite/examples/config/example-ignite.xml") 异常

``` verilog
Mar 05, 2020 2:30:59 PM org.apache.ignite.logger.java.JavaLogger error
SEVERE: Failed to start manager: GridManagerAdapter [enabled=true, name=o.a.i.i.managers.discovery.GridDiscoveryManager]
class org.apache.ignite.IgniteCheckedException: Remote node has peer class loading enabled flag different from local [locId8=f1d0af56, locPeerClassLoading=true, rmtId8=bcef4f81, rmtPeerClassLoading=false, rmtAddrs=[dl1jqybg2.aptiv.com/0:0:0:0:0:0:0:1%lo, /127.0.0.1, /192.168.53.2], rmtNode=ClusterNode [id=bcef4f81-dc93-47fd-a13e-9276ad72953d, order=16, addr=[0:0:0:0:0:0:0:1%lo, 127.0.0.1, 192.168.53.2], daemon=false]]
	at org.apache.ignite.internal.managers.discovery.GridDiscoveryManager.checkAttribute
```

因为同server 已经启动了别的不同配置的node

#### Ignite 接入 ZMQ 报错

``` verilog
Exception in thread "pool-2-thread-1" java.lang.IllegalArgumentException
	at zmq.Sub.xsetsockopt(Sub.java:42)
	at zmq.SocketBase.setSocketOpt(SocketBase.java:222)
	at org.zeromq.ZMQ$Socket.setsockopt(ZMQ.java:427)
	at org.zeromq.ZMQ$Socket.subscribe(ZMQ.java:1005)
	at org.apache.ignite.stream.zeromq.IgniteZeroMqStreamer.lambda$start$0(IgniteZeroMqStreamer.java:103)
	at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1149)
	at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:624)
	at java.lang.Thread.run(Thread.java:748)
```

`new IgniteZerMqStreamer(int ioThreads, ZeroMqTypeSocket socketType, @NotNull String addr, byte[] topic) `中 topic 参数错误，参数不能为 null， 传入 ZMQ.SUBSCRIPTION_ALL 即可。

#### Ignite 持久化异常

``` shell
Caused by: class org.apache.ignite.spi.IgniteSpiException: Joining persistence node to in-memory cluster couldn't be allowed due to baseline auto-adjust is enabled and timeout equal to 0
	at org.apache.ignite.spi.discovery.tcp.TcpDiscoverySpi.checkFailedError(TcpDiscoverySpi.java:1997)
	at org.apache.ignite.spi.discovery.tcp.ServerImpl.joinTopology(ServerImpl.java:1116)
	at org.apache.ignite.spi.discovery.tcp.ServerImpl.spiStart(ServerImpl.java:427)
	at org.apache.ignite.spi.discovery.tcp.TcpDiscoverySpi.spiStart(TcpDiscoverySpi.java:2099)
	at org.apache.ignite.internal.managers.GridManagerAdapter.startSpi(GridManagerAdapter.java:297)
	... 15 more
```



[基线拓扑](https://www.ignite-service.cn/doc/java/Persistence.html#_5-基线拓扑)

### 文档

文档：https://www.ignite-service.cn/doc/java/

https://www.ignite-service.cn/doc/sql/Architecture.html#_7-1-概述