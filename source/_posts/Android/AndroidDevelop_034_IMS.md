---
title: Android - 事件分发机制解析
date: 2024-06-20 23:42:25
tags:
categories: Android
copyright: true
password:
---

> Android InputManagerService 事件分发机制解析；
>
> 源码版本：android-15-0.0_r23

<!--more-->

------

# 一、总体架构速览

在 Android 15 中：

```
SystemServer
 └── InputManagerService (Java)
     └── NativeInputManager (JNI bridge)
         └── InputManager (native)
             ├── InputReader  （独立线程）
             └── InputDispatcher（独立线程）
```

**关键事实：**

| 项目                         | 结论                         |
| ---------------------------- | ---------------------------- |
| mReader / mDispatcher 创建   | 在 `nativeInit()`            |
| nativeInit() 调用时机        | InputManagerService 构造阶段 |
| 线程真正启动                 | `NativeInputManager.start()` |
| Reader / Dispatcher 启动顺序 | Dispatcher → Reader          |
| 事件循环                     | 各自 Thread::run()           |

------



``` java
// SystemServer.java
private void startOtherServices(@NonNull TimingsTraceAndSlog t) {
    if (inputManagerLifecycleSupport()) {
        inputManager = mSystemServiceManager.startService(
                InputManagerService.Lifecycle.class).getService();
    } else {
        inputManager = new InputManagerService(context);
    }
}
```

这里不管是 if 分支还是 else 分支，最后都是 `new InputManagerService()` 创建 InputManagerService 对象；

# 二、Java 层起点：InputManagerService

## 1️⃣ InputManagerService 构造函数

构造函数中：

```java
// frameworks/base/services/core/java/com/android/server/input/InputManagerService.java
public InputManagerService(Context context) {
    // mNative = new NativeInputManager(this);
    this(new Injector(context, DisplayThread.get().getLooper(), new UEventManager() {}));
}

InputManagerService(Injector injector) {
    ...
    mNative = injector.getNativeService(this);
} 

NativeInputManagerService getNativeService(InputManagerService service) {
    return new NativeInputManagerService.NativeImpl(service, mLooper.getQueue());
}
```

⚠️ 注意：

- **这里只是 new NativeImpl对象**
- 还没有启动任何线程

------

## 2️⃣ NativeInputManager.NativeImpl 构造 → nativeInit()

构造函数：

```java
// frameworks/base/services/core/java/com/android/server/input/NativeInputManager.java
class NativeImpl implements NativeInputManagerService {
    NativeImpl(InputManagerService service, MessageQueue messageQueue) {
        mPtr = init(service, messageQueue);
    }
    private native long init(InputManagerService service, MessageQueue messageQueue);
```

🔴 这里调用了 `nativeInit()`；

------

# 三、nativeInit()：InputReader / Dispatcher 的“出生点”

## 3️⃣ JNI：nativeInit()

**文件：**

```cpp
// frameworks/base/services/core/jni/com_android_server_input_InputManagerService.cpp
static jlong nativeInit(JNIEnv* env, jclass /* clazz */, jobject serviceObj,
                        jobject messageQueueObj) {
    ...
    NativeInputManager* im = nullptr;
    std::call_once(nativeInitialize, [&]() {
        im = new NativeInputManager(serviceObj, messageQueue->getLooper());
    });
    return reinterpret_cast<jlong>(im);
}
```

------

## 4️⃣ NativeInputManager C++ 构造函数

``` cpp
// frameworks/base/services/core/jni/com_android_server_input_InputManagerService.cpp
NativeInputManager::NativeInputManager(jobject serviceObj, const sp<Looper>& looper)
      : mLooper(looper) {
    JNIEnv* env = jniEnv();

    mServiceObj = env->NewGlobalRef(serviceObj);
    // 创建 InputManager
    InputManager* im = new InputManager(this, *this, *this, *this);
    mInputManager = im;
    defaultServiceManager()->addService(String16("inputflinger"), im);
}
```

这里构造了 InputManager，并赋值给 mInputManager 以及添加到 ServiceManager；



------

## 5️⃣ InputManager 构造函数（关键）

**文件：**

