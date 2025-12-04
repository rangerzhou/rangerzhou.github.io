---
title: Android - 开机动画
date: 2023-06-29 23:01:21
tags:
categories: Android
copyright: true
password:
---

> Android 开机动画介绍。

<!--more-->

源码路径

| Module         | Path                                      |
| -------------- | ----------------------------------------- |
| surfaceflinger | frameworks/native/services/surfaceflinger |
| bootanimation  | frameworks/base/cmds/bootanimation        |
| init           | system/core/init                          |



# 1 SurfaceFlinger 启动

## 1.1 根据 rc 启动 SF

``` shell
# frameworks/native/services/surfaceflinger/surfaceflinger.rc
service surfaceflinger /system/bin/surfaceflinger
    class core animation
    user system
    group graphics drmrpc readproc
    capabilities SYS_NICE
    onrestart restart --only-if-running zygote
    task_profiles HighPerformance

```

`/system/bin/surfaceflinger` 表示可执行文件路径，对应源码就是 `frameworks/native/services/surfaceflinger/`，对应的 `main()` 位于源码路径下的 `main_surfaceflinger.cpp` 中：

``` cpp
// SurfaceFlinger.cpp
int main(int, char**) {
    // 限制 Binder 线程池最多 4 个线程
    ProcessState::self()->setThreadPoolMaxThreadCount(4);

    // 启动 Binder 线程池用于 IPC 通信
    sp<ProcessState> ps(ProcessState::self());
    ps->startThreadPool();

    // 创建 SurfaceFlinger 对象
    sp<SurfaceFlinger> flinger = surfaceflinger::createSurfaceFlinger();
    // 初始化 SF 对象
    flinger->init();

    // 向 Service Manager 注册 SurfaceFlinger
    sp<IServiceManager> sm(defaultServiceManager());
    sm->addService(String16(SurfaceFlinger::getServiceName()), flinger, false,
                   IServiceManager::DUMP_FLAG_PRIORITY_CRITICAL | IServiceManager::DUMP_FLAG_PROTO);

    // 向 Service Manager 注册 SurfaceComposerAIDL（AIDL 接口）
    sp<SurfaceComposerAIDL> composerAIDL = sp<SurfaceComposerAIDL>::make(flinger);
    if (FlagManager::getInstance().misc1()) {
        composerAIDL->setMinSchedulerPolicy(SCHED_FIFO, newPriority);
    }
    sm->addService(String16("SurfaceFlingerAIDL"), composerAIDL, false,
                   IServiceManager::DUMP_FLAG_PRIORITY_CRITICAL | IServiceManager::DUMP_FLAG_PROTO);
    // 启动 DisplayService
    startDisplayService(); // dependency on SF getting registered above

    // 进入事件循环，阻塞主线程运行 SurfaceFlinger
    flinger->run();

    return 0;
}
```

主要工作：

- 限制 Binder 线程池最多 4 个线程，启动 Binder 线程池
- 创建和初始化 SurfaceFlinger
- 向 sm 注册 SurfaceFlinger 和 SurfaceComposerAIDL
- 启动 DisplayService
- 进入事件循环，阻塞主线程运行 SurfaceFlinger



``` cpp
// SurfaceFlinger.cpp
void SurfaceFlinger::init() FTL_FAKE_GUARD(kMainThreadContext) {
    // Avoid blocking the main thread on `init` to set properties.
    mInitBootPropsFuture.callOnce([this] {
        return std::async(std::launch::async, &SurfaceFlinger::initBootProperties, this);
    });
```

init() 为避免在主线程阻塞，把 initBootProperties 用 std::async 在后台启动一次（property_set 可能依赖 property_service，可能慢，第一次调用时会创建并保存一个 future），以后再次 callOnce 不会重复启动。

