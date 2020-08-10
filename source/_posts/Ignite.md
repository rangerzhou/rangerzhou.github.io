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

### IGNITE 使用注意事项

#### Ignite 日志

[日志配置教程](https://www.ignite-service.cn/doc/java/#_9-日志)

Ignite 默认启动于 *静默模式* ，会阻止 `INFO` 和 `DEBUG` 日志的输出。可在代码中关闭 *静默模式* ：

``` java
System.setProperty("IGNITE_QUIET", "false");
```

关闭后终端会打印出更详细的 log。

#### 数据并置与关联查询



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

# sqlline.sh --verbose=true -u jdbc:ignite:thin://localhost 这种也可以
$ sqlline.sh --verbose=true -u jdbc:ignite:thin://localhost
issuing: !connect jdbc:ignite:thin://localhost '' '' org.apache.ignite.IgniteJdbcThinDriver
Connecting to jdbc:ignite:thin://localhost
Connected to: Apache Ignite (version 2.8.1#20200521-sha1:86422096)
Driver: Apache Ignite Thin JDBC Driver (version 2.8.1#20200521-sha1:86422096)
Autocommit status: true
Transaction isolation: TRANSACTION_REPEATABLE_READ
sqlline version 1.3.0
0: jdbc:ignite:thin://localhost>

```

**查看 tables**

`0: jdbc:ignite:thin://localhost> !tables`

![](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/Pictures/sqlline_!tables.png)

如上图所示，在代码中创建 Cache，`CacheConfiguration.setIndexedTypes(Integer.class, Person.class);` 参数中的 Person.class 的类名即为生成的 TABLE_NAME（即类名会被用作表名），Cache 名即为 TABLE_SCHEM。

**查询**

`0: jdbc:ignite:thin://localhost> select * from "personCache".PERSON;`

![select](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/Pictures/sqlline_select*.png)



### Ignite持久化

#### 持久化

[点击查看教程](https://www.ignite-service.cn/doc/java/Persistence.html#_1-ignite持久化) 

首先持久化只能在 Server 节点，因为 Client 节点不保存数据；

持久化后，数据保存在 `{WORK_DIR}/db/{nodeId}` ，默认为 `IGNITE_HOME/work/db` 下：

| 子目录名                             | 描述                           |
| ------------------------------------ | ------------------------------ |
| `{WORK_DIR}/db/{nodeId}`             | 该目录中包括了缓存的数据和索引 |
| `{WORK_DIR}/db/wal/{nodeId}`         | 该目录中包括了WAL文件          |
| `{WORK_DIR}/db/wal/archive/{nodeId}` | 该目录中包括了WAL存档文件      |

举例：

如果持久化，那么数据就会保存，比如在 Client 节点做了某些操作（新建 Cache，即创建了表，表中填充了数据），那么全部节点断开后，再启动一个持久化的 Server 时，SQL 就能直接查询之前 Client 节点操作的数据；

如果不持久化，则 SQL 无法查询之前 Client 节点操作的数据；

``` java
IgniteConfiguration igniteCfg = new IgniteConfiguration();
igniteCfg.setConsistentId("DMSServerNode"); //Set Consistent ID

// 持久化
DataStorageConfiguration storageCfg = new DataStorageConfiguration();
storageCfg.getDefaultDataRegionConfiguration().setPersistenceEnabled(true);
igniteCfg.setDataStorageConfiguration(storageCfg);

Ignite ignite = Ignition.start(igniteCfg);
```

#### 持久化部分 Cache 示例

[点击查看教程](https://www.ignite-service.cn/doc/java/DurableMemory.html#_3-2-内存区) 

**Server 端**

配置一个 4GB 的内存区并且开启持久化

``` java
IgniteConfiguration igniteCfg = new IgniteConfiguration();

// Ignite Persistence
DataStorageConfiguration storageCfg = new DataStorageConfiguration();
// 创建数据区
DataRegionConfiguration regionCfg = new DataRegionConfiguration();
regionCfg.setName("TableCache_Region"); // 数据区名称
regionCfg.setInitialSize(100L * 1024 * 1024); // 设置初始化 RAM 大小
regionCfg.setMaxSize(4L * 1024 * 1024 * 1024); // 设置最大 RAM 大小
regionCfg.setPersistenceEnabled(true); // 开启持久化
storageCfg.setDataRegionConfigurations(regionCfg); // 设置数据区配置
igniteCfg.setDataStorageConfiguration(storageCfg); // 应用新的配置

Ignite ignite = Ignition.start(igniteCfg);
```

**Client 端**

用 Server 端配置好的区域，使得 Ignite 缓存将数据存储于其中

``` java
IgniteConfiguration igniteCfg = new IgniteConfiguration();

CacheConfiguration<Double, DMSTable> dmsTableCacheCfg = new CacheConfiguration<>();
dmsTableCacheCfg.setName("DMSTableCache");
dmsTableCacheCfg.setIndexedTypes(Double.class, DMSTable.class);
// 把 Cache 绑定到 Server 端定义好的区域中
dmsTableCacheCfg.setDataRegionName("TableCache_Region");

CacheConfiguration<Double, MasterTable> masterTableCacheCfg = new CacheConfiguration<>();
masterTableCacheCfg.setName("MasterTableCache");
masterTableCacheCfg.setIndexedTypes(Double.class, MasterTable.class);
// 把 Cache 绑定到 Server 端定义好的区域中
masterTableCacheCfg.setDataRegionName("TableCache_Region");

igniteCfg.setCacheConfiguration(dmsTableCacheCfg, masterTableCacheCfg);
igniteCfg.setClientMode(true);
Ignite ignite = Ignition.start(igniteCfg);
```

用这个配置启动 Ignite 集群后，固化内存会分配一个初始大小为 100MB 的内存区，然后它可以增长到 4GB，这个内存区会存储如上两个 cache 的所有数据，因为我们在 Server 端开启了持久化，所以数据的超集会一直存储于磁盘上，确保即使内存空间不足也不会出现数据丢失的情况。

如果**禁用**了持久化并且所有的内存使用量超过了4GB，那么会抛出内存溢出异常，要避免这个问题，可以采用如下的办法来解决：

- 开启Ignite的持久化存储；
- 启用一个可用的退出算法，注意，只有开启Ignite持久化存储时退出功能才会默认打开，否则这个功能是禁用的；
- 增加内存区的最大值。



#### 配置基线拓扑

[点击查看教程](https://www.ignite-service.cn/doc/java/Persistence.html#_5-基线拓扑)

如果启用了原生持久化，Ignite引入了一个 **基线拓扑** 的概念，它表示集群中将数据持久化到磁盘的一组服务端节点。基线拓扑是一组Ignite服务端节点，目的是同时在内存以及原生持久化中存储数据。

基线拓扑的目的是：

- 如果节点重启，避免不必要的数据再平衡。比如，每个节点重启都会触发两个再平衡事件，一个是节点停止，一个是节点重新加入集群，这会导致集群资源的无效利用；
- 集群重启后，如果基线拓扑中的所有节点都已经加入，那么集群会被自动激活。

``` java
ignite.cluster().active(true); // 激活集群

// 手动配置基线拓扑
Collection<ClusterNode> nodes = ignite.cluster().forServers().nodes();
ignite.cluster().setBaselineTopology(nodes); // 将所有服务端节点配置为基线拓扑
```

注意：手动配置基线拓扑的时候，必须禁用 baseline 的 auto-adjust: 

``` java
ignite.cluster().baselineAutoAdjustEnabled(false);
```

上面持久化操作中，持久化后通过`ignite.cluster().isBaselineAutoAdjustEnabled()` 检查 `auto-adjust` 为 `false` ，此时就不再需要再用 `ignite.cluster().baselineAutoAdjustEnabled(false);` 禁用了。

**注意：** 将所有服务节点配置为基线拓扑，

#### 禁用 Auto-just

持久化时遇到异常：

``` shell
Caused by: class org.apache.ignite.spi.IgniteSpiException: Joining persistence node to in-memory cluster couldn't be allowed due to baseline auto-adjust is enabled and timeout equal to 0
    at org.apache.ignite.spi.discovery.tcp.TcpDiscoverySpi.checkFailedError(TcpDiscoverySpi.java:1997)
    at org.apache.ignite.spi.discovery.tcp.ServerImpl.joinTopology(ServerImpl.java:1116)
    at org.apache.ignite.spi.discovery.tcp.ServerImpl.spiStart(ServerImpl.java:427)
    at org.apache.ignite.spi.discovery.tcp.TcpDiscoverySpi.spiStart(TcpDiscoverySpi.java:2099)
    at org.apache.ignite.internal.managers.GridManagerAdapter.startSpi(GridManagerAdapter.java:297)
    ... 15 more
```

[解决方案](https://stackoverflow.com/questions/61266725/how-to-disable-ignite-baseline-auto-just/61268552#61268552)：

- 启动第一个节点后，调用 `ignite.cluster().baselineAutoAdjustEnabled(false)` 即可，随后可用 `ignite.cluster().isBaselineAutoAdjustEnabled()` 检查结果。

- 也可使用 `IGNITE_HOME/bin/control.(sh|bat) --baseline auto_adjust [disable|enable] [timeout <timeoutMillis>] [--yes]` 禁用，但是我用这个方法失败，不知为何：

  ``` shell
  $ ./control.sh --baseline auto_adjust disable
  Warning: the command will perform changes in baseline.
  Press 'y' to continue . . . y
  Control utility [ver. 2.8.0#20200226-sha1:341b01df]
  2020 Copyright(C) Apache Software Foundation
  User: ranger
  Time: 2020-04-20T10:07:09.300
  Command [BASELINE] started
  Arguments: --baseline auto_adjust disable
  --------------------------------------------------------------------------------
  Failed to execute baseline command='auto_adjust'
  Latest topology update failed.
  Connection to cluster failed. Latest topology update failed.
  Command [BASELINE] finished with code: 2
  Control utility has completed execution at: 2020-04-20T10:07:15.597
  Execution time: 6297 ms
  ```



**2020年5月27日更新：** 如果需要让集群自动调整基线拓扑，

- 只有当集群处于激活状态时，基线拓扑才会自动调整
- 此功能默认是禁用的，可以使用控制脚本开启该功能，还可以通过编程方式启用该功能
- 必须配置自动调整超时时间

``` java
ignite.cluster().baselineAutoAdjustEnabled(true);
ignite.cluster().baselineAutoAdjustTimeout(30000);
```



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