```cpp
// frameworks/native/services/inputflinger/InputManager.cpp
InputManager::InputManager(const sp<InputReaderPolicyInterface>& readerPolicy,
                           InputDispatcherPolicyInterface& dispatcherPolicy,
                           PointerChoreographerPolicyInterface& choreographerPolicy,
                           InputFilterPolicyInterface& inputFilterPolicy) {
    mDispatcher = createInputDispatcher(dispatcherPolicy);
    mReader = createInputReader(readerPolicy, *mTracingStages.back());
}

// InputDispatcherFactory.cpp
std::unique_ptr<InputDispatcherInterface> createInputDispatcher(
        InputDispatcherPolicyInterface& policy) {
    return std::make_unique<android::inputdispatcher::InputDispatcher>(policy);
}
// InputReaderFactory.cpp
std::unique_ptr<InputReaderInterface> createInputReader(
        const sp<InputReaderPolicyInterface>& policy, InputListenerInterface& listener) {
    return std::make_unique<InputReader>(std::make_unique<EventHub>(), policy, listener);
}
```

### ✅ 到这里为止：

| 对象            | 状态                     |
| --------------- | ------------------------ |
| InputManager    | 已创建                   |
| InputDispatcher | **已 new，但未启动线程** |
| InputReader     | **已 new，但未启动线程** |

❗ **nativeInit 只“创建对象”，不启动线程**

------

# 四、SystemServer 调用 start()

## 6️⃣ IMS.start()

在 SystemServer 启动后期：

```java
// SystemServer.java
private void startOtherServices(@NonNull TimingsTraceAndSlog t) {
    inputManager.setWindowManagerCallbacks(wm.getInputManagerCallback());
    inputManager.start();
}
```

------

## 7️⃣ InputManagerService.start()

**文件：**

```java
// InputManagerService.java
public void start() {
    mNative.start();
}
// NativeInputManagerService.java
class NativeImpl implements NativeInputManagerService {
    public native void start();
```

------

## 8️⃣ nativeStart() → InputManager::start()

**JNI 文件：**

``` cpp
// com_android_server_input_InputManagerService.cpp
class NativeInputManager :XXX{
    inline sp<InputManagerInterface> getInputManager() const { return mInputManager; }

static void nativeStart(JNIEnv* env, jobject nativeImplObj) {
    NativeInputManager* im = getNativeInputManager(env, nativeImplObj);
    status_t result = im->getInputManager()->start();
}

```

前面在构造 NativeInputManager 的时候创建了 InputManager，随后调用 `InptManager->start()` 启动 InputDispatcher/InputReader 线程；



------

# 五、InputManager::start()：线程启动核心

## 9️⃣ InputManager::start()

```cpp
// InputManager.cpp
status_t InputManager::start() {
    status_t result = mDispatcher->start();
    result = mReader->start();
    return OK;
}
```

### 🔴 启动顺序非常关键：

1. **先 Dispatcher**
2. **再 Reader**

原因：
Reader 产生事件 → 立即需要 Dispatcher 投递

------

# 六、InputDispatcher 线程启动流程

## 1️⃣🔟 InputDispatcher::start()

```cpp
// frameworks\native\services\inputflinger\dispatcher\InputDispatcher.cpp
status_t InputDispatcher::start() {
    if (mThread) {
        return ALREADY_EXISTS;
    }
    mThread = std::make_unique<InputThread>(
            "InputDispatcher", [this]() { dispatchOnce(); }, [this]() { mLooper->wake(); },
            /*isInCriticalPath=*/true);
    return OK;
}
```

检查是否已存在线程，若没有则创建一个 InputThread 并立即启动，线程入口执行 `dispatchOnce()`，返回 OK；若已存在返回 ALREADY_EXISTS。

------

## 1️⃣1️⃣ InputDispatcher 线程执行体