``` cpp
// SurfaceFlinger.cpp
void SurfaceFlinger::initBootProperties() {
    property_set("service.sf.present_timestamp", mHasReliablePresentFences ? "1" : "0");

    if (base::GetBoolProperty("debug.sf.boot_animation"s, true)) {
        // 重置和启动（需要时）开机动画
        property_set("service.bootanim.exit", "0");
        property_set("service.bootanim.progress", "0");
        property_set("ctl.start", "bootanim");
    }
}
```

这里的 `debug.sf.boot_animation` 属性表示是否启用开机动画，默认为 true，即默认启用开机动画，然后设置 `ctl.start` 为 `bootanim`

## 1.2 init 监听属性变化

### 1.2.1 启动属性服务



``` cpp
// init.cpp
StartPropertyService(&property_fd);
```

在 `init.cpp` 中的 `SecondStageMain()` 中启动了属性服务；

``` cpp
// property_service.cpp
void StartPropertyService(int* epoll_socket) {
    InitPropertySet("ro.property_service.version", "2");

    int sockets[2];
    if (socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sockets) != 0) {
        PLOG(FATAL) << "Failed to socketpair() between property_service and init";
    }
    *epoll_socket = from_init_socket = sockets[0];
    init_socket = sockets[1];
    StartSendingMessages();

    StartThread(PROP_SERVICE_FOR_SYSTEM_NAME, 0660, AID_SYSTEM, property_service_for_system_thread,
                true);
    StartThread(PROP_SERVICE_NAME, 0666, 0, property_service_thread, false);

    auto async_persist_writes =
            android::base::GetBoolProperty("ro.property_service.async_persist_writes", false);

    if (async_persist_writes) {
        persist_write_thread = std::make_unique<PersistWriteThread>();
    }
}
```

创建了属性服务和 init 通信的 socket，通过 StartThread 启动了两个线程：

- **property_service_for_system_thread** 对应的 socket 名称是 PROP_SERVICE_FOR_SYSTEM_NAME，CreateSocket 用 mode=0660，gid=AID_SYSTEM → 只有 owner 或 group=AID_SYSTEM 的进程能连接（系统组件专用）
- **property_service_thread** 对应 PROP_SERVICE_NAME，CreateSocket 用 mode=0666，gid=0 → 对所有进程开放（普通应用/服务可连接，受 SELinux/prop policy 进一步限制）
- **property_service_for_system_thread** 传入 listen_init = true → 该线程在 epoll 中额外注册 init_socket（来自 init 的内部 socket），会处理 HandleInitSocket 的事件（比如 init 发来的加载持久化属性等消息）。
- **property_service_thread** 传入 false，不注册 init_socket。

``` cpp
// property_service.cpp
void StartThread(const char* name, int mode, int gid, std::thread& t, bool listen_init) {
    int fd = -1;
    if (auto result = CreateSocket(name, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK,
                                   /*passcred=*/false, /*should_listen=*/false, mode, /*uid=*/0,
                                   /*gid=*/gid, /*socketcon=*/{});
        result.ok()) {
        fd = *result;
    } ...

    listen(fd, 8);

    auto new_thread = std::thread(PropertyServiceThread, fd, listen_init);
    t.swap(new_thread);
}
```

