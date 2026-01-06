---
title: Android - CarService
date: 2025-05-12 13:17:07
tags: CarService
categories: Android
copyright: true
password:
---

> Android CarService
>
> 源码：Android U

<!--more-->

模块说明

- packages/services/Car/service：
  - 编译产物是 `system/priv-app/CarServiceUpdatableNonModule/CarServiceUpdatableNonModule.apk`
  - 包名 `com.android.car.updatable`，但是不作为单独的进程，而是由 CarService 通过 ClassLoader 加载其中的代码
- packages/services/Car/service-builtin：
  - 编译产物是 `system/priv-app/CarService/CarService.apk`
  - 包名是 `com.android.car`，作为单独的进程
- packages/services/Car/car-lib：编译产物是 `system/framework/android.car.jar`，是对上层 Application 提供的 sdk



## CarService 启动流程

### 时序图

``` mermaid
sequenceDiagram
autonumber
%% zygote 进程
box transparent zygote
participant ZygoteInit
end

%% system_server 进程
box transparent system_server
participant SystemServer
participant SystemServiceManager
participant CarServiceHelperService
participant CarServiceHelperServiceUpdatableImpl
participant SystemServer
end

%% com.android.car 进程
%% packages/services/Car/service-builtin
box transparent com.android.car
participant CarService
participant ServiceProxy
end

%% 同样属于 com.android.car 进程
%% packages/services/Car/service
box transparent com.android.car.updatable
participant CarServiceImpl
participant ICarImpl
participant CarSystemService
participant CarPropertyService
participant PropertyHalService
end

ZygoteInit -->> SystemServer:main()
SystemServer ->> SystemServer:run()
SystemServer ->> SystemServer:startOtherServices()
%% Note over SystemServiceManager:根据className反射获取Class
SystemServer ->> SystemServiceManager:startService(CAR_SERVICE_HELPER_SERVICE_CLASS)
%% Note over SystemServiceManager:根据Class反射获取构造方法并创建对象
SystemServiceManager ->> SystemServiceManager:startService(Class<T>)
SystemServiceManager ->> SystemServiceManager:startService(CarServiceHelperService)
SystemServiceManager ->> CarServiceHelperService:onStart()
CarServiceHelperService ->> CarServiceHelperServiceUpdatableImpl:onStart()

%% 根据包名 com.android.car 查找 Action(android.car.ICar)，对应的是 CarService，再通过 bindService 启动 CarService
CarServiceHelperServiceUpdatableImpl ->> CarService:CarService()
%% 调用父类 ServiceProxy 的构造函数并传入参数 "com.android.car.CarServiceImpl"
CarService ->> ServiceProxy:ServiceProxy()
ServiceProxy ->> ServiceProxy:onCreate()

%% 根据 ClassName 反射获取 CarServiceImpl 对象
ServiceProxy ->> ServiceProxy:init()
ServiceProxy ->> CarServiceImpl:onCreate()
ICarImpl ->> ICarImpl:ICarImpl()
%% 创建各个 CarXXXService 以及 VehicleHal 对象，并添加到 CarSystemService[] mAllServices 中
ICarImpl ->> ICarImpl:constructWithTrace()
CarServiceImpl ->> ICarImpl:init()
Note over ICarImpl,CarSystemService:对 mAllServices 逐个执行 init()
%% 以 CarPropertyService 为例
ICarImpl ->> CarPropertyService:init()
Note over CarPropertyService,PropertyHalService:注册Listener监听属性值变化
CarPropertyService ->> PropertyHalService:setPropertyHalListener()
```

### 总结

**system_server 进程**

- 通过 CAR_SERVICE_HELPER_SERVICE_CLASS 反射获取 CarServiceHelperService 对象，并调用 `CarServiceHelperServiceUpdatableImpl.onStart()` 里的 bindService() 找到并启动 CarService

**com.android.car**

- CarService 的父类是 ServiceProxy，CarService 启动后调用父类 ServiceProxy 通过 ClassLoader 加载 com.android.car.updatable 中的代码
- 反射获取到 CarServiceImpl 对象并执行 `onCreate()`，主要做了如下操作：
  - 在其中创建了 `mICarImpl` 对象并作为 binder 返回到 `CarServiceHelperServiceUpdatableImpl.mCarServiceConnection`，把 binder 赋值给到了 `CarServiceHelperServiceUpdatableImpl.mCarServiceBinder` 
    - 创建各个 CarXXXService 以及 VehicleHal 服务端，并加入到 mAllServices 数组中
  - `mICarImpl.init()`：对 mAllServices 数组中的 Service 逐个执行 `init()` 操作





## 设置车窗示例

### 时序图