```cpp
// InputDispatcher.cpp
void InputDispatcher::dispatchOnce() {
    nsecs_t nextWakeupTime = LLONG_MAX;
    { // acquire lock
        std::scoped_lock _l(mLock);
        mDispatcherIsAlive.notify_all();

        // Run a dispatch loop if there are no pending commands.
        // The dispatch loop might enqueue commands to run afterwards.
        if (!haveCommandsLocked()) {
            dispatchOnceInnerLocked(/*byref*/ nextWakeupTime);
        }
    } // release lock

    // Wait for callback or timeout or wake.  (make sure we round up, not down)
    nsecs_t currentTime = now();
    int timeoutMillis = toMillisecondTimeoutDelay(currentTime, nextWakeupTime);
    mLooper->pollOnce(timeoutMillis);
}
```

调用内部调度循环 `dispatchOnceInnerLocked()` 来处理并分发排队事件（目标查找、路由、封包、排队），计算超时并调用 `mLooper->pollOnce(timeoutMillis)` 阻塞等待事件或超时，然后循环（由 `InputThread` 不断调用该函数）;

**Dispatcher 线程职责：**

- 等待 InputReader 注入事件
- 进行窗口命中测试
- 处理焦点、ANR、InputChannel
- 向 App 发送输入事件

------

# 七、InputReader 线程启动流程

## 1️⃣2️⃣ InputReader::start()

**文件：**

``` cpp
// frameworks\native\services\inputflinger\reader\InputReader.cpp
status_t InputReader::start() {
    if (mThread) {
        return ALREADY_EXISTS;
    }
    mThread = std::make_unique<InputThread>(
            "InputReader", [this]() { loopOnce(); }, [this]() { mEventHub->wake(); },
            /*isInCriticalPath=*/true);
    return OK;
}
```

同上 `InputDispatcher::start()`；

------

## 1️⃣3️⃣ InputReader 线程执行体

```cpp
void InputReader::loopOnce() {
    for (;;) {
        mEventHub->getEvents(...);
        processEventsLocked();
        mDispatcher->notifyMotion(...);
    }
}
void InputReader::loopOnce() {
    std::vector<RawEvent> events = mEventHub->getEvents(timeoutMillis);
    { // acquire lock
        if (!events.empty()) {
            mPendingArgs += processEventsLocked(events.data(), events.size());
        }
    }
    for (const NotifyArgs& args : notifyArgs) {
        mNextListener.notify(args);
    }
```

**Reader 线程职责：**

- `getEvents(timeoutMillis)`：从 `/dev/input/eventX` 读取原始输入事件（RawEvent）
  - 若超时时间为 0：立即返回，不等待；
  - 若为 - 1：无限等待直到有事件；
  - 若为正数：等待指定毫秒数，超时则返回空事件列表；
- `processEventsLocked()`：解析事件（如将`RawEvent`转换为按键、触摸、运动等语义事件），并将生成的通知参数（`NotifyArgs`）加入`mPendingArgs`（待分发的参数队列），即把 RawEvent 解码为 NotifyArgs 并保存；
- `mNextListener.notify(args)`：遍历 `notifyArgs` 中的所有通知参数（如按键事件、触摸事件、设备变化事件），调用`mNextListener.notify(args)`将事件分发到**InputDispatcher**（输入分发器），由其进一步分发给应用窗口；

``` cpp
// InputListener.cpp
void InputListenerInterface::notify(const NotifyArgs& generalArgs) {
    Visitor v{
            [&](const NotifyInputDevicesChangedArgs& args) { notifyInputDevicesChanged(args); },
            [&](const NotifyKeyArgs& args) { notifyKey(args); },
            [&](const NotifyMotionArgs& args) { notifyMotion(args); },
            [&](const NotifySwitchArgs& args) { notifySwitch(args); },
            [&](const NotifySensorArgs& args) { notifySensor(args); },
            [&](const NotifyVibratorStateArgs& args) { notifyVibratorState(args); },
            [&](const NotifyDeviceResetArgs& args) { notifyDeviceReset(args); },
            [&](const NotifyPointerCaptureChangedArgs& args) { notifyPointerCaptureChanged(args); },
    };
    std::visit(v, generalArgs);
}
```

用 `std::visit` 根据 `std::variant` 的具体类型分派到对应的虚方法（`notifyMotion / notifyKey / …`），所以 `notify(args)` 会最终调用相应的 `notifyMotion()` 或 `notifyKey()`。

------

# 八、完整“时间线顺序图”

