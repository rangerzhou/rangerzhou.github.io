---
title: 内部笔记：学习笔记
date: 2026-01-05
published: false
---

# 2 Bootanimation

- 准备 part 动画资源，这部分由美工准备

- 编写 desc.txt

    ``` scss
    // desc.txt
    // 类型：c = 播放一次（常量），p = 循环播放
    // 循环次数：数字表示播放次数，0 = 无限循环
    // 暂停帧数：播放完毕后暂停的帧数
    // 文件夹名：动画图片所在的文件夹名称（如 part0）
    // 背景颜色：十六进制颜色值（如 #ffee00 = 黄色）
    // 缩放模式：c = 居中，s = 拉伸，f = 填充
    // 对齐方式：c = 居中
    
    1080 360 60
    c 1 0 part0 #ffee00 c c
    c 0 0 part1 #ffee00 c c
    c 1 0 part2 #ffee00 c c
    c 1 1 part3 #ffee00 c c
    c 1 0 part4 #ffee00 c c
    ```

    

- 存储方式打包 bootanimation.zip 并放入 `frameworks/base/cmds/bootanimation` 目录下
    - `zip -r -X -Z store bootanimation part*/* desc.txt`

- 预置到 `/system/media`，编辑 Android.mk

    - ``` makefile
        $(shell cp $(LOCAL_PATH)/bootanimation.zip $(ANDROID_PRODUCT_OUT)/system/media/bootanimation.zip)
        ```





# 4 Input 系统专题

inotify：动态监听文件夹下的文件增加和删除

epoll：监听 fd，当可读时 epoll_wait 会继续执行

对于 Input 系统，EventHub 使用 inotify 监听 `/dev/input/` 目录下的文件的增加和删除，当增加一个文件时，`mInotifyFd` 变得可读，源码中就会打开对应的设备文件获取 fd，然后 epoll 对其进行监听，从而监听到 `/dev/input/` 目录下的所有设备节点。

``` shell
# 使用 getevent 命令可以显示当前的触摸事件
$ adb shell getevent -lrt
```