``` mermaid
sequenceDiagram
autonumber
box transparent app
participant app
end

%% car-lib
box transparent android.car.jar
participant CarPropertyManager
end

%% CarService
box transparent CarService(com.android.car.updatable)
participant CarPropertyService
participant PropertyHalService
participant VehicleHal
participant AidlVehicleStub
end

%% HAL
box transparent HAL
participant DefaultVehicleHal
participant IVehicleHardware
end

app ->> CarPropertyManager:setProperty()
Note over CarPropertyManager, CarPropertyService:---> AIDL
CarPropertyManager ->> CarPropertyService:setProperty()
CarPropertyService ->> PropertyHalService:setProperty()
PropertyHalService ->> VehicleHal:set()
VehicleHal ->> VehicleHal:setValueWithRetry()
VehicleHal ->> AidlVehicleStub:set()
AidlVehicleStub ->> AidlVehicleStub:getOrSetSync()
AidlVehicleStub ->> AidlVehicleStub:AsyncSetRequestsHandler.sendRequestsToVhal()
Note over AidlVehicleStub, DefaultVehicleHal:---> AIDL
AidlVehicleStub ->> DefaultVehicleHal:setValues()
DefaultVehicleHal ->> IVehicleHardware:setValues()
IVehicleHardware ->> Kernel:syscall()
Kernel ->> WindowECU:CAN
```



### 总结

1. **APP 调用 `CarPropertyManager.setProperty()` (Java)**

   - **进程:** APP 自己的进程。
   - 你的 Android 应用程序通过 Android 框架层提供的 `CarPropertyManager` API 发起请求，希望设置某个车辆属性（例如，`VEHICLE_PROPERTY_WINDOW_POS`）。

2. **`CarPropertyManager` 通过 Binder IPC 调用 `ICarProperty.setProperty()` (Java)**

   - **进程:** APP 进程 -> `CarService` 进程。
   - `CarPropertyManager` 是一个客户端代理。它通过 **Binder IPC** 与运行在 **`CarService` 进程**中的 `CarPropertyService` 进行通信。`ICarProperty` 是它们之间定义的 AIDL 接口。

3. **`CarPropertyService` (位于 `packages/services/Car/service/src/com/android/car/CarPropertyService.java`) 接收请求并调用 `VehicleHal.java` (Java)**

   - **进程:** `CarService` 进程。
   - `CarPropertyService` 接收并处理来自应用层的请求。
   - 在 `CarPropertyService` 内部，它会持有 `com.android.car.hal.VehicleHal` 类的一个实例（该类位于 `packages/services/Car/service/src/com/android/car/hal/VehicleHal.java`）。`CarPropertyService` 会将收到的 `setProperty()` 请求转发给这个 `VehicleHal` 实例。

4. **`VehicleHal.java` 进行 Binder IPC 调用 `IVehicle.setValues()` (Java -> C++)**

   - **进程:** `CarService` 进程 -> **C++ Vehicle HAL 服务进程**。
   - `VehicleHal.java` 是 `CarService` (Java 侧) 与底层 C++ Vehicle HAL 服务 (C++ 侧) 进行 Binder 通信的桥梁。
   - `VehicleHal.java` 内部封装了 Binder 客户端代理对象。它会通过这个代理对象，将 `setProperty()` 的请求转换为对 C++ Vehicle HAL 服务中 `IVehicle.setValues()` 方法的 **Binder IPC 调用**。
   - 这一步是**跨进程、跨语言的通信**。

5. **C++ Vehicle HAL 服务接收请求并调用 `DefaultVehicleHal.setValues()` (C++)**

   - **进程:** C++ Vehicle HAL 服务进程。
   - 运行在独立进程中的 **C++ Vehicle HAL 服务**（由 OEM 实现或 AOSP 参考实现）接收到来自 `VehicleHal.java` 的 Binder 请求。
   - C++ 端的 Binder 桩代码会解析这个请求，并调用其内部 `IVehicle` 接口的实现方法，即 `DefaultVehicleHal.setValues()`。

6. **`DefaultVehicleHal` 执行通用逻辑 (C++)**

   - **进程:** C++ Vehicle HAL 服务进程。
   - `DefaultVehicleHal.cpp` 实现了 `IVehicle.aidl` 接口中的方法。它会处理传入的 `setValues()` 请求，执行通用逻辑，例如验证属性、处理错误、权限检查等。

7. **`DefaultVehicleHal` 调用 `mVehicleHardware->setValues()` (C++，同一进程内)**

   - **进程:** C++ Vehicle HAL 服务进程。
   - `DefaultVehicleHal` 对象内部持有一个 `IVehicleHardware` 接口的实例。在实际车辆产品中，这个实例是 **OEM 提供的、真实的 `IVehicleHardware` 实现**。
   - `DefaultVehicleHal` 会调用 `mVehicleHardware` 对象上的 `set()` 方法，将要设置的属性值传递给它。

8. **OEM 提供的真实 `IVehicleHardware` 实现与 CAN 总线通信 (C++)**

   - **进程:** C++ Vehicle HAL 服务进程 (通过系统调用与内核交互)。

   - 这是与硬件交互的最底层。OEM 提供的 

     ```
     IVehicleHardware
     ```

      真实实现会：

     - 将抽象的车辆属性值转换为车辆 CAN 总线或其他内部总线可以理解的**具体命令和数据包**。
     - 通过底层 Linux 驱动程序（例如 SocketCAN 驱动或其他 OEM 专有驱动）与车辆的 CAN 控制器硬件进行通信，最终发送电信号到车窗的 ECU，控制车窗电机执行升降操作。

------

**关键的进程关系：**

- **APP 进程**
- **`CarService` 进程** (包含 `CarPropertyService`, `VehicleHal.java` 等)
- **C++ Vehicle HAL 服务进程** (包含 `DefaultVehicleHal`, OEM `IVehicleHardware` 实现等)
- **Linux 内核** (包含 CAN 驱动等)