```
SystemServer
  |
  | new InputManagerService
  |   └── new NativeInputManager
  |         └── nativeInit()
  |               └── new InputManager
  |                     ├── new InputDispatcher
  |                     └── new InputReader
  |
  | startOtherService()
  |   └── InputManagerService.start()
  |         └── InputManager::start()
  |               ├── mDispatcher->start()
  |               |     └── std::thread (Dispatcher loop)
  |               |
  |               └── mReader->start()
  |                     └── std::thread (Reader loop)
```

------

# 九、关键总结（面试/设计级结论）

### 1️⃣ nativeInit() 的本质

- **对象构造阶段**
- 创建 InputManager / Reader / Dispatcher
- **不启动线程**

------

### 2️⃣ start() 的本质

- **生命周期切换点**
- 真正启动两个核心线程
- Dispatcher 必须先启动

------

### 3️⃣ Reader / Dispatcher 是完全独立线程

| 线程            | 数据来源    | 主要职责     |
| --------------- | ----------- | ------------ |
| InputReader     | /dev/input  | 解析原始输入 |
| InputDispatcher | InputReader | 分发给窗口   |

------

### 4️⃣ Java 层永远不直接操作线程

Java 只负责：

- 生命周期控制
- 策略回调（Policy）
- 不参与事件循环

------



## 时序图

``` mermaid
sequenceDiagram
    participant SystemServer as "SystemServer"
    participant InputManagerService as "InputManagerService (Java)"
    participant NativeImpl as "NativeImpl (Java)"
    participant JNI as "JNI (C++)"
    participant NativeInputManager as "NativeInputManager (C++)"
    participant InputManager as "InputManager (C++)"
    participant InputDispatcher as "InputDispatcher (C++)"
    participant InputReader as "InputReader (C++)"
    participant EventHub as "EventHub (C++)"

    SystemServer->>InputManagerService: construct (Injector -> new NativeImpl(service, messageQueue))
    activate InputManagerService
    InputManagerService->>NativeImpl: new NativeImpl(...)
    activate NativeImpl
    NativeImpl->>JNI: native long init(serviceObj, messageQueue)
    activate JNI
    JNI->>JNI: std::call_once -> create NativeInputManager
    JNI->>NativeInputManager: new NativeInputManager(serviceObj, looper)
    activate NativeInputManager
    NativeInputManager->>InputManager: new InputManager(this, ...)
    activate InputManager
    InputManager->>InputDispatcher: createInputDispatcher(...)
    activate InputDispatcher
    InputManager->>InputReader: createInputReader(... (creates EventHub))
    activate InputReader
    InputReader->>EventHub: new EventHub()
    deactivate InputReader
    deactivate InputDispatcher
    deactivate InputManager
    NativeInputManager->>JNI: return pointer (jlong)
    deactivate NativeInputManager
    JNI->>NativeImpl: init() returns jlong (store in mPtr)
    deactivate JNI
    deactivate NativeImpl
    deactivate InputManagerService

    %% Later during service start()
    SystemServer->>InputManagerService: startOtherServices() -> InputManagerService.start()
    activate InputManagerService
    InputManagerService->>NativeImpl: mNative.start()
    activate NativeImpl
    NativeImpl->>JNI: nativeStart()
    activate JNI
    JNI->>NativeInputManager: getNativeInputManager(env, mPtr)
    activate NativeInputManager
    NativeInputManager->>InputManager: getInputManager()->start()
    activate InputManager
    InputManager->>InputDispatcher: mDispatcher->start()
    activate InputDispatcher
    InputDispatcher->>InputDispatcher: create InputThread -> run dispatch loop
    InputDispatcher-->>InputManager: start() returns OK
    deactivate InputDispatcher
    InputManager->>InputReader: mReader->start()
    activate InputReader
    InputReader->>InputReader: create InputThread -> run read loop (EventHub->getEvents())
    InputReader->>EventHub: poll events
    InputReader-->>InputManager: start() returns OK
    deactivate InputReader
    InputManager-->>NativeInputManager: start() returns OK
    deactivate InputManager
    NativeInputManager-->>JNI: nativeStart() returns
    deactivate NativeInputManager
    JNI-->>NativeImpl: nativeStart() returns
    deactivate JNI
    NativeImpl-->>InputManagerService: start() returns
    deactivate NativeImpl
    deactivate InputManagerService

    note over InputManager: 启动顺序重要：\n1) 构造时创建 `InputDispatcher` 和 `InputReader`；\n2) `start()` 时先 `mDispatcher->start()`，再 `mReader->start()`；若 `mReader->start()` 失败，会停止 dispatcher 并返回错误。
```