通过 CreateSocket 创建一个 Unit domain socket（在 /dev/**properties** 下的某个名字，如 PROP_SERVICE_NAME / PROP_SERVICE_FOR_SYSTEM_NAME），监听 fd，使用 std::thread 创建并启动一个线程运行 `PropertyServiceThread`，

``` cpp
// property_service.cpp
static void PropertyServiceThread(int fd, bool listen_init) {
    Epoll epoll;
    if (auto result = epoll.Open(); !result.ok()) {
        LOG(FATAL) << result.error();
    }

    if (auto result = epoll.RegisterHandler(fd, std::bind(handle_property_set_fd, fd));
        !result.ok()) {
        LOG(FATAL) << result.error();
    }

    if (listen_init) {
        if (auto result = epoll.RegisterHandler(init_socket, HandleInitSocket); !result.ok()) {
            LOG(FATAL) << result.error();
        }
    }

    while (true) {
        auto epoll_result = epoll.Wait(std::nullopt);
        if (!epoll_result.ok()) {
            LOG(ERROR) << epoll_result.error();
        }
    }
}
```

用 Epoll 打开并把上面那个 listening fd 注册到 epoll，handler 绑定为 std::bind(handle_property_set_fd, fd)，epoll.Wait 阻塞等待事件，事件发生时调用 handle_property_set_fd（**epoll 监视的是 listening socket 的可读（有新连接）事件，不是直接监听单个属性“值变动”**）；

``` cpp
// property_service.cpp
static void handle_property_set_fd(int fd) {
    static constexpr uint32_t kDefaultSocketTimeout = 2000; /* ms */

    int s = accept4(fd, nullptr, nullptr, SOCK_CLOEXEC);
    SocketConnection socket(s, cr);
    uint32_t timeout_ms = kDefaultSocketTimeout;

    uint32_t cmd = 0;
    if (!socket.RecvUint32(&cmd, &timeout_ms)) {
        PLOG(ERROR) << "sys_prop: error while reading command from the socket";
        socket.SendUint32(PROP_ERROR_READ_CMD);
        return;
    }

    switch (cmd) {
    case PROP_MSG_SETPROP: {...
    case PROP_MSG_SETPROP2: {
        std::string name;
        std::string value;
        ...
        // HandlePropertySet takes ownership of the socket if the set is handled asynchronously.
        const auto& cr = socket.cred();
        std::string error;
        auto result = HandlePropertySet(name, value, source_context, cr, &socket, &error);
        ...
```

- accept4() 接受客户端连接（SurfaceFlinger 或任意进程通过对应 socket 连接）
- 从连接上读命令（PROP_MSG_SETPROP / PROP_MSG_SETPROP2 等）并解析 name/value
- 做 SELinux/权限检查，然后调用 HandlePropertySet / PropertySet 处理属性

``` cpp
// property_service.cpp
std::optional<uint32_t> HandlePropertySet(const std::string& name, const std::string& value,
                                          const std::string& source_context, const ucred& cr,
                                          SocketConnection* socket, std::string* error) {
    if (auto ret = CheckPermissions(name, value, source_context, cr, error); ret != PROP_SUCCESS) {
        return {ret};
    }

    if (StartsWith(name, "ctl.")) {
        return {SendControlMessage(name.c_str() + 4, value, cr.pid, socket, error)};
    }
```

对于 ctl.*（比如 ctl.start=bootanim），HandlePropertySet 会走 SendControlMessage -> QueueControlMessage，把“start bootanim”的控制消息排入 init 的控制队列，由 init 主逻辑实际执行启动/停止服务的动作。

``` cpp
// property_service.cpp
static uint32_t SendControlMessage(const std::string& msg, const std::string& name, pid_t pid,
                                   SocketConnection* socket, std::string* error) {
    ...
    int fd = -1;

    bool queue_success = QueueControlMessage(msg, name, pid, fd);
    ...
    return PROP_SUCCESS;
}
```



``` cpp
// init.cpp
bool QueueControlMessage(const std::string& message, const std::string& name, pid_t pid, int fd) {
    auto lock = std::lock_guard{pending_control_messages_lock};
    if (pending_control_messages.size() > 100) {
        LOG(ERROR) << "Too many pending control messages, dropped '" << message << "' for '" << name
                   << "' from pid: " << pid;
        return false;
    }
    pending_control_messages.push({message, name, pid, fd});
    WakeMainInitThread();
    return true;
}
```



## 1.3 时序图

``` mermaid
sequenceDiagram
init ->> property_service:StartPropertyService()
property_service ->> property_service:StartThread()
property_service ->> property_service:PropertyServiceThread()
property_service ->> property_service:handle_property_set_fd()
property_service ->> property_service:HandlePropertySet()
property_service ->> property_service:SendControlMessage()
property_service ->> init:QueueControlMessage
```