[触摸事件起源](https://juejin.cn/post/7171130176158302245?searchId=20260106145732A10DB23F9AC158009754)

## 1 示例：

### 单指触摸事件流

``` shell
# 1. 手指按下
{type: EV_ABS, code: ABS_MT_TRACKING_ID, value: 0}  # 分配触摸点ID
{type: EV_ABS, code: ABS_MT_POSITION_X,  value: 100} # X坐标
{type: EV_ABS, code: ABS_MT_POSITION_Y,  value: 200} # Y坐标
{type: EV_ABS, code: ABS_MT_PRESSURE,    value: 50}  # 压力值
{type: EV_SYN, code: SYN_REPORT,         value: 0}   # 同步帧结束

# 2. 手指移动
{type: EV_ABS, code: ABS_MT_POSITION_X,  value: 150}
{type: EV_ABS, code: ABS_MT_POSITION_Y,  value: 250}
{type: EV_SYN, code: SYN_REPORT,         value: 0}

# 3. 手指抬起
{type: EV_ABS, code: ABS_MT_TRACKING_ID, value: -1}  # 释放触摸点
{type: EV_SYN, code: SYN_REPORT,         value: 0}
```

### 按键事件示例

``` shell
# 音量+键按下
{type: EV_KEY, code: KEY_VOLUMEUP, value: 1}  # 按下
{type: EV_SYN, code: SYN_REPORT,   value: 0}

# 音量+键释放  
{type: EV_KEY, code: KEY_VOLUMEUP, value: 0}  # 释放
{type: EV_SYN, code: SYN_REPORT,   value: 0}
```

## 2 `/dev/input/eventX` 中的原始内容

#### **数据结构（Linux input_event）**

``` c
struct input_event {
    struct timeval time;  // 时间戳
    __u16 type;           // 事件类型
    __u16 code;           // 事件代码
    __s32 value;          // 事件值
};
```

## 3 EventHub 读取的原始设备

``` shell
/dev/input/event0    # 通常是触摸屏
/dev/input/event1    # 可能是音量键
/dev/input/event2    # 可能是电源键
/dev/input/event3    # 可能是加速度传感器
...
```

- 每个设备对应一个 eventX 文件
- 通过 `ioctl` 和 `epoll` 机制监控变化

## 4 InputReader 解析后的结果

**从原始事件 → Android 标准事件**

``` java
// 原始事件流（多个input_event）
[
  {type:EV_ABS, code:ABS_MT_POSITION_X, value:100},
  {type:EV_ABS, code:ABS_MT_POSITION_Y, value:200},
  {type:EV_SYN, code:SYN_REPORT, value:0}
]

// ↓ InputReader 解析转换 ↓

// 生成标准 Android MotionEvent
MotionEvent.obtain(
    downTime: 123456789,
    eventTime: 123456790,
    action: ACTION_DOWN,      // 动作类型
    pointerCount: 1,          // 触摸点数
    pointerProperties: [...], // 触摸点属性
    pointerCoords: [{x:100, y:200}], // 坐标
    metaState: 0,
    buttonState: 0,
    xPrecision: 1.0,
    yPrecision: 1.0,
    deviceId: 3,              // 输入设备ID
    edgeFlags: 0,
    source: SOURCE_TOUCHSCREEN, // 事件来源
    flags: 0
)
```

### **解析的关键转换**

1. **坐标转换**：原始坐标 → 屏幕坐标（考虑旋转、缩放）
2. **多指处理**：合并多个触摸点的原始数据
3. **手势识别**：点击、长按、滑动等
4. **设备识别**：判断是触摸屏、鼠标、键盘等
5. **时间同步**：硬件时间戳 → 系统时间

完整流程示例

``` text
硬件触摸 → 驱动产生原始事件 → /dev/input/event0
                                    ↓
EventHub 读取: {EV_ABS, ABS_MT_POSITION_X, 100}
              {EV_ABS, ABS_MT_POSITION_Y, 200}  
              {EV_SYN, SYN_REPORT, 0}
                                    ↓
InputReader 解析: 识别为单指触摸DOWN事件
                                    ↓
生成 Android MotionEvent(ACTION_DOWN, x=100, y=200)
                                    ↓
放入 InputDispatcher 队列 → 分发到应用
```



## 5 InputDispatcher

WMS 通过 InputMonitor 在 system_server 中将 WindowState 树转换为只包含 input 所需字段的 InputWindowHandle 快照，并通过 InputManagerService 和 JNI 原子性同步到 native InputDispatcher。InputDispatcher 始终只基于这份本地快照进行窗口查找和事件分发，从不直接访问 WMS，以保证输入路径的高性能和一致性。

## 6 SocketPair 创建和传递的完整流程

### **1. 创建时机：窗口创建时**

```java
// 在应用进程创建窗口时触发
public final class ViewRootImpl {
    public ViewRootImpl(Context context, Display display) {
        // 窗口创建时建立 InputChannel
        mInputChannel = new InputChannel();
        
        // 通过 WindowManagerService 注册窗口
        mWindowSession.addToDisplay(mWindow, ..., mInputChannel);
    }
}
```

### **2. 核心创建过程**

#### **步骤1：应用端发起创建请求**
```java
// 应用进程调用
public int addToDisplay(IWindow window, ..., InputChannel outInputChannel) {
    // outInputChannel 是输出参数
    // 将通过Binder跨进程传递
}
```

#### **步骤2：在 WindowManagerService（system_server）中创建**
```java
// WMS 在 system_server 进程中
public class WindowManagerService {
    public int addWindow(Session session, IWindow client, ...,
                         InputChannel outInputChannel) {
        
        // 创建一对 socket
        InputChannel[] inputChannels = InputChannel.openInputChannelPair(
            "window_" + window.hashCode());
        // 现在有：
        // inputChannels[0] - serverChannel (system_server端)
        // inputChannels[1] - clientChannel (应用端)
        
        // 关键：将 clientChannel 通过Binder传回应用
        outInputChannel.transferTo(inputChannels[1]);
        
        // system_server 保留 serverChannel
        mInputManager.registerInputChannel(
            serverChannel, windowState);
    }
}
```

### **3. FileDescriptor 的跨进程传递机制**

#### **核心类：ParcelFileDescriptor**
```java
// InputChannel 内部实现
public class InputChannel implements Parcelable {
    private FileDescriptor mFd;
    
    // 关键方法：跨进程传递FD
    public void transferTo(InputChannel outParameter) {
        // 通过 ParcelFileDescriptor 传递
        ParcelFileDescriptor fd = ParcelFileDescriptor.fromFd(mFd);
        outParameter.readFromParcel(Parcel.obtain().writeParcelable(fd, 0));
    }
    
    // Parcelable 实现
    public void writeToParcel(Parcel dest, int flags) {
        // 将FD写入Parcel
        dest.writeFileDescriptor(mFd);
    }
}
```

#### **Binder 传递 FD 的原理**
```cpp
// Linux 内核机制
struct binder_transaction_data {
    int fd;  // Binder事务可以包含文件描述符
};

// 传递过程：
// 1. 发送进程：fd=5
// 2. 内核：记录fd引用，分配新的fd号给接收进程
// 3. 接收进程：收到新的fd（比如fd=7），指向同一个内核对象
```

### **4. 完整流程示例**

#### **时序图**
```
应用进程                     Binder                      system_server
   |                           |                              |
   | 1. addToDisplay()         |                              |
   |-------------------------->|                              |
   |                           | 2. 创建socketpair            |
   |                           |    [serverFd, clientFd]      |
   |                           |                              |
   |                           | 3. 通过Binder返回clientFd    |
   |<--------------------------|                              |
   | 4. 收到clientFd           |                              |
   |    (指向socket另一端)      |                              |
   |                           | 5. 保留serverFd              |
   |                           |    注册到InputDispatcher     |
   |                           |                              |
```

#### **代码流程详解**
```java
// 详细步骤：
// 步骤1：应用调用 WindowSession.addToDisplay()
IWindowSession.addToDisplay(window, ..., outInputChannel);

// 步骤2：调用进入 system_server（WMS）
public int addWindow(...) {
    // 创建socketpair
    InputChannel[] channels = InputChannel.openInputChannelPair(name);
    // channels[0] - system_server端
    // channels[1] - 应用端
    
    // 通过Binder传回应用端
    channels[1].transferTo(outInputChannel);
    
    // 注册到InputManager
    mInputManager.registerInputChannel(
        channels[0].getFd(), windowState);
}

// 步骤3：Binder机制传递FileDescriptor
// outInputChannel.writeToParcel() 将FD写入Parcel
// Parcel跨进程传递，内核复制FD

// 步骤4：应用收到FD
// InputChannel.readFromParcel() 从Parcel读取FD
// 现在应用有了socket的另一端
```

### **5. SocketPair 的生命周期管理**

#### **创建 SocketPair**
```cpp
// native 层实现
status_t InputChannel::openInputChannelPair(
        const String& name,
        sp<InputChannel>& outServerChannel,
        sp<InputChannel>& outClientChannel) {
    
    int sockets[2];
    // 创建UNIX域socket对
    if (socketpair(AF_UNIX, SOCK_SEQPACKET, 0, sockets) != 0) {
        return UNKNOWN_ERROR;
    }
    
    // 设置非阻塞
    fcntl(sockets[0], F_SETFL, O_NONBLOCK);
    fcntl(sockets[1], F_SETFL, O_NONBLOCK);
    
    // 创建两个InputChannel对象
    outServerChannel = new InputChannel(name, sockets[0]);
    outClientChannel = new InputChannel(name, sockets[1]);
    
    return OK;
}
```

#### **FD 编号变化**
```
创建时（在system_server进程）：
  serverFd = 5 (sockets[0])
  clientFd = 6 (sockets[1])

通过Binder传递后：
  system_server: 仍然持有 fd=5
  应用进程: 收到新的 fd，比如 fd=3，但指向同一个socket
  
内核视图：
  ┌─────────────────────┐
  │     Socket Pair     │
  │  ┌───────────────┐  │
  │  │ 内核socket对象  │  │
  │  └───────────────┘  │
  │         │           │
  │   fd=5  │    fd=6   │
  └─────────┼───────────┘
            │
      跨进程复制
            │
      应用进程fd=3
```

### **6. 验证 FD 传递**

#### **查看进程的 FD**
```bash
# 查看 system_server 的 FD
adb shell ls -l /proc/$(pidof system_server)/fd | grep socket

# 查看应用进程的 FD
adb shell ls -l /proc/$(pidof com.example.app)/fd | grep socket
```

#### **调试代码**
```java
// 在应用端打印 FD 信息
Log.d("InputChannel", "FD: " + mInputChannel.getFd());

// 在 InputDispatcher 中打印
ALOGD("Registered channel FD: %d", channel->getFd());
```

### **7. 关键设计要点**

1. **一次创建，两端使用**：socketpair 创建时两端就在同一个内核对象
2. **FD 是进程局部**：每个进程有自己的 FD 编号
3. **Binder 传递的是引用**：传递的是内核对象引用，不是 FD 值本身
4. **自动关闭机制**：进程退出时内核自动清理 FD
5. **权限控制**：只有 system_server 能创建和分发 InputChannel

### **8. 异常处理**
```java
// 如果应用进程异常退出
// system_server 会检测到 socket 关闭
void InputDispatcher::unregisterInputChannelLocked(...) {
    // 清理对应的 InputChannel
    close(serverFd);
}

// 如果 system_server 重启
// 所有 socket 重新创建，应用需要重新注册窗口
```

这种设计确保了：
1. **安全性**：只有 system_server 控制 InputChannel 的创建和分发
2. **性能**：一旦建立，通信是直接的 socket 通信
3. **可靠性**：Binder 只用于建立连接，不用于高频数据传输
4. **清理简便**：进程退出时自动清理资源





## 总结

### 1. InputReader 阶段（读取）

- **硬件中断**：触摸屏/按键产生原始事件
- **EventHub**：从 `/dev/input/` 读取原始事件
- **InputReader**：
  - 解析原始数据 → 标准 Android 事件
  - 处理多指触摸、手势识别
  - 创建 `InputEvent`（KeyEvent/MotionEvent）

### 2. 队列传递阶段

``` java
InputReader.process() → 
生成 InputEvent → 
放入 InputDispatcher 的 inboundQueue →
唤醒 InputDispatcher 线程
```

### 3. InputDispatcher 阶段（分发）

- **查找目标窗口**：根据坐标找到焦点应用/窗口
- **出队处理**：从 inboundQueue 取出事件
- **分发策略**：
  - 应用焦点检查（前台/后台）
  - ANR 监控（5秒超时）
  - 权限检查（触摸注入等）
- **发送给应用**：
  - 通过 Socket 通道发送到应用 UI 线程
  - 应用处理完后返回完成信号

### 关键特点

- **双线程模型**：Reader线程 + Dispatcher线程，避免阻塞
- **队列缓冲**：inboundQueue（待分发） + outboundQueue（已分发待确认）
- **ANR 保护**：分发超时（5秒）触发 ANR
- **VSync 同步**：可配置与屏幕刷新同步，避免卡顿

## 禁用屏幕实战

通过 `adb shell dumpsys inputflinger disable` 即可禁用，具体实现：

修改 InputManager.cpp，重写 `dump()` 函数，接收到 disable 参数后设置 InputReader::gDisable = false，

``` cpp
// InputManager.cpp
#define LOG_NDEBUG 0

status_t InputManager::dump(int fd, const Vector<String16>& args) {
    if (args.size() > 0 ) {
        ALOGW("InputManager::dump args = %s",std::string(String8(args[0]).string()).c_str());
        String8 result;
        result.append("InputManager diable state:\n");
        if (args[0] == String16("disable")) {
            InputReader::gDisable = true;
            result.append("state: disable \n");
        } else {
            InputReader::gDisable = false;
            result.append("state: enable \n");
        }
        write(fd, result.string(), result.size());
    }
    return 0;
}

// InputManager.h
#include <utils/String16.h>
#include <utils/String8.h>
    
    virtual status_t dump(int fd, const Vector<String16>& args);
```



修改 InputReader.cpp，使用 gDisable 变量控制

``` cpp
// InputReader.cpp
+bool InputReader::gDisable = false;
 void TouchInputMapper::processRawTouches(bool timeout) {
-    if (mDeviceMode == DEVICE_MODE_DISABLED) {
+    if (InputReader::gDisable  || mDeviceMode == DEVICE_MODE_DISABLED) {
         // Drop all input if the device is disabled.
         mCurrentRawState.clear();
         mRawStatesPending.clear();
+         ALOGD("Drop all input processRawTouches InputReader::gDisable = %d",InputReader::gDisable);
         return;
     }
// InputReader.h
+    static bool gDisable;
```

## 7 dumpsys 分析 input

``` shell
$ adb shell dumpsys input
```

## 8 ANR 产生源码分析

- IQ(InboundQueue)：InputReader 读取原始事件后的入队（所有输入事件的 “系统总收件箱”）
  - 是 InputDispatcher 全局唯一的 “总接收队列”，事件是 InputReader 加工后的 `EventEntry`（非原始硬件事件），入队后唤醒 InputDispatcher 线程处理

- OQ(OutboundQueue)：InputDispatcher 已入队，等待通过 socketpair 发送给 APP 的队列（单个 APP 的 “待发送件箱”）
  - 与单个 APP 的 `Connection` 绑定（每个 APP 专属），事件是 `DispatchEntry`，等待 InputDispatcher 主动发起 `socketpair` 发送流程

- WQ(WaitQueue)：已发送到 APP，但是还没有收到 APP 回调 finish 的队列（单个 APP 的 “已发出但未签收件箱”（签收 = APP 回调 finish））
  - 同样绑定 APP 的 `Connection`，事件发送后立即转入此队列，系统会为队列中事件启动 ANR 超时计时；APP 回调 `finish` 本质是调用 `InputDispatcher` 的 `finishInputEvent`，触发事件从 WQ 移除

IQ 是 InputDispatcher 进程内唯一的，所有 APP 的输入事件都先进入 IQ；而 OQ/WQ 是每个 APP 的 `Connection` 实例下的专属队列，不同 APP 的 OQ/WQ 相互隔离。

ANR 发生原理：

- InputReader 读取原始事件放入 IQ，唤醒 InputDispatcher，InputDispatcher 把它放入 OQ，准备通过 socket 发送给 APP，把交付给 APP 的事件放入 WQ，APP 处理完毕后回调 finish 后把 WQ 对应的事件移除，如果 WQ 里的事件超过5秒还没有处理，就报 ANR；

## 9 轨迹线

使用 `adb shell dumpsys SurfaceFlinger` ，通过 HWC layers 查看轨迹线和轨迹球相关信息，随后全局搜索其所在源码位置；

显示原理：

![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/f09eb65fb3213e2b7073b0ac1f705d04.png#pic_center)

## 10 轨迹球

使用 `adb shell dumpsys SurfaceFlinger` ，通过 HWC layers 查看轨迹线和轨迹球相关信息，随后全局搜索其所在源码位置；

显示原理：

![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/a054705efe0fc9f4b98533e87f253ac9.png#pic_center)

## 11 ANR 实战

重点：

- `onCreate()` 中 sleep 10 秒钟不会发生 ANR（不管 sleep 时是否触摸都不会 ANR），因为在 `onCreate()` 阶段，InputDispatcher 和应用之间的 connection 还没有建立，所以不在 ANR 发生的流程中，就不会发生 ANR 了；
- 在 onTouchEvent() 中 sleep 10 秒钟也不会发生 ANR，除非在 sleep 的过程中触摸了屏幕，发生了 input 事件，才会导致 WQ 中的事件超过 5 秒未处理报 ANR；

## 12 过滤窗口不接受触摸

查看 HWC layers 信息：

``` shell
adb shell dumpsys SurfaceFlinger
```

`findTouchedWindowAtLocked()` 中修改：

``` cpp
if(windowHandle->getName().find("xxx") != std::string::npos) {
    continue;
}
```

## 13 触摸事件注入（模拟触摸事件）

### adb shell 命令

``` shell
adb shell input swipe 100 400 300 400 # 向右滑动
adb shell input tab 500 400 # 点击
adb shell input keyevent 24 # 音量+
```



### 注入事件源码分析

源码路径：`frameworks/base/cmds/input`

在执行 shell 命令时，input 程序会通过 JNI 调用到 `InputManagerService.injectInputEvent`

``` mermaid
sequenceDiagram
Input ->> IMS:injectInputEvent()
IMS ->> IMS:injectInputEventInternal()
IMS ->> IMS(cpp):nativeInjectInputEvent()
IMS(cpp) ->> InputDispatcher:injectInputEvent()

```



### 注入事件使用方式

普通 APP 注入事件

注入方法

- 反射 InputManager，然后 `InputManager.injectInputEvent()`

- Instrumentation 方案

  ``` java
  Instrumentation instrumentation  = new Instrumentation ();
  final long now = SystemClock.uptimeMillis();
  float x =100;
  float y = 500;
  MotionEvent clickDown = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
  instrumentation.sendPointerSync(clickDown);
  MotionEvent clickUp = MotionEvent.obtain(now, now, MotionEvent.ACTION_UP, x, y, 0);
  instrumentation.sendPointerSync(clickUp);
  ```

  - 声明权限 `android.permission.INJECT_EVENTS`，不声明这个权限的话，只能在应用内部注入
  - Android.mk 中声明 platform

## 14 Native 独立触摸识别

改写 getevent 源码，根据 Type/Code/Value 重新输出打印；

## 15 APP 后台监听触摸

调用 InputManager.monitorGestureInput()，同样有系统权限问题，和触摸事件注入一样

以 inputMonitor.getInputChannel 为参数，创建一个 InputEventReceiver 对象，其中有 onInputEvent() 函数，再到 EdgeBackGestureHandler.onInputEvent() -> onMotionEvent()，就可以监听到 ACTION_DOWN 等事件（可以参考 SystemUI 对 monitorGestureInput() 的使用）；

## 16 ACTION_CANCEL

当父容器在 onInterceptTouchEvent() 先给子 view 派发了事件，比如 DOWN，然后在 MOVE 事件的时候被父容器拦截了，ACTION_MOVE 就会变成 ACTION_CANCEL 给到子 View 让子 View 知晓；

由 system_server 传递 ACTION_CANCEL：

- 按着 ACTIVITY 任意地方，然后按 HOME 键，应用就会直接收到 ACTION_CANCEL

# 6 WMS/AMS

## 1 窗口层级树

``` shell
adb shell dumpsys activity containers
```

DisplayAreaPolicy.java

``` mermaid
graph TD
    Root --> WallpaperController
    
    subgraph "DisplayContent (每个显示设备)"
        DC[DisplayContent] --> DW[DisplayArea.Root]
        
        DW --> TOP[Top DisplayArea]
        DW --> ABOVE_TASKS[Above Tasks DisplayArea]
        DW --> TASKS[TASKS DisplayArea]
        DW --> BELOW_TASKS[Below Tasks DisplayArea]
        DW --> BOTTOM[Bottom DisplayArea]
        
        TOP --> StatusBar
        TOP --> NavigationBar
        TOP --> IME[InputMethod Dialog]
        
        TASKS --> Task1[Task 1]
        TASKS --> Task2[Task 2]
        TASKS --> TaskN[Task N...]
        
        Task1 --> AT1[ActivityRecord 1.1]
        Task1 --> AT2[ActivityRecord 1.2]
        
        AT1 --> W1[Window 1.1.1]
        AT1 --> W2[Window 1.1.2]
        AT2 --> W3[Window 1.2.1]
        
        BELOW_TASKS --> Wallpaper
        BELOW_TASKS --> AmbientDisplay
    end
```

### 窗口层级树的构建



## 2 层级结构树和 SF 映射

从 `SurfaceControl.setName()` 入手







## 3 WindowToken 总结

系统窗口通常有如下类型：

| type                       | 窗口   |
| -------------------------- | ------ |
| TYPE_STATUS_BAR            | 状态栏 |
| TYPE_NAVIGATION_BAR        | 导航栏 |
| TYPE_INPUT_METHOD          | 输入法 |
| TYPE_WALLPAPER             | 壁纸   |
| TYPE_ACCESSIBILITY_OVERLAY | 无障碍 |
| TYPE_TOAST                 | Toast  |
| TYPE_QS_DIALOG             | QS     |



| 窗口类型                                    | type 区间 | token 来源                         |
| ------------------------------------------- | --------- | ---------------------------------- |
| Activity 主窗口                             | 1–99      | ATMS 通过 ActivityRecord（预注册） |
| 子窗口                                      | 1000–1999 | parentWindow.mToken                |
| IME / Wallpaper                             | 系统 type | system_server 系统服务预创建       |
| Overlay / Alert / StatusBar / NavigationBar | 系统 type | WMS 通过`addWindow()` 中新建       |
| WindowContext                               | 系统 type | WindowContext Token                |

系统窗口特征：没有 Activity，通常 **没有 parentWindow**，token **不能是 ActivityRecord**

子窗口特征：必须有 parentWindow，复用 parentWindow 的 WindowToken，永远依附于某个 Activity

应用窗口特征：必须使用 ActivityRecord 对应的 WindowToken

## 3 窗口添加

FLAG_NOT_TOUCH_MODAL

WM.addView -> WMG.addView -> ViewRootImpl.seView -> WindowSession.addToDisplayAsUser -> **Sesion.addToDisplayAsUser -> WMS.addWindow**

Server 端

- new WindowToken并且挂载到对应的层级节点

- new WindowState并初始化和Window相关的变量

- 调用 OpenInputChannel，初始化相关的触摸通路

- WindowState 挂载到 WindowToken

https://blog.csdn.net/learnframework/article/details/129236971

## 4 relayoutWindow

WMS 创建 Surface 给到 APP

NO_SURFACE/DRAW_PENDING/COMMIT_DRAW_PENDING/READY_TO_SHOW/HAS_SHOW

setView 中的 requestLayout() 触发

performSurfacePlacement()

forAllWindows()

### 创建 Buff 类型的 Surface



``` mermaid
sequenceDiagram
autonumber
Note over WMS:从 ViewRootImpl 调过来
WMS ->> WMS:relayoutWindow()
WMS ->> WMS:createSurfaceControl()
WMS ->> WindowStateAnimator:createSurfaceLocked()
Note over WindowStateAnimator:设置窗口状态为 DRAW_PENDING
WindowStateAnimator ->> WindowStateAnimator:resetDrawState()
WindowStateAnimator ->> WindowSurfaceController:WindowSurfaceController()
Note over WindowSurfaceController, WindowState:创建 Surface(还是容器类型)
WindowSurfaceController ->> WindowState:makeSurface()
Note over WindowSurfaceController, SurfaceControl:将 Surface 设置为“Buff”类型
WindowSurfaceController ->> SurfaceControl:setBLASTLayer()
WMS ->> WindowSurfaceController:getSurfaceControl()
WindowSurfaceController ->> SurfaceControl:copyFrom()
```

Surface 创建完成后，WMS 最后通过把 Surface 返回给应用端传递过来的 outSurfaceControl



## 5 finishDrawing()

reportDrawFinished()

adb shell dumpsys window windows

## 6 闪黑

### 窗口绘制

adb shell dumpsys window windows 查看壁纸 window 状态，最底层一般在 dumpsys 信息最下面，查看到 ImageWallpaper

ImageWallpaper 中查找 addView() 没有找到，，ImageWallpaper 父类是 WallpaperService，在其中看到 `mSession.addToDisplay()` 方法（让 WMS 创建 window），mLayout 参数，mLayout 赋值了 Token，Token 是通过 `WallpaperService.attach()` 赋值的，`attach()` 被 `Engine.attac()` 调用，IWallpaperEngineWrapper 又是在另一个 attach() 中被构造，而这个 attach() 属于 IWallpaperServiceWrapper，IWallpaperServiceWrapper 继承自 IWallpaperService.Stub()，是一个服务端，接下来查找客户端，直接搜索 IWallpaperService，找到 WallpaperManagerService 通过 IWallpaperService.Stub.asInterface() 获取 IWallpaperService 对象，

所以针对 IWallpaperService，WallpaperManagerService(system_server) 属于客户端，ImageWallpaper(SystemUI) 属于服务端，

WallpaperConnection 又是一个 IWallpaperConnection 服务端，而客户端是 SystemUI，Connection 通过 attach 传递到 SystemUI，如此一来 system_server 和 SystemUI 就可以双向通信了

`attach()` 中的 token 和 type 参数，是直接在调用的时候传入的，即直接从 system_server 传递的，Type 是 TYPE_WALLPAPER，在 attach 之前先做了 `addWindowToken()`，调用到 WMS.addWindowToken()，针对 TYPE_WALLPAPER 做了处理，最终找到 DisplayArea 并创建 WallpaperWindowToken，也挂载到了窗口层级树中，

随后 WallpaperService.Engine.updateSurface() 中调用了 addToDisplay()，这里和之前的 addWindow 一样，结果就是创建了 WindowState 并且挂在到了 WallpaperWindowToken 下面，这里 addToDisplay() 也传入了 InputChannel，说明壁纸可以接收触摸事件，

然后在 updateSurface() 中继续调用 mSession.relayout()，relayout() 主要就是获取 SFC，即 WindowState 会创建 对应的 SurfaceControl，利用这个 SFC 画图，但是针对壁纸多了一层 `mBbqSurfaceControl(名字 Wallpaper BBQ wrapper)`，可以通过 dumpsys SurfaceFlinger 看出来（查看 HWC layers - Wallpaper BBQ wrapper，查看 BufferStateLayer，parent = ImageWallpaper， 这个 ImageWallpaper 也是一个 BufferStateLayer，而这个 BSL 的 parent 也是 ImageWallpaper，但是这个 ImageWallpaper 是 ContainerLayer，即是一个 WindowState，然后它的 parent 是 WallpaperWindowToken ），

在 SurfaceFlinger 中的层级结构：

WallpaperWindowToken - ImageWallpaper(Container，WindowState) - ImageWallpaper(BufferState) - Wallpaper BBQ wrapper，

随后再经过一系列的转换，把 mBbqSurfaceControl 转换为 mSurfaceHolder，再调用 onSurfaceCreated(这样应用端就可以收到回调了)，再到 onSurfaceRedrawNeeded()，这里会跳转到 SystemUI 中实现的方法绘制完成，再调用 WallpaperService.finishDrawing()，即告知系统我已经绘制完成，可以展示了

总体流程：WallpaperManagerService(system_server) 先通过 bindService() 绑定客户端的 Wall paper Service，然后调用 attach() 触发客户端的 ImageWallpaper（WallpaperService） 创建窗口，relayout 窗口，在 ImageWallpaper 把窗口绘制完成，再调用 finishDrawing()

attach：告知 SystemUI 已经建立绑定，你可以建立窗口以及建立到哪个 token 下面，已经通过 attach() 参数传递给你了，

### 窗口移除

detach() 

``` mermaid
sequenceDiagram
WallpaperManagerService ->> WallpaperService:attach()
Note right of WallpaperService:创建 WindowState
WallpaperService ->> WMS:addToDisplay()
Note right of WallpaperService:创建 Surface
WallpaperService ->> WMS:relayout()
WallpaperService ->> WMS:BbqSurfaceControl
Note right of WallpaperService:绘制第一帧完成，提交
WallpaperService ->> WMS:finishDrawing()

WallpaperManagerService ->> WallpaperManagerService:detachWallpaperLocked()
WallpaperManagerService ->> WallpaperManagerService:DisplayConnector.disconnectLocked()
Note right of WallpaperManagerService:1.移除 WallpaperToken
WallpaperManagerService ->> WindowManagerInternal:removeWindowToken()
WallpaperManagerService ->> WallpaperService:IWallpaperServiceWrapper.detach()
WallpaperService ->> WallpaperService:IWallpaperEngineWrapper.destroy()
WallpaperService ->> WallpaperService:executeMessage(DO_DETACH)
WallpaperService ->> WallpaperService:IWallpaperEngineWrapper.doDetachEngine()
WallpaperService ->> WallpaperService:IWallpaperEngineWrapper.detach()
Note over WallpaperService,Session:2.移除 WindowState
WallpaperService ->> Session:remove(WindowState)
Note over WallpaperService,SurfaceControl:3.移除 mBbqSurfaceControl
WallpaperService ->> SurfaceControl:Transaction.remove(mBbqSurfaceControl)
WallpaperManagerService -->> WallpaperManagerService:unbindService()
```



### 源码跟踪

图层的操作是在 SuraceControl 中有 API，查看 `remove()`，打印堆栈，

WallpaperManagerService.detachWallpaperLocked() 

## Winscope 抓取

https://blog.csdn.net/learnframework/article/details/148973403

### AOSP 13 版本

#### 1.adb 命令方式离线抓取

``` shell
# 抓取 WindowManager:
adb shell cmd window tracing start
adb shell cmd window tracing stop

# 抓取 SurfaceFlinger：
adb shell su root service call SurfaceFlinger 1025 i32 1
adb shell su root service call SurfaceFlinger 1025 i32 0

# 3、获取抓取pb文件
# WindowManager: 
adb pull /data/misc/wmtrace/wm_trace.pb wm_trace.pb

# SurfaceFlinger：
adb pull /data/misc/wmtrace/layers_trace.pb layers_trace.pb

```

#### 2.手机上设置开启抓取按钮

开发者选项中打开开关：

``` shell
# 打开 Show Quick Settings tile
开发者选项 - System Tracing - Show Quick Settings tile
# 打开 Winscope Trace
Quick settings developer tiles - Winscope Trace
```

打开之后下拉状态栏就有了 Winscope Trace 的图标

#### 3.html 在线抓取

打开 html，基于 AOSP 源码执行对应的 python 命令：

``` shell
python3 $ANDROID_BUILD_TOP/development/tools/winscope/adb_proxy/winscope_proxy.py
```

#### 4.查看方式

直接打开 `prebuilts/misc/common/winscope/winscope.html`

### AOSP 14 版本

抓取方式和 AOSP13 完全一致；

AOSP 14 源码不自带 Winscope 的 html 了，需要源码进行编译，编译后可以直接使用；

### AOSP 15 版本

https://blog.csdn.net/learnframework/article/details/144384808

https://mp.weixin.qq.com/s/4suK7-drFenNxiHvIeAokw

adb 抓取方式有较大差异；

``` shell
# 抓取 WindowManager 命令继续可用:
adb shell cmd window tracing start
adb shell cmd window tracing stop

# 抓取 SurfaceFlinger 命令不可用：
adb shell su root service call SurfaceFlinger 1025 i32 1
adb shell su root service call SurfaceFlinger 1025 i32 0
# 报错
Result: Parcel(Error: 0xfffffffffffffffe "No such file or directory")
```

报错原因是源码中 1025 的分支已经 Deprecated 了，建议用 Perfetto 抓取



**解决方案：**

``` shell
# 开始抓取
$ adb shell perfetto --out /data/misc/perfetto-traces/winsocpe-proxy-trace.perfetto-trace --txt --config /data/misc/perfetto-configs/winscope-proxy-trace.conf --detach=WINSCOPE-PROXY-TRACING-SESSION
# 结束抓取
$ adb shell perfetto --attach=WINSCOPE-PROXY-TRACING-SESSION --stop
# 导出数据
$ adb pull /data/misc/perfetto-traces/winscope-proxy-trace.perfetto-trace

# windowmanager 相关的还是原来的命令以及目录
```



网页端运行依赖：

- `npm run start`：浏览器的运行后台
- `python3 development/tools/winscope/src/adb/winscope_proxy.py`：负责帮忙抓取设备上的数据服务



生成路径：*/data/misc/wmtrace*

- layers_trace.winscope：Surface 相关 trace
    - Android 15 版本 SF winscope trace 路径：`/data/misc/perfetto-traces/winscope-proxy-trace.perfetto-trace`

- wm_trace.winscope：Window 相关 trace

prebuilts/misc/common/winscopewinscope.html 打开网页



发现没有壁纸的 SurfaceFlinger 图层，这是根本原因

查看 SF 的 trace，发现在壁纸图层可见之前，旧壁纸的 BBQ 不存在，所以结论就是旧壁纸的 BBQ 移除过早，而新壁纸的 BBQ 还是空数据

黑屏原因

- 没有图层
- 动画 alpha 0
- 没有 buffer
- flag 本身是 hide

解决方法

- 找到 remove 或者 hide 的地方
- 重新规划调整图层显示时许



## 7 日志经验

### 日志打印方式

- main 日志：Log.i

- system 日志：Slog.i

- events 日志：EventLog.writeEvent（比如查看生命周期，用户 Activity 中没有打印，events 日志可以打印源码中的生命周期）

``` shell
# 默认是 main/system/crash/kernel 日志，没有 events 日志
adb logcat
# 单独抓取
adb logcat -b events
# 打印所有日志
adb logcat -b all
```

### events 查找日志对应的源码

比如 wm_stop_activity，可以尝试拼凑后搜索 WmStopActivity 查找，也可以直接搜索 wm_stop_activity，但是搜索到的是一个数字，可以再次在 out 目录下 grep 数字，定义在 EventLogTags.java 中（out 目录下）

看生命周期，终端关注的是 wm_xxx 日志，而且 wm_on_xxx 一定是在应用进程中打印的，不带 on 的在 system_server 中

### ProtoLog

功能：动态开关某一个模块的日志

``` shell
# 开启：enable-text，关闭：disable-text
adb shell wm logging enable-text WM_DEBUG_STATES
adb logcat -s WindowManager | grep "Moving to STOPPING"
```

这里的 WM_DEBUG_STATES 可以搜索 ProtoLog.v() 查看传入的具体是什么，比如：
``` java
// ActiityRecord.java
ProtoLog.v(WM_DEBUG_STATES, "Moving to STOPPING:xxx")
```

Andrid 开启方式变更：https://blog.csdn.net/learnframework/article/details/140121485

## 8 窗口动画专题

### WMS 动画类型

- 远端动画：动画运行在非 system_server 进程，而是在 Launcher/SystemUI 进程
    - **远程动画**是 WindowManager 将窗口 Surface 通过 Binder 暴露给外部进程，由 Launcher/SystemUI 通过 RemoteAnimationRunner 自行驱动动画，灵活性极高，适合复杂交互和系统定制。
    - system_server 不定义远程动画“怎么动”，只定义“什么时候开始、哪些 Surface 参与”
    - system_server 做的事情只有三类：
        1. 判断是否使用远程动画
        2. 准备好参与动画的 Surface
        3. 通过 Binder 回调远端
    - 远端进程决定：
        - 动画持续多久
        - 用什么插值器 / 物理模型
        - Surface 如何缩放、平移、裁剪
        - 是否跟随手势
    - 场景
        - 从 Launcher 启动 App
            - 从点击图标到 APP 窗口放大
            - 圆角裁剪
    
        - 返回桌面 / Home
            - App 窗口缩回图标
            - 手势返回桌面
    
        - 最近任务（Recents / Overview）
            - Task 卡片滑动
            - 多窗口预览
            - 手势拖拽
    
        - 分屏 / 自由窗口
            - Task resize
            - 边界拖动
            - 同步跟手
    
- 本地动画：动画运行在 system_server 进程，在 WindowState.startAnimation() 中调用 `new LocalAnimationAdapter()`
    - **本地动画**是 WindowManager 内部基于 SurfaceControl 驱动的动画，执行在 system_server 中，稳定但受限。
    - 动画的“剧本”和“执行器”仍然在 system_server
    - systemserver 自己在 WindowAnimator 类进行动画播放控制
    - Animator 对 Surface 进行动画，控制 Matrix，alpha，圆角等
    - 场景
        - 普通 Activity / Task 切换
            - startActivity()
            - finish()
            - startActivityForResult()

        - 非 Launcher 触发的窗口变化
            - 应用内跳转
            - 设置页面切换
            - 系统对话框弹出/消失
            - Toast / 非系统级浮层


> **Android 中“本地动画 / 远程动画”，
>  是以 `system_server（WindowManager）` 为唯一参照系定义的。**
>
> **system_server 自己执行动画 → 本地动画**
>  **system_server 把动画执行权交给 Launcher/SystemUI → 远程动画**


有动画的话，在 SF 的 winscope 中会有 leash 的 Surface，等动画完成，WMS 就松开这个狗绳(leash)

leash 的 surface 图层特点

- 把要进行动画的子节点都挂到这个 leash 节点

### 源码分析

SurfaceAnimator.java 查找 “animation-leash” 日志

commitFinishDrawingLocked()

SurfaceAnimator.createAnimationLeash()

- 把 leash 的父亲设置为 WindowToken
- 把 WindowState 的父亲设置为 leash
- removeLeash() 时会把 windowstate 重新挂载到 windowtoken

 移除

- startAnimation() 的时候，传入了一个回调，当动画完成的时候，通过 Handler 通知执行回调进行移除

### 总结

课程 31

https://blog.csdn.net/learnframework/article/details/129602356

## 9 Activity 启动流程

ATMS 创建 ActivityRecord/Task

看源码方式：dumpsys activity containers，打印堆栈，反推调用流程

WindowContainer.addChild() 中打印堆栈，从堆栈中看出来 Task 和 ActivityRecord 的创建和添加到层级树中，

[Launcher/system_server/app 启动图](https://blog.csdn.net/learnframework/article/details/130065473)

## 10 SplashScreen

``` shell
adb shell dumpsys window windows
```

在 SplashScreen 出现时使用 dumpsys 命令抓取窗口信息（从底部向上看），找到类似如下信息：

``` shell
Window #9 Window{9d1w325 u0 Splash Screen com.android.gallery3d}
    mDrawState=HAS_DRAWN
```

frameworks 目录搜索 ”Splash Screen“

> dumpsys 信息显示的包名，并不一定就说明这里的信息是这个包名所属进程创建的，<font color=red>**有可能只是把 windowstate 挂载到了这个进程，比如 SplashScreen(StartingWindow) 就是挂载到了APP进程的ActivityRecord下，又比如负一屏挂载到桌面**</font>，从 dumpsys 的 mSession 可以判定属于哪个进程创建，或者通过 logcat 确定进程号，发现是 SystemUI
>
> 然后通过查看层层调用，最后发现是一个跨进程调用到 TaskOrganizer.addStartingWindow()，grep "addStartingWindow(" 发现是 TaskOrganizerController.addStartingWindow() - ITaskOrganizer.addStartingWindow 中调用的，而这个类路径属于 system_server 进程，说明是从 system_server 进程 IPC 到 SystemUI 进程，由 SystemUI 添加 Splash Screen，

``` shell
adb shell dumpsys activity containers
```

这个 dumpsys 可以显示挂载顺序

### 添加 SplashScreen Window 到应用

时序图

``` mermaid
sequenceDiagram
autonumber
ActivityStarter ->> ActivityStarter:startActivityInner()
ActivityStarter ->> Task:startActivityLocked()
Note over StartingSurfaceController:这里会设置一个标志位是否显示 Starting Window
Task ->> StartingSurfaceController:showStartingWindow()
StartingSurfaceController ->> ActivityRecord:showStartingWindow()
ActivityRecord -->> ActivityRecord:addStartingWindow()
ActivityRecord ->> ActivityRecord:scheduleAddStartingWindow()
ActivityRecord ->> ActivityRecord:AddStartingWindow:run()
ActivityRecord ->> SplashScreenStartingData:createStartingSurface()
SplashScreenStartingData ->> StartingSurfaceController:createSplashScreenStartingSurface()
StartingSurfaceController ->> TaskOrganizerController:addStartingWindow()
Note over TaskOrganizerController,TaskOrganizer:IPC 到 SystemUI 进程
TaskOrganizerController ->> TaskOrganizer:mInterface:addStartingWindow()
TaskOrganizer ->> ShellTaskOrganizer:addStartingWindow()
Note over StartingWindowController:这里传入了 StartingWindowInfo 和 ActivityRecord.token
ShellTaskOrganizer ->> StartingWindowController:addStartingWindow(info,token)
Note over StartingSurfaceDrawer:在里面设置了 TYPE_APPLICATION_STARTING
StartingWindowController ->> StartingSurfaceDrawer:addSplashScreenStartingWindow()

Note over StartingSurfaceDrawer:添加窗口
StartingSurfaceDrawer ->> StartingSurfaceDrawer:addWindow()
StartingSurfaceDrawer ->> WindowManagerGlobal:addView()
```



### 应用定制 splashscreen logo 及动画

在 style.xml 中的 <style> 标签中添加 <item>，

``` xml
<item name="android:windowSplashScreenBackground">#ffffffff</item>
<item name="android:windowSplashScreenAnimatedIcon">@drawable/news_avd_v02</item>
<item name="android:windowSplashScreenIconBackgroundColor">#ffffffff</item>
<item name="android:windowSplashScreenAnimationDuration">1000</item>
```

然后 StartingSurfaceDrawer.java 中就会获取主题，更具体的是 `SplashscreenContentDrawer.cerateContentView() -> SplashscreenContentDrawer.makeSplashScreenContentView() SplashscreenContentDrawer.getWindowAttrs()`，在这里就获取了 style 中设置的内容，

StartingSurfaceDrawer.getSplashScreenTheme()



### logo往下，主Activity向上的动画方案

如何发现是 copy 方案？打开 Proto 日志：`adb shell wm logging enable-text WIM_SHELL_STARTING_WINDOW`，然后 `adb logcat -s ShellStartingWindow` 查看打开 APP 的日志，发现当有向下动画的时候，多了一条日志：`Copying splash screen window view for task:xxx`

搜索发现是在 `StartingSurfaceDrawer.copySplashScreenView()` 打印的，网上追踪发现和前面添加 SplashScreen 的逻辑一致，都是通过跨进程调用过来的，在 `TaskOrganizerController.copySplashScreenView()` 添加断点打印堆栈：

``` scss
WindowStateAnimator:commitFinishDrawingLocked()
	WindowState:performShowLocked()
		ActivityRecord:onFirstWindowDrawn()
		ActivityRecord:removeStartingWindow()
		// 如果这里的 mHandleExitSplashScreen 为 false，就不会走到 copy
		ActivityRecord:transferSplashScreenIfNeeded()
		ActivityRecord:requestCopySplashScreen()
		TaskOrganizerController:copySplashScreenView()
			// 到了 SystemUI 进程
			ShellTaskOrganizer:copySplashScreenView()
				StartingWindowController:copySplashScreenView()
					StartingSurfaceDrawer:copySplashScreenView()
					...
		// 回调 APP 进程，根据之前Parcel的SplashView对象重新构建一个SplashScreenView并且添加到DecorView
		ActivityThread:createSplashScreen()
		ActivityRecord:onSplashScreenAttachComplete()
		ActivityRecord:removeStartingWindowAnimation()
```



``` scss
ActivityRecord:setCustomizeSplashScreenExitAnimation()
SplashScreen:setOnExitAnimationListener()
This means that the SplashScreen will be inflated in the application process once the process has started
```

追踪调用最后到了 SplashScreen:setOnExitAnimationListener()，也就是说，如果应用调用了这个方法，就是告知 SystemUI 我要来处理这个退出动画，否则 SplashScreen 会在应用第一帧绘制完成的时候退出

那么系统就会帮我们 copy



把 SplashScreen 最后一帧传递给应用，应用进程再做动画处理

触发 SystemUI 帮我们拷贝最后一帧到应用：

``` java
SplashScreen.setOnExitAnimationListener(this::onSplashScreenExit)
```

### Removing Splash Window

这里说的是主 Activity 显示后移除 Splash Window

日志表现："Removing splash screen window for task: xxx"

搜索日志发现是在 `StartingSurfaceDrawer.removeWindowSynced()` 中发现，然后它继续调用  -> `StartingSurfaceDrawer.removeWindowInner() -> WindowManagerGlobal.remove()`，并且 `setVisibility(View.GONE)`，

向上调用链：`removeWindowSynced() <- StartingSurfaceDrawer.removeStartingWindow() <- StartingWindowController.removeStartingWindow() <- ShellTaskOrganizer.removeStartingWindow() <- TaskOrganizer.removeStartingWindow()` 又到了跨进程调用的地方了，那么就到了 `TaskOrganizerController.removeStartingWindow()`，到了 system_server 进程，在这里查看堆栈，

``` scss
// 没有动画定制，即没有 setOnExitAnimationListener()
WindowStateAnimator:commitFinishDrawingLocked()
	WindowState:performShowLocked()
		ActivityRecord:onFirstWindowDrawn()
		ActivityRecord:removeStartingWindow()

		// ####################有动画定制时-Start#############################
		// 如果这里的 mHandleExitSplashScreen 为 false，就不会走到 copy
		ActivityRecord:transferSplashScreenIfNeeded()
		ActivityRecord:requestCopySplashScreen()
		TaskOrganizerController:copySplashScreenView()
			// 到了 SystemUI 进程
			ShellTaskOrganizer:copySplashScreenView()
				StartingWindowController:copySplashScreenView()
					StartingSurfaceDrawer:copySplashScreenView()
					...
		// 回调 APP 进程，根据之前Parcel的SplashView对象重新构建一个SplashScreenView并且添加到DecorView
		ActivityThread:createSplashScreen()
		ActivityRecord:onSplashScreenAttachComplete()
		ActivityRecord:removeStartingWindowAnimation()
		// ####################有动画定制时-End###############################

		// 后续为移除通用步骤
		ActivityRecord:removeStartingWindowAnimation()

			StartingSurfaceController:StartingSurface:remove()
				TaskOrganizerController:removeStartingWindow()
					// 到了 SystemUI 进程
					ShellTaskOrganizer:removeStartingWindow()

```

那么也就是说，主 Activity window 已经绘制好的时候，就告知 ActivityRecord 我已经绘制好了准备显示了，然后 ActivityRecord 就开始移除 Starting Window 了，如果应用有动画定制，那么先 copy 最后一帧到应用，然后再移除。

#### Remove 流程总结

APP 没有定制动画的情况

- onFirstWindowDrawn -> removeStartingWindow() -> removeStartingWindowAnimation() -> StartSurfaceController.remove() -> TaskOrganizerController.removeStartingWindow() -> SystemUI 进行 remove

APP 定制动画的情况

- transferSplashScreenIfNeeded() -> SystemUI copySplashView --> copySplashViewComplete -> app createSplashScreen -> onSplashScreenAttachComplete() -> onFirstWindowDrawn() 后续和定制的情况一样

![SplashScreen](../../images/2025/SplashScreen.png)

### 实战移除 Starting Window

这里说的是不要 Splash Screen

前面添加 window 的时候，看到 `Task ->> StartingSurfaceController:showStartingWindow()` 调用之前的判断条件中有一个标志位 `Task.SHOW_APP_STARTING_PREVIEW`，如果设置为 false，就可以不显示 Starting Window。

- 方案1：TaskFragment.SHOW_APP_STARTING_PREVIEW 改为 false
    - **缺点：点击图标后会卡一会儿，而且可能不能完全覆盖。**
- 方案2：有些 showStartingWindow() 的调用判断条件没有包含上面那个标志，`ActivityRecord.addStartingWindow()` 中修改，判断个条件让它直接 return
    - **缺点：点击图标后，会卡一会儿。**

- 方案3：在 `SplashscreenContentDrawer.getWindowAttrs()` 中直接设置 Icon 为透明 ColorDrawable

``` java
// 这里判空是为了不对第三方想定制 logo 的 APP 产生影响
if(attrs.mSplashScreenIcon == null) {
    attrs.mSplashScreenIcon = new ColorDrawable(Color.TRANSPARENT);
}
```

这种方案只是替换了 logo，logo 后面的大背景还是会正常显示，但是在真机上会很快闪过。



## 11 应用动画

应用切换动画

查看 Proto 日志 "createAnimationLeash type ="

有 5 个动画：Wallpaper/Launcher/SplashWindow 移除/ActivityRecord reveal/SystemDialogActivity

## 12 远程动画

- Launcher 端创建 Runner，创建 Adapter 传递到 system_server
- system_server 端经过 gootToGo 后，再通过 adapter.getRUNNER() 获取到 runner，通过 IPC 又到了 Launcher 进程，会把 Target/Surface(Leash) 传给 Launcher，还传递了 FinishedCallback，以便 Launcher 动画执行完成后回调到 system_server
- Launcher 进程调用 onAnimationStart() -> onUpdate() 进行动画执行，执行完成后，通过 FnishedCallback 到 system_server 进程
- system_server 通过 FinishedCallback.onAnimationFinished() 进行扫尾工作

总结：47

![RemotionAnimationProcess](../../images/2025/RemotionAnimationProcess.png)

## 13 Activity 的 window 添加

 https://852988.xyz/2022/02/20/Android/AndroidDevelop_017_CreateActivity_WindowDisplay/#comment-gitalk

## 14 FocusedWindow

### Focused Window ANR 场景

``` shell
# ANR 常见类型
Input dispatching timed out(Application does not have a focused window)
```

- 没有焦点窗口 FocusedWindow 导致
- Focused ANR 只会发生在 key 事件的派发，触摸事件不会产生，因为 key 事件找不到焦点窗口会立即触发 ANR，而触摸事件通过 `findTouchedWindow()` 找不到窗口只会丢弃事件，不会触发 ANR，可以通过 events 日志看出：

``` shell
# key_back_press 按键事件
sysui_multi_action: [777,802,444,key_back_press,803,1]
am_anr:xxx
```

- **Key 事件**：系统级关键输入（返回键、Home键、音量键）
    - 必须要有接收者
    - 无法确定目标 = 系统状态异常
- **Touch 事件**：应用级交互
    - 允许无目标（点到状态栏、导航栏外）
    - 可能是正常情况（点击区域无控件）

### 查看焦点窗口命令

```shell
# 两种方式
dumpsys window | grep mFocused
dumpsys window lastanr # 查看 ANR 信息
dumpsys SurfaceFlinger
dumpsys input # 如果发生 ANR，以这个命令为准
```

dumpsys window 

- mCurrentFocus：指明 window，focused ANR 的时候，就是因为这里为 null
- mFocusedApp：指明  ActivityRecord，不一定指向同一个进程，比如下拉通知栏的时候 dumpsys window

- LAST ANR：显示 ANR 相关信息

dumpsys SurfaceFlinger

- 查看 HWC layers，后面有标记 [*] 的是焦点

dumpsys input

- FocusedApplications
- FocusedWindows
- last ANR：ANR 信息

### 分析方法

查看 input_focus 信息

``` shell
logcat -b events | grep input_focus
```

- Focus request
- Focus leaving：wms 发了一个请求焦点
- Focus entering：说明已经有焦点了，如果发生 ANR 时出现这个日志，可以考虑查看是否 input 那边有问题，如果没有这条日志，考虑 WMS/SurfaceFlinger 的问题

### 源码分析

在 dumpsys window 的时候，mFocusedApp 是在 `dumpsys window displays` 信息中输出的，可以在 RootWindowContainer.java 中搜索到 “dumpsys window displays”，查看 mFocusedApp 的赋值

使用同样方法查看 mCurrentFocus 的赋值

### 总结

## 15 横竖屏旋转

Surface 旋转（逆时针旋转）

- ROTATION 0
- ROTATION_90
- ROTATION_180
- ROTATION_270

## 16 多屏互动

### 1 使用命令查看效果

``` shell
# 移动 task，旧版本中是：am display move-stack taskid displayId
adb shell am task move 87 1

# 查看 taskid, displayId
$ adb shell dumpsys activity tasks
TASK id=87
  userId=0
  displayId=1
  baseActivity=com.xxx.yyy/.MainActivity
```





https://juejin.cn/post/7306043013816860687

### 2 静态移动方案

- 监听手势，当滑动超过设定的 GAP 时开始移动 TASK

### 3 监听手势

新建一个 Listener 监听手指事件

``` java
// DoubleScreenMovePointerEventListener.java
package com.android.server.wm;

import android.view.MotionEvent;
import android.view.WindowManagerPolicyConstants;

public class DoubleScreenMovePointerEventListener implements WindowManagerPolicyConstants.PointerEventListener {
    boolean shouldBeginMove = false;
    int mPoint0FirstX = 0;
    int mPoint1FirstX = 0;

    int mPoint0LastX = 0;
    int mPoint1LastX = 0;
    int START_GAP = 20;
    private final WindowManagerService mService;

    public DoubleScreenMovePointerEventListener(WindowManagerService mService, DisplayContent mDisplayContent) {
        this.mService = mService;
        this.mDisplayContent = mDisplayContent;
    }

    private final DisplayContent mDisplayContent;

    @Override
    public void onPointerEvent(MotionEvent motionEvent) {
        switch (motionEvent.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN:
                if (motionEvent.getPointerCount() > 2) {
                    shouldBeginMove = false;
                }
                if (motionEvent.getPointerCount() == 2) {
                    if (mPoint0FirstX == 0 && mPoint1FirstX == 0) {
                        mPoint0FirstX = (int)motionEvent.getX(0);
                        mPoint1FirstX = (int)motionEvent.getX(1);
                    }
                }
                break;
           case MotionEvent.ACTION_MOVE:
                // 两个点的移动距离大于 START_GAP 时则开始移动 Task
               if (motionEvent.getPointerCount() == 2) {
                   if (!shouldBeginMove && motionEvent.getX(0)  - mPoint0FirstX > START_GAP ||
                           motionEvent.getX(1)  - mPoint1FirstX > START_GAP) {
                       shouldBeginMove = true;
                       mDisplayContent.doTestMoveTaskToOtherDisplay();
                   }

                   mPoint0LastX = (int)motionEvent.getX(0);
                   mPoint1LastX = (int)motionEvent.getX(1);
               }
               break;
           case MotionEvent.ACTION_POINTER_UP:
           case MotionEvent.ACTION_UP:
               shouldBeginMove = false;
               mPoint0FirstX = mPoint1FirstX =0;
               break;
       }
    }

}
```

主要工作：

- 监听手势，按下时，记录两个点的初始坐标
- 移动时，判断移动距离是否大于 GAP，如果大于 GAP，则开始移动 Task，设置标志位为 true，并记录两个点的最后位置
- 抬起时，设置标志位为 false，并充值两个点的初始坐标为 0

### 4 移动 Task 到另一块屏幕

``` java
// frameworks/base/services/core/java/com/android/server/wm/DisplayContent.java
// 定义 Listener
final DoubleScreenMovePointerEventListener mDoubleScreenMoveListener;
// 构造函数中初始化并注册 Listener
mDoubleScreenMoveListener = new DoubleScreenMovePointerEventListener(mWmService, this);
registerPointerEventListener(mDoubleScreenMoveListener);

// 执行移动 Task
public void doTestMoveTaskToOtherDisplay() {
    DisplayContent otherDisplay = null;
    if (mRootWindowContainer.getChildCount() == 2) {
        otherDisplay = (mRootWindowContainer.getChildAt(0) == this) ? mRootWindowContainer.getChildAt(1):mRootWindowContainer.getChildAt(0);
    }
    if (otherDisplay!= this && otherDisplay!= null) {
        int rootTaskId = 0;
        try {
            Task rootTask = getTopRootTask();
            if (rootTask.isActivityTypeHome()) {
                return;
            }
            rootTaskId =rootTask.mTaskId;
            mRootWindowContainer.moveRootTaskToDisplay(rootTaskId,otherDisplay.mDisplayId,true);
        }catch (Exception e) {
            android.util.Log.i("DoubleScreen","doTestMoveTaskToOtherDisplay Exception",e);
        }
    }
}
```

主要工作：

- 执行移动操作，获取屏幕数，获取置顶的 Task，并调用 API 把 Task 移动到目标屏幕

### 5 创建镜像图层

``` java
// DisplayContent.java
SurfaceControl copyTaskRootSc = null;
SurfaceControl mirrorTaskSc = null;
SurfaceControl realTaskSc = null;
DisplayContent mOtherDisplayContent = null;

// 获取 task 的顶部 WindowState
WindowState windowState = rootTask.getTopActivity(false,false).getTopChild();
if (windowState!= null) {
    final SurfaceControl.Transaction t = mWmService.mTransactionFactory.get();
    //创建一个 copyTaskRootSc 图层主要用来放置镜像 Task 画面
    if (copyTaskRootSc == null) { 
        copyTaskRootSc =  makeChildSurface(null)
            .setName("rootTaskCopy")
            .setParent(getWindowingLayer()) // 设置父亲，要在状态栏和导航栏下面
            .build();
    }
    if (mirrorTaskSc == null) {
        mirrorTaskSc = SurfaceControl.mirrorSurface(rootTask.getSurfaceControl());
    }
    realTaskSc = rootTask.getSurfaceControl();
    t.reparent(mirrorTaskSc, copyTaskRootSc);
    t.show(copyTaskRootSc);
    t.show(mirrorTaskSc);
    t.apply();
}
ensureOtherDisplayActivityVisible(otherDisplay);
mCurrentRootTaskId = rootTaskId;
startMoveCurrentScreenTask(0,0);
```

主要工作：

- 创建一个在状态栏和导航栏之下的 SurfaceControl 图层 copyTaskRootSc（设置父亲为 getWindowingLayer() 的返回结果，这个图层满足要求）
- 使用 `mirrorSurface()` 创建当前 task 的镜像图层，并设置父亲为 copyTaskRootSc
- 显示图层

这段代码之后的结果就是手指移动 task 到另一块 display 后，原 display 还有一个镜像图层

### 6 设置图层偏移

上面做完后，会在两个屏幕都显示同样的画面，现在需要对这两个图层进行偏移

``` java
// DoubleScreenMovePointerEventListener.java
case MotionEvent.ACTION_MOVE:
...
    mPoint0LastX = (int)motionEvent.getX(0);
mPoint1LastX = (int)motionEvent.getX(1);
if (shouldBeginMove) {
    int deltaX = mPoint0LastX - mPoint0FirstX;
    mDisplayContent.startMoveCurrentScreenTask(detaX,0);
}

public void startMoveCurrentScreenTask(int x,int y) { 
    if (copyTaskBuffer!= null) {//真正调用这个moveCurrentScreenTask相关业务操作
        moveCurrentScreenTask(mWmService.mTransactionFactory.get(), mirrorTaskSc, x, y);
    }
}

void moveCurrentScreenTask(SurfaceControl.Transaction t,SurfaceControl mirrorTaskSc, int x, int y) {
    // t.setPosition(surfaceControl, x, y);
    float[] mTmpFloats = new float[9];
    Matrix outMatrix = new Matrix();

    if (realTaskSc != null) {
        outMatrix.reset(); 
        //对屏幕2的新task进行坐标平移操作，对屏幕大小一样的则直接就是在个偏移-（width - offsetX） = offsetX - width，屏幕大小不一样则需要进行对应scale操作
        outMatrix.postTranslate(x - mOtherDisplayContent.getDisplayInfo().logicalWidth, y);
        t.show(realTaskSc);
        t.setMatrix(realTaskSc, outMatrix, mTmpFloats);//给对应的task图层设置对应的matrix
    }
    outMatrix.reset();
    float offsetXMainDisplay = x + (getDisplayInfo().logicalWidth - x );//这个部分属于屏幕1镜像图层偏移坐标，这里为啥会是这样，不是应该只要x这个偏移就行么？
    //这里其实就和前面说的镜像图层实际挂了task，task再屏幕2进行了坐标改变，当然也会影响屏幕1的镜像图层效果，所以(getDisplayInfo().logicalWidth - x )是为了消除屏幕2 task的坐标偏移带来的影响，最后屏幕1上的镜像图层偏移量就只是x
    outMatrix.postTranslate(offsetXMainDisplay, y);
    t.setMatrix(mirrorTaskSc,outMatrix,mTmpFloats);
    t.show(mirrorTaskSc);
    t.apply();
}
```

- 对 realTaskSc，偏移 width - x
- 对 mirrorTaskSc，偏移 x，这里要注意，因为 mirrorSurface() 读取的是源 SurfaceControl 已经经过变换的合成输出结果，所以要先补偿前面 realTaskSc 的偏移，再加上 x，那么效果才是在屏幕 1 中真实偏移 x

### 全局双指移动策略监听

``` java

ValueAnimator animotor = ValueAnimator.ofInt(start, end);
animator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
    @Override
    public void onAnimationUpdate(ValueAnimator animation) {
        int currentX = animation.getAnimatedValue();
    }
});
animator.setInterpolator(new AccelerateInterpolator(1.0f));
animator.setDuration(500);
animator.start();
```



### 7 问题

#### 黑屏 - 8

当屏幕2还没有完全显示的时候，未显示的部分会黑屏

原因：task 已经移动到了屏幕2，所以会覆盖屏幕2之前的 task，

> 如果在面试中被问到“拖动一个 Task/Activity 到另一屏幕时出现半黑屏，`mLaunchTaskBehind` 可以避免”的现象，可以按照 **逻辑清晰、分步骤、突出原理** 的方式回答。下面给你一个示例结构：



**问题描述**：

> 当从屏幕1拖动一个 Task/Activity 到屏幕2时，拖动过程中屏幕2一半显示拖动的界面，另一半是黑屏，为什么？设置 `mLaunchTaskBehind=true` 后就不会黑屏了。

**回答步骤**：

1. **现象分析**
    - 拖动过程中，Task/Activity 的 Surface 正在移动到屏幕2。
    - 屏幕2上目标 Task Surface 还没有完全覆盖整个显示区域。
    - 拖动 Surface 覆盖了部分区域，剩余区域没有其他内容显示，因此呈现黑色。
2. **系统机制原理**
    - Android WMS/SurfaceFlinger 对 Task/Activity 的显示使用 **Surface 层级合成**。
    - `moveRootTaskToDisplay()` 只是把 Task 逻辑上移到目标 Display，Surface 还需要通过动画移动到最终位置。
    - <font color=red>**在移动过程中，未被拖动覆盖的区域没有其他可绘制内容，所以显示黑色。**</font>
3. **mLaunchTaskBehind 的作用**
    - 设置 `ActivityRecord.mLaunchTaskBehind = true` 时，Task 不会立即覆盖目标 Display。
    - 屏幕2继续显示原有界面，拖动 Surface 在其上滑动时，不会出现黑色空白。
    - 从视觉上避免半黑屏现象。
4. **总结**
    - 半黑屏是**Surface 合成和 Task 移动顺序导致的视觉效果**，不是绘制延迟。
    - 解决方法可以是：
        1. 使用 `mLaunchTaskBehind` 保留原 Task 界面；
        2. 或者拖动 Surface 覆盖整个目标显示区域。

#### 闪屏 - 12



------

### 答题技巧

- **逻辑清晰**：先现象 → 再原因 → 再原理 → 再解决方案。
- **突出理解深度**：说明这是 WMS/Surface 层级和 Task 移动顺序的问题，而不是简单的绘制延迟。
- **可适当画图辅助说明**：如果允许，可以画一个 Task/Surface 层级示意，直观显示拖动 Surface + 黑屏区域的关系。

``` java

ActivityRecord mCurrentRecord = null;
void ensureOtherDisplayActivityVisible(DisplayContent other) {//注意这个方法很关键，这里会让activity底下的activity也跟着显示出来，即2个activity同时显示不然拖动task时候底部只能黑屏体验很差
    ActivityRecord otherTopActivity = other.getTopActivity(false,false);
    if (otherTopActivity != null) {
        android.util.Log.i("test33","ensureOtherDisplayActivityVisible otherTopActivity = " + otherTopActivity);
        otherTopActivity.mLaunchTaskBehind = true;
        mCurrentRecord = otherTopActivity;
    }
}
void resetState() { //恢复正常状态，让mLaunchTaskBehind变成false
    if (mCurrentRecord != null) {
        mCurrentRecord.mLaunchTaskBehind =  false;
        mRootWindowContainer.ensureActivitiesVisible(null, 0, PRESERVE_WINDOWS);
    }
}
```



#### 松手自动移动 - 9





#### 部分冻屏 - 10

dumpsys SurfaceFlinger 没有看到图层覆盖，继续看 dumpsys input(查看  Input dispatcher state 部分)

查看 Windows 信息看到有我们自己的图层

查看 InputDispatcher 的日志，findTouchedWindowTargets() 中的日志



# 9 Perfetto

``` shell
# 下载脚本
https://github.com/google/perfetto/blob/main/tools/record_android_trace
# 或者
https://raw.githubusercontent.com/google/perfetto/master/tools/record_android_trace
# 抓取命令
record_android_trace -o /h/Android/traces/$(date +%Y%m%d_%H%M%S)_trace_file.perfetto-trace -t 5s -b 32mb sched freq idle am wm gfx view binder_driver hal dalvik camera input res memory gfx view wm am ss video camera hal res sync idle binder_driver binder_lock ss
```

# 10 ANR 补充

[思维导图](https://www.processon.com/view/link/62430e020e3e74078d564070)

什么场景会出现 ANR？

- 常规：onCreate()/Sleep()
- 非常规
    - 数据问题导致导致的 ANR
        - 数据过大，频繁GC会导致线程暂停，处理时间拉长
    - 锁的问题导致的 ANR
        - 线程死锁
    - binder 通信数据量过大



如何分析 ANR 问题

- 通过日志确认 ANR 类型

    - input 事件
    - 服务
    - 广播

- 看 trace 文件第一行时间节点前后 CPU 使用状况（事件被拉长，要么 CPU 锁了，要么 GC，STW 产生导致线程执行时间拖长），事故点前后的运行状态

- 看 trace 中的主线程状态（假如 Runnable）

    ![ANR_Thread_State](../../images/2025/ANR_Thread_State.png)

    

- 查看事故点代码（和 ANR 进程相关的堆栈）

- 看 CPU

    - 看总 CPU 的利用率
        - 其他进程高，自己低——系统资源造成
        - 自己高（IO 频繁，死循环，上锁）
    - CPU 效率，40% 以下基本都算正常，如果正常，排除掉 IO 问题（write/read/database/内核态过高 等考虑 IO 问题）

- 看GC

    - Concurrent GC

        ![Concurrent GC](../../images/2025/ANR_GC.png)

    - Young GC

    - Total GC time

        ![TotalGC](../../images/2025/ANR_TotalGC.png)

    - 意味着对象回收率不高，GC次数过多，造成 STW 559 次，GC造成的时间很长，说明有对象频繁创建代码存在，回收不掉，内存泄漏

        

    总结

    - 判定是否为 CPU 问题
        - 死锁
    - 如果非CPU 就定位 GC 问题
    - GC 问题直接去看 trace 上面的 GC 分析信息
        - 常规 GC 导致的问题，就是有频繁的对象生产动作
        - 常规少量数据不会出现这个问题，但是数据量异常会引发连锁反应
        - 根本原因是卡顿



采集关键信息

- 时间/类型/线程状态/事故点

- CPU状态：通过时间去找 mainlog 看 CPU 运行状态

- 根据线程+CPU状态判断大致问题

    - 是 CPU 问题

    - 非CPU问题，看GC处理信息

- GC 处理信息
    - 结合代码和出事的原因处理代码



面试角度如何处理 ANR 问题

- 确定时间
- 确定类型
- 确定主线程状态
- 查看时间节点的 CPU 状态
- 非 CPU 问题，看 GC 的处理信息看是否 GC 问题（值上百考虑有问题）

## 冷启动优化

~~starting window 移除~~

点击图标时的 down 和 up

# 11 Shell Transition



# 10 面试题

### Activity 启动流程



### WMS 相关

#### 层级结构树的理解

[层级结构树博客](https://juejin.cn/post/7339827208086896676)

- 对窗口层级树的理解
    - Android 的窗口层级树是 system_server 中由 WindowManagerService 维护的一套以 `WindowContainer` 为核心的层级结构，用于描述窗口在系统中的逻辑归属、层级关系和管理策略。
    - 它并不直接参与图形绘制，而是负责将 Activity、Task、Display、Window 等抽象成一棵统一的管理树，为窗口的 Z-order、动画、转场、多 Display、分屏等行为提供决策基础。
    - 真正的图形合成发生在 SurfaceFlinger 中，两者通过 SurfaceControl 建立映射，但窗口层级树本身属于逻辑管理层。
- 解决了什么问题
    - 逻辑归属问题
        - Window 属于哪个 Activity / Task / Display
        - 系统窗口与应用窗口如何区分
    - 层级与策略问题
        - Z-order 的统一决策
        - WindowType + DisplayPolicy 的集中管理
    - 跨场景一致性问题
        - 多 Display
        - Freeform / Split / PiP
        - 车载多屏、多用户
- 优点
    - 统一抽象，避免特例逻辑爆炸：所有窗口相关对象都抽象为 WindowContainer，通过父子关系表达语义，避免为 Task、Activity、SystemWindow 分别写独立逻辑。（统一抽象，可扩展性）
    -  将“逻辑管理”和“图形合成”彻底解耦：system_server 只关心窗口语义和策略，SurfaceFlinger 只关心 Layer 合成，两者通过 SurfaceControl 解耦。
    - 天然支持复杂动画和转场：通过在 Task、DisplayArea 等节点引入 SurfaceControl leash，可以在不影响子窗口 buffer 的情况下统一做动画和裁剪
- 演进方向
    - 在 Android 10-12 经历了最大的重构，引入了 WindowContainer 统一模型，引入 DisplayArea，Task，Transition 框架等，未来的方向是“能力增强”，而不是“推翻重来”，不会再频繁发生结构性变化
- 精简回答：
- Android 的窗口层级树是 system_server 中用于管理窗口逻辑关系的统一模型，以 WindowContainer 为核心，解决了窗口归属、层级决策和多窗口场景的问题。
- 它与 SurfaceFlinger 的 Layer 树解耦，通过 SurfaceControl 进行映射，从而同时保证了灵活性和性能。
- 这套模型在 Android 10 之后已经趋于稳定，未来更多是能力增强而不是结构性重构，尤其适合多 Display 和车载场景。

#### system_server 中的窗口层级树和 SF 中的层级树有什么关系

- system_server 中的窗口层级树是“逻辑窗口管理树”，用于决定窗口的归属、层级、策略和生命周期；
     SurfaceFlinger 中的层级树是“图形合成树”，用于管理 Layer 及其 buffer 的合成与显示。
- 两者并非一一对应，而是通过 SurfaceControl 建立映射关系，
     - 多屏互动的 mirror 图层，没有在 WMS 中创建对应的 WindowContainer
     - 

- Winscope 中看到的 Task/ActivityRecord/WindowToken 只是 Layer 的名字，因为 system_server 在创建 SurfaceControl/Layer 时将 WindowContainer 的名字传给了 SF。
- <font color=red>**窗口层级树上的任意节点其实都是继承了 WindowContainer 类，WindowContainer 在创建或者添加时候都会产生一个对应的 SurfaceControl，而 SurfaceControl 又会触发到 SurfaceFlinger 创建一 一对应的 Layer，而且 WindowContainer 的层级结构关系都会一 一影响自己 SurfaceControl，所以一般在SurfaceFlinger也会有一个和wms一 一对应Layer结构树。**</font>

#### 什么情况、分析什么问题会看层级结构树，命令是什么

> 当问题已经超出单个 Window 或单个 Activity 的范围，而涉及“归属、层级、父子关系、跨 Display 或动画控制”时，就必须看窗口层级结构树。如果问题还能用 View 层、单窗口参数解释，一般**不需要**看层级树。
>
> 实际排查时，我通常会同时抓 WMS Trace 和 SF Trace，用 Winscope 对齐两棵树，先确认窗口在逻辑层是否在正确的位置，再确认 SurfaceControl 是否映射到正确的 Layer。
>
> 当问题已经涉及窗口的归属、层级、跨 Display 或动画控制，而不是单个窗口的绘制细节时，就必须查看窗口层级结构树；层级树问题往往决定了窗口“在哪里、被谁管理、是否能被正确显示”，这是定位复杂窗口问题的关键入口。
>
> 命令：adb shell dumpsys activity containers

核心场景

- 窗口显示异常，但并非简单“没绘制”，这类问题往往不是 buffer 问题，而是窗口被放在了**错误的父容器或 DisplayArea** 下，或者 Z-order 不符合预期。
    - 窗口存在，但不可见
    - 窗口被遮挡
    - 窗口只显示一部分
    - 拖拽或动画过程中出现黑屏 / 空洞
    - 要看什么：
        - WindowState 挂在哪个 WindowToken
        - Task 属于哪个 TaskDisplayArea
        - DisplayArea 顺序是否正确
        - 是否被错误 reparent
- System Window / App Window 层级不符合预期
    - IME 被应用遮挡
    - StatusBar / NavigationBar 显示异常
    - 悬浮窗层级不对
    - 车载 HMI 系统窗口被 App 覆盖
- 多窗口 / 分屏 / PiP 行为异常
    - 分屏后某个窗口消失
    - PiP 窗口无法置顶
    - Freeform 窗口被裁剪

- 跨 Display 问题
    - 拖拽到第二块屏出现半黑屏
    - 窗口跑到错误的屏幕

- 动画 / Transition / RemoteAnimation 异常：动画往往是挂在 **Task / DisplayArea leash** 上，如果层级不对，动画效果就会“断层”。
    - 动画只动了一半
    - 动画结束后窗口消失
    - 画面撕裂或短暂黑屏
    - leash SurfaceControl 是否存在，leash 是否在正确的父节点


#### leash 是什么

leash 层在 WMS 的窗口层级树中，对应的是某个 `WindowContainer` 自身持有的 `SurfaceControl`；
 在 SurfaceFlinger 的层级树中，对应的是一个 `ContainerLayer`，用于承载该 WindowContainer 及其子窗口的统一动画与变换。（注意这里说的是 ContainerLayer，所以 WindowState 没有 leash，因为 WindowState 持有的是 BufferStateLayer）

#### 有哪些调试方法及命令

windowstate 状态，窗口是否存在/可见，焦点

``` shell
dumpsys window windows
# 重点关注字段
mCurrentFocus/mFocusedApp/
```

查看 Activity / Task 状态，Task 是否存在、是否在前台

``` shell
adb shell dumpsys activity activities
adb shell dumpsys activity top
adb shell dumpsys SurfaceFlinger
adb shell dumpsys SurfaceFlinger --list
adb shell dumpsys SurfaceFlinger --display-id
# 是否有 DisplayContent, Window 是否挂在错误 Display
adb shell dumpsys display
adb shell dumpsys window displays
```

抓取 Winscope

ProtoLog

#### 如何在层级结构树中添加一个层级

- 根据类型添加层级，添加一个37
- 返回最大层级树改大

#### 动画导致的层级错乱如何分析

当动画导致窗口层级错乱时，我的分析流程是：

1. 首先确认动画目标的 WindowContainer 和对应的 leash SurfaceControl；
2. 对照 WMS 层级树，确保 Task / Activity / WindowToken 层级正确，leash 挂载在正确父节点；
3. 对照 SurfaceFlinger 的 ContainerLayer 树，确认动画 Layer 和子 Layer 都在正确 parent 下；
4. 检查 Transaction 提交是否完整，确保所有窗口的变换、alpha、crop 一次性应用；
5. 对比动画前后层级快照，排查中间态 reparent 或 leash 错误，找出错乱原因。
     通过这种方法，可以定位动画错乱究竟是 WMS 层逻辑错误，还是 SF 层渲染顺序问题，或者 Transaction 没提交完全。

### Input 模块

Key 事件的流转

IQ/OQ/WQ

事件分发是否会派发给多个进程

### SF 模块

为什么要有 3 个 vsync/vsync-sf/vsync-app

SF 层面可以直接创建一个 Layer 吗

### 黑屏/闪屏/冻屏

冻屏

使用 dumpsys window windows 查看窗口信息，或者使用 dumpsys SurfaceFlinger 查看 HWC 信息

APPLICATION_TYPE_OVERLAY 的窗口，dumpsys 信息查看到窗口之后，在 ViewRootImpl.setView() 中根据包名和 type 类型进行拦截（ActivityThread.currentPackageName() 接口直接获取包名信息）。



黑屏

黑屏本质上是**“有窗口，没内容”**或**“连窗口都没创建成功”**。

- **启动黑屏：** 检查 `onCreate` 是否有耗时操作阻塞了第一帧；
- **运行黑屏：** 确认 `setContentView` 是否被调用，或者 View 树是否因为异常逻辑被设置为 `INVISIBLE/GONE`。
- **焦点检查：** 使用 `adb shell dumpsys window windows | grep mCurrentFocus`。如果焦点不在当前 Activity，说明被透明窗口挡住了。



冻屏

冻屏本质上是**“有内容，没响应”**。

- **主线程死锁：** 典型的“子线程持 A 锁等主线程，主线程持 B 锁等子线程”。
- **Binder 线程池耗尽：** App 无法响应系统的 `lifecycle` 指令。
- **输入分发超时：** 使用 `dumpsys input` 检查事件是否堆积在 `InputDispatcher`。
- **核心工具：** **`kill -3` (SIGQUIT)** 生成 Trace 文件。
    - 通过 Trace 查看主线程状态：`MONITOR`（等锁）、`WAITING`（等 IO/信号量）。



闪屏

闪屏本质上是**“中间状态的错误展示”**。

- **白闪/黑闪：** Activity 跳转时，由于两个 Activity 窗口动画不衔接，或者底层 Activity 销毁过快露出背景。



[FWK 面经](https://bbs.csdn.net/topics/616075900)

### MVC/MVP/MVVM

MVC

- **View 持有 Controller：** 因为 Activity 本身就是 Controller，所以它们是强耦合的（同为一个类）。
- **Controller 持有 View：** 同上。
- **Controller 持有 Model：** Controller 需要直接调用 Model 进行数据获取或存储。
- **Model 持有 View：** **这是 MVC 的痛点。** 在经典 MVC 中，Model 变化后会通过回调或观察者模式通知 View。在 Android 中，这常导致 Model 间接持有 Activity 引用，处理不当极易导致内存泄漏。

MVP

MVP 的核心是**通过接口隔离**，将 View 层与逻辑层彻底解耦。

- **View 持有 Presenter：** Activity 持有 Presenter 的强引用。
- **Presenter 持有 View：** **核心点。** Presenter 持有的是 View 的 **接口引用**（如 `IMyView`，P 对 V 的持有通常是**持久**的贯穿整个页面生命周期）。
    - *注意：* 虽然是接口引用，但在运行时它指向的是具体的 Activity。如果 Presenter 内部有异步任务且没有在 `onDestroy` 中解绑，就会导致内存泄漏。
- **Presenter 持有 Model：** Presenter 持有 Model 的接口，用于处理业务逻辑。
- **Model：** 不持有任何人的引用（实际上持有 P 的引用，只不过这个持有是瞬时的，异步回调完就丢弃了），只负责提供数据。

MVVM

MVVM 的核心是**单向依赖**和**数据驱动**。

- **View 持有 ViewModel：** Activity 持有 ViewModel 的强引用。
- **ViewModel 持有 View：** **绝对不持有。**
    - 这是 MVVM 与 MVP 的最大区别。ViewModel 绝对不能持有任何 `Context` 或 `View` 的引用。
    - ViewModel 通过暴露 `LiveData` 或 `Flow` 让 View 订阅，实现“数据找人”而非“人找数据”。
- **ViewModel 持有 Model：** 通过 Repository（仓库）持有数据层引用。
- **Model：** 依然是孤立的，只负责数据生产。

总结

- 传统 MVC 中，V 和 C 互相持有，C 持有 M，M 持有 V，在 Android 中的 MVC，V 和 C 都是 Activity，C 也持有 M，M 也持有 V；
- MVP 中，V 持有 P，P 持有 V 的接口引用，P 持有 M，M 瞬时持有 P 的接口引用（可以理解为不持有），解决了 MVC 中 M 持有 V 的问题；
- MVVM 中，V 持有 VM，VM 持有 M，VM 通过暴露 Livedata 让 V 订阅，解决了 MVP 中 P 持有 V 的问题； 

### Lifecycle 总结

> Lifecycle 是通过 Activity/Fragment 主动上报生命周期事件， 由 LifecycleRegistry 维护状态并通知 Observer 的一套生命周期感知机制。

- Android Lifecycle 是一套**生命周期事件分发机制**。

- Activity / Fragment 在系统生命周期回调中，把自身状态变化同步给 `LifecycleRegistry`

- `LifecycleRegistry` 维护一个**状态机**，并把对应事件**按顺序分发给注册的 Observer**。

- Observer 不再直接依赖 Activity 回调，而是被动感知生命周期，从而避免生命周期错用和内存泄漏。

为什么说它是状态机？

> 因为 Lifecycle 内部不是简单回调，而是维护当前 State，事件驱动状态流转，保证 Observer 的状态不会乱序或非法回退。

它和直接在 Activity 写代码的区别？

> 把生命周期管理从业务逻辑中抽离出来， Observer 只关心“何时可用、何时不可用”，不关心宿主细节。

Lifecycle/ViewModel/LiveData

> Lifecycle 解决“什么时候能用”，
> ViewModel 解决“数据放哪”，
> LiveData 解决“怎么安全通知”。

<font color=red>**回答思路**</font>

- 本质：Lifecycle 的本质是**观察者模式**，核心组件包括 **LifecycleOwner**（生命周期持有者）和 **LifecycleRegistry**（状态管理器）。
- 原理：通过一个无 UI 的 ReportFragment 注入到 Activity 中，用来捕获生命周期的变化，当 ReportFragment 感知到事件时，就会调用 LifecycleRegistry 的 handleLifecycleEvent 方法，LR 中维护了一个状态机，每当状态变化，就会遍历所有观察者，如果状态不同步，就会补发事件直到状态对齐；
- 价值：业务代码不再挤在 Activity 的回调里，比如如果不使用，就要在各个生命周期中手动触发生命周期的通知；

### LiveData 总结

<font color=red>**回答思路**</font>

- 本质：LiveData 是一种可观察的数据持有者类，与普通观察者模式不同的是，它具有生命周期感知能力，也就是说它 **只会在组件处于活跃状态时分发数据更新**，并在组件销毁时自动清理；
- 原理：调用 `observe(owner, observer)` 时，LiveData 将观察者包装成一个 `LifecycleBoundObserver`，它实现了 `LifecycleEventObserver` 接口，从而能挂载到宿主的生命周期上；每次数据更新，LiveData 会检查宿主状态，只有在 STARTED 或 RESUMED 时才会触发 Observer 的回调；当感知到生命周期变为 `DESTROYED` 时，LiveData 会自动调用 `removeObserver`；
- LiveData 内部维护一个 `mVersion` 版本号。当新观察者订阅时，如果观察者的版本号小于 LiveData 的版本号，它会立即收到最后一次缓存的数据。
- `postValue()` 可以在子线程调用，它内部通过 `Handler` 将任务抛到主线程执行，且在主线程处理前，多次调用 `postValue` 只会保留最后一次的值。

### DataBinding 总结

只有 LiveData（手动搬运）

- **XML:** 普通写法。
- **Activity:** 1. 找到 TextView。 2. 定义 Observer 闭包。 3. 调用 `observe` 方法。 4. 手动处理 null 判断或类型转换。

LiveData + DataBinding（自动驾驶）

- **XML:** 写上 `@={viewModel.name}`。

- **Activity:** 1. 绑定布局。 2. 设置 `lifecycleOwner`。 3. 把 `viewModel` 传给 `binding`。

    ``` java
    // 绑定布局
    val binding: ActivityMainBinding = DataBindingUtil.setContentView(this, R.layout.activity_main)
    // 【关键步】：建立生命周期关联
    binding.lifecycleOwner = this 
    // 给变量赋值
    binding.viewModel = myViewModel
    ```

    当设置了 `binding.lifecycleOwner = this` 之后，DataBinding 生成的代码（例如 `ActivityMainBindingImpl`）会执行以下逻辑：

    1. **自动识别：** 它发现你在 XML 里引用了 `viewModel.name`。
    2. **类型检查：** 它发现 `name` 是一个 `LiveData` 类型。
    3. **替你代劳：** 它会自动在内部调用类似 `viewModel.name.observe(lifecycleOwner, ...)` 的方法。
    4. **自动更新：** 当 `LiveData` 变化时，它生成的代码会自动调用 `textView.setText()`。

- **结果：** 以后无论你修改了 `viewModel.name` 多少次，UI 都会自动跟着变，Activity 里的代码 **永远不需要改动**。

### Dagger2 总结

<font color=red>**回答思路**</font>

- 本质：Dagger2 是一款基于**编译时注解**的依赖注入框架。它在编译阶段自动生成负责创建和注入对象的代码，从而避免了反射带来的性能损耗，并能在编译期发现依赖配置错误（如循环依赖）。
- 核心组件
    - **Dependency（被依赖的对象）：** 通过 `@Inject` 构造函数或 `@Module` 中的 `@Provides` 方法定义。
    - **Consumer（依赖的需求方）：** 通过 `@Inject` 标记成员变量来声明需要注入。
    - **Component（注入器/桥梁）：** 这是一个接口，Dagger 编译器会生成该接口的实现类（如 `DaggerYourComponent`），它内部持有一个‘工厂模式’生成的列表，负责把对象塞进需求方。
- 运行机制
    - **编译期生成代码：** 编译器扫描注解，为每个需要实例化的类生成对应的 **Factory（工厂类）**，并为 Component 生成实现类，在内部构建一套完整的**依赖图谱**。
    - **运行期注入：** 当我们调用 `component.inject(this)` 时，Dagger 会直接调用生成的代码，通过 new 对象或调用 Provider 的方式直接赋值给目标变量。
- “Dagger2 就是通过 **APT（注解处理器）** 在编译时把‘手动 new 对象’的过程自动化了，利用**生成的 Component 实现类**作为中转站，将依赖对象精确地填装到目标类中。



### 缓存复用

- 复用的是什么？复用的是 ViewHolder（一个 Item）

- mCachedViews：大小是2
- RecycledViewPoll
-  

### ThreadLocal

在调用 Looper.prepare() 的时候，会设置 Looper，

``` java
// Looper.java 源码简化
static final ThreadLocal<Looper> sThreadLocal = new ThreadLocal<Looper>();

private static void prepare(boolean quitAllowed) {
    // 1. 检查当前线程是否已经有 Looper 了
    if (sThreadLocal.get() != null) {
        throw new RuntimeException("Only one Looper may be created per thread");
    }
    // 2. 创建 Looper 并存入当前线程的私有存储空间
    sThreadLocal.set(new Looper(quitAllowed));
}

public static @Nullable Looper myLooper() {
    // 3. 获取当前线程专属的 Looper
    return sThreadLocal.get();
}
```

**唯一性保障：** 确保每个线程只创建一套 `Looper/MessageQueue` 体系。

**线程私有化：** 实现了 `Looper` 对象的线程本地化存储，避免了跨线程访问的竞争。

**代码简洁：** 让开发者在线程任何位置通过 `Looper.myLooper()` 都能轻松获取当前线程的 Looper，而不需要在方法间层层传递参数。

ThreadLocal 的内部原理

`ThreadLocal` 并不是存数据的地方，它更像是一个**“Key”**。

- 每个线程（`Thread` 类）内部都有一个成员变量：`threadLocals`，它的类型是 `ThreadLocalMap`。
- `ThreadLocalMap` 是一个定制的哈希表，它的 **Key 是 `ThreadLocal` 对象本身**，**Value 是你想要存的对象（Looper）**。

### Handler 内存泄漏问题

如果 Handler 是 Activity 的**非静态内部类**，它会隐式持有外部类 Activity 的引用，只要 Message 还没被处理（比如你发了一个延迟 10 分钟的消息），这条引用链就会一直存在。当你关闭 Activity 时，由于 Looper 还在引用这个 Message，导致 Activity 无法被 GC 回收，从而发生内存泄漏。

如何解决：

- 方法 A：静态内部类 + 弱引用 (WeakReference)

    - 静态内部类不会持有外部类的引用。如果需要调用 Activity 的方法，使用弱引用，这样当 Activity 被销毁时，GC 可以正常回收它。

- 方法 B：及时清理消息 (生命周期同步)

    - 在 Activity 销毁时（`onDestroy`），手动清空消息队列中关联的消息和任务。

        ``` java
        @Override
        protected void onDestroy() {
            super.onDestroy();
            // 移除所有回调和消息
            mHandler.removeCallbacksAndMessages(null);
        }
        ```

### 多线程编程

**为什么用？**（性能、响应）。

**有什么难点？**（原子、可见、有序）。

**用什么同步？**（synchronized, CAS, Lock, volatile）。

**在 Android 怎么管？**（线程池、HandlerThread、协程）。

**怎么避坑？**（内存泄漏、死锁、线程安全容器）。

#### 线程池

##### 创建线程的方式

- 继承 Thread
    - 缺点：单继承，继承了 Thread，就无法继承其他类了
- 实现 Runnable 接口
- 实现 Callable 接口：可以获取线程执行的返回值
- 线程池创建

为什么不推荐 Executors 创建线程

##### **`newFixedThreadPool` 和 `newSingleThreadExecutor`**

- **代码实现：** 它们使用的是 `LinkedBlockingQueue`（无界阻塞队列）。
- **致命缺陷：** 这个队列的默认容量是 `Integer.MAX_VALUE`（约 21 亿）。
- **后果：** 当请求处理任务的速度赶不上提交任务的速度时，队列会无限堆积，最终导致堆内存耗尽，触发 **OOM**。

##### **`newCachedThreadPool` 和 `newScheduledThreadPool`**

- **代码实现：** 它们将 `maximumPoolSize`（最大线程数）设置为了 `Integer.MAX_VALUE`。
- **致命缺陷：** 允许创建的线程数量几乎没有上限。
- **后果：** 每一个新任务进来，如果没有空闲线程就会创建一个新的线程。大量的线程创建会消耗大量的 CPU 资源和内存（每个线程默认分配 1MB 栈空间），最终导致 **OOM** 或系统卡死。

##### 替代方案：手动创建 `ThreadPoolExecutor`

官方和面试官更希望你直接使用 `ThreadPoolExecutor` 的构造函数，因为这样你必须显式地思考以下 **7 个核心参数**，从而实现对资源的精准控制：

``` java
// 推荐的创建方式
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    2,                      // 1. corePoolSize: 核心线程数
    5,                      // 2. maximumPoolSize: 最大线程数
    60L,                    // 3. keepAliveTime: 非核心线程闲置存活时间
    TimeUnit.SECONDS,       // 4. unit: 时间单位
    new LinkedBlockingQueue<>(100), // 5. workQueue: 有界队列，防止 OOM
    Executors.defaultThreadFactory(), // 6. threadFactory: 线程工厂
    new ThreadPoolExecutor.AbortPolicy() // 7. handler: 拒绝策略，任务满了怎么办
);
```



##### 线程池状态

- Running：线程池新建或调用 execute() 方法后，处于运行状态，能够接收新的任务
- Shutdown：调用 `shutDown()` 方法后，不再接收新任务，但是会执行已经提交到等待任务队列中的任务
- Stop：调用 `stop()` 方法后，不再接收新任务，且会中断正在处理中的任务
- Tidying：中间状态，不做任何处理
- Terminated：线程池内部的所有线程都已经终止时，线程池进入 Terminated 状态

##### Sychronized 和 ReentrantLock 区别

![Sychronized_ReentrantLock](../../images/2025/Sychronized_ReentrantLock.png)

ReentrantLock 可以是公平锁也可以是非公平锁，它们的区别在于线程在使用 `lock()` 方法加锁时：

- 如果是公平锁，会先检查 AQS 队列中是否存在线程在排队，如果有线程在排队，则当前线程也进行排队
- 如果是非公平锁，则不会去检查是否有线程在排队，而是直接竞争锁
- 不管是公平锁还是非公平锁，一旦没竞争到锁，都会进行排队，**当锁释放时，都是唤醒排在最前面的线程**，所以非公平锁只是体现在了线程加锁阶段，而没有体现在线程被唤醒阶段，简单来说就是：<font color=red>**如果是公平锁，则直接去排队，如果是非公平锁，先竞争，没竞争到再去排队**</font>

Sychronized 的锁升级过程

- 无锁
- 偏向锁
    - 只有一个线程在频繁访问同步块（绝大多数情况），锁会“偏心”于第一个访问它的线程。它会在 Mark Word 中记录该线程的 ID， 以后该线程进入和退出同步块时，不需要进行昂贵的 CAS 操作，只需简单检查一下线程 ID 是否一致。
- 轻量级锁
    - 当有**第二个线程**尝试竞争锁时（但竞争不激烈），偏向锁就会升级
    - 线程会在自己的栈帧中创建一个存放锁记录的空间（Lock Record）。 
    - 尝试使用 **CAS** 将对象的 Mark Word 指向自己的 Lock Record。 
    - 如果成功，获得锁。如果失败，说明存在竞争，线程会进行**自旋（Self-Spinning）**（即不停地循环尝试获取锁，而不挂起 CPU）
- 重量级锁
    - **触发：** 1. 自旋次数过多（长时间拿不到锁）。 2. 或者是多个线程同时激烈竞争。
    - **原理：** 锁标志位变为 `10`。此时 Mark Word 指向的是堆中的 **Monitor 对象**。
    - **表现：** 未获取到锁的线程会被**阻塞（Blocked）**，进入等待队列，交由操作系统管理。



#### ThreadLocal

ThreadLocal 底层是通过 ThreadLocalMap 来实现的，每个 Thread 对象中都存在一个 ThreadLocalMap，Map 的 key 为 ThreadLocal 对象，value 为需要缓存的值；

![image-20260119142132653](../../images/2025/ThreadLocal.png)

线程池中使用 ThreadLocal 内存泄漏

![image-20260119142812166](../../images/2025/image-20260119142812166.png)



当一个共享变量是共享的，但是需要每个线程互不影响，相互隔离，就可以使用 ThreadLocal



#### volatile

- 防止指令重排（比如 单例模式 中的双重检测锁，`instance = new Singleton()` 分为：1.分配空间、2.初始化、3.赋值引用。重排可能导致顺序变成 **1-3-2**。如果此时另一个线程进来，会发现 `instance` 不为 null，但其实它还没初始化完成（对象还是个半成品），直接使用会导致崩溃。）
- 内存可见性：一旦变量被修改，JVM 会强制要求该线程立即将新值刷新到**主内存**。同时，其他线程在读取该变量时，其本地缓存会被标记为无效，必须直接从主内存获取最新值。
- 不保证原子性：比如 `i++` 是由‘读-改-写’三个独立步骤组成的。`volatile` 只能保证你‘读’到的是最新的，但如果两个线程同时读到了最新的 10，并各自加 1 得到 11 往回写，最终结果就是 11 而不是 12。这种复合操作必须使用 `AtomicInteger` 或加锁。



Android 多线程

多线程方式

- Thread，Runnable
    - Android 中创建线程最基本的两种方法，用到了 Thread 类和 Runnable 接口，一般和 Handler 一起使用，用于线程中的通信，为了方便这种通信方式，生成了 HandlerThread 类；
- HandlerThread
    - 继承自 Thread 类
- AsyncTask
- Executor
- IntentService

### 渲染原理