## 初始化流程

``` mermaid
sequenceDiagram
    participant SystemServer as "SystemServer.java"
    participant InputManagerService as "InputManagerService.java"
    participant NativeImpl as "InputManagerService.java (NativeImpl)"
    participant JNI as "com_android_server_input_InputManagerService.cpp"
    participant InputManager as "InputManager.cpp"
    participant InputDispatcher as "InputDispatcher.cpp"
    participant InputReader as "InputReader.cpp"
    participant EventHub as "EventHub.cpp"

    SystemServer->>InputManagerService: construct (Injector -> new NativeImpl)
    InputManagerService->>NativeImpl: new NativeImpl(...)
    NativeImpl->>JNI: native init(serviceObj, messageQueue)
    JNI->>JNI: std::call_once -> create NativeInputManager
    JNI->>JNI: return native pointer (jlong)
    JNI->>NativeImpl: init() returns (mPtr stored)

    JNI->>NativeInputManager: (inside ctor) new InputManager(this, ...)
    InputManager->>InputDispatcher: createInputDispatcher(...)
    InputManager->>InputReader: createInputReader(...)
    InputReader->>EventHub: new EventHub()
```

## 启动流程

``` mermaid
sequenceDiagram
    participant SystemServer as "SystemServer.java"
    participant InputManagerService as "InputManagerService.java"
    participant NativeImpl as "InputManagerService.java (NativeImpl)"
    participant JNI as "com_android_server_input_InputManagerService.cpp"
    participant NativeInputManager as "com_android_server_input_InputManagerService.cpp (NativeInputManager)"
    participant InputManager as "InputManager.cpp"
    participant InputDispatcher as "InputDispatcher.cpp"
    participant InputReader as "InputReader.cpp"

    SystemServer->>InputManagerService: startOtherServices() -> start()
    InputManagerService->>NativeImpl: mNative.start()
    NativeImpl->>JNI: nativeStart()
    JNI->>NativeInputManager: getNativeInputManager(mPtr)
    NativeInputManager->>InputManager: getInputManager()->start()
    InputManager->>InputDispatcher: mDispatcher->start()  -- start dispatch thread
    InputManager->>InputReader: mReader->start()          -- start reader thread (EventHub polls)
```

## 架构图

``` mermaid
flowchart LR
    SystemServer[SystemServer.java]
    IMS[InputManagerService.java]
    NativeImpl[NativeImpl]
    JNI[com_android_server_input_InputManagerService.cpp]
    NIM[NativeInputManager]
    IM[InputManager.cpp]
    ID[InputDispatcher.cpp]
    IR[InputReader.cpp]
    EH[EventHub.cpp]

    SystemServer --> IMS
    IMS --> NativeImpl
    NativeImpl --> JNI
    JNI --> NIM
    NIM --> IM
    IM --> ID
    IM --> IR
    IR --> EH

    %% 启动简要（复述关系，便于阅读）
    IMS --> NativeImpl
    NativeImpl --> JNI
    JNI --> NIM
    NIM --> IM
    IM --> ID
    IM --> IR
```



## 思维导图



``` mermaid
mindmap
  root((Input Stack))
    Java
      SystemServer.java
      InputManagerService.java
      NativeImpl
    JNI
      nativeInit call_once
      mPtr jlong
      nativeStart getNativeInputManager
    Native
      NativeInputManager
      InputManager
        InputDispatcher
        InputReader
          EventHub
    Startup
      init 构造对象
      start 先 Dispatcher 再 Reader
    Threading
      Dispatcher 线程 dispatch loop
      Reader 线程 read loop EventHub poll
    FailureModes
      Reader start 失败 停止 Dispatcher
```

https://blog.51cto.com/u_13424/13095230
