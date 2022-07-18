---
title: Android - Binder机制(3)-addService
date: 2021-10-15 21:16:28
tags:
categories: Android
copyright: true
password:
---

> 以 AMS 注册到 servicemanager 为例讲解服务注册到 SM 的流程。

<!--more-->

# 相关代码路径

| Layer                     | path                                                         |
| ------------------------- | ------------------------------------------------------------ |
| **framework 层**          | [frameworks/base/services/core/java/com/android/server/am/ActivityManagerService.java]() |
|                           | [frameworks/base/core/java/android/os/ServiceManager.java]() |
|                           | [frameworks/base/core/java/android/os/ServiceManagerNative.java](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-12.1.0_r4/core/java/android/os/ServiceManagerNative.java) |
|                           | [frameworks/base/core/java/android/os/BinderProxy.java](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-12.1.0_r4/core/java/android/os/BinderProxy.java) |
|                           | [frameworks/base/core/java/android/os/IBinder.java](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-12.1.0_r4/core/java/android/os/IBinder.java) |
|                           | [frameworks/base/core/java/android/os/Binder.java](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-12.1.0_r4/core/java/android/os/Binder.java) |
|                           | [frameworks/base/core/java/android/os/IInterface.java](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-12.1.0_r4/core/java/android/os/IInterface.java) |
|                           | [frameworks/base/core/java/com/android/internal/os/BinderInternal.java](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-12.1.0_r4/core/java/com/android/internal/os/BinderInternal.java) |
| **JNI**                   | [frameworks/base/core/jni/android_util_Binder.cpp]()         |
|                           | frameworks/base/core/jni/android_os_Parcel.cpp               |
| **native 层**             | frameworks/native/cmds/servicemanager/main.cpp               |
|                           | [frameworks/native/libs/binder/BpBinder.cpp]()               |
|                           | frameworks/native/libs/binder/Binder.cpp                     |
|                           | frameworks/native/libs/binder/ProcessState.cpp               |
|                           | frameworks/native/libs/binder/IPCThreadState.cpp             |
|                           | frameworks/native/libs/binder/aidl/android/os/IServiceManager.aidl —— <font color=red>**生成 IServiceManager.cpp / IServiceManager.h / IServiceManager.java**</font> |
|                           | frameworks/native/libs/binder/IInterface.cpp                 |
| **kernel 层（版本5.10）** | kernel/drivers/android/binder.c                              |
|                           | kernel/include/uapi/linux/android/binder.h                   |
| **out**                   | out/soong/.intermediates/frameworks/native/libs/binder/libbinder/android_native_bridge_arm64_armv8-a_shared/gen/aidl/android/os/BnServiceManager.h |
|                           | out/soong/.intermediates/frameworks/native/libs/binder/libbinder/android_native_bridge_arm64_armv8-a_shared/gen/aidl/android/os/BnServiceManager.h |
|                           | out/soong/.intermediates/frameworks/native/libs/binder/libbinder/android_native_bridge_arm64_armv8-a_shared/gen/aidl/android/os/IServiceManager.h |
|                           | out/soong/.intermediates/frameworks/native/libs/binder/libbinder/android_native_bridge_arm64_armv8-a_shared/gen/aidl/android/os/IServiceManager.cpp |
|                           | [out/soong/.intermediates/frameworks/base/framework-minus-apex-intdefs/android_common/xref33/srcjars.xref/android/os/IServiceManager.java](https://cs.android.com/android/platform/superproject/+/master:out/soong/.intermediates/frameworks/base/framework-minus-apex-intdefs/android_common/xref33/srcjars.xref/android/os/IServiceManager.java) |

# ServiceManager.addService()

AMS 的注册是在 setSystemProcess() 函数中：

``` java
// ActivityManagerService.java
public void setSystemProcess() {
        try {
            ServiceManager.addService(Context.ACTIVITY_SERVICE, this, /* allowIsolated= */ true,
                    DUMP_FLAG_PRIORITY_CRITICAL | DUMP_FLAG_PRIORITY_NORMAL | DUMP_FLAG_PROTO);
            ServiceManager.addService(ProcessStats.SERVICE_NAME, mProcessStats);
            ServiceManager.addService("meminfo", new MemBinder(this), /* allowIsolated= */ false,
                    DUMP_FLAG_PRIORITY_HIGH);
            ServiceManager.addService("gfxinfo", new GraphicsBinder(this));
            ServiceManager.addService("dbinfo", new DbBinder(this));
            if (MONITOR_CPU_USAGE) {
                ServiceManager.addService("cpuinfo", new CpuBinder(this),
                        /* allowIsolated= */ false, DUMP_FLAG_PRIORITY_CRITICAL);
            }
            ServiceManager.addService("permission", new PermissionController(this));
            ServiceManager.addService("processinfo", new ProcessInfoService(this));
            ServiceManager.addService("cacheinfo", new CacheBinder(this));
```

通过调用 ServiceManager.addService 来注册服务到 ServiceManager。

``` java
// ServiceManager.java
	// 此处是注册 AMS，所以 name 为 ACTIVITY_SERVICE = "activity"，service 为 new ActivityManagerService()
	public static void addService(String name, IBinder service, boolean allowIsolated,
            int dumpPriority) {
        try {
            getIServiceManager().addService(name, service, allowIsolated, dumpPriority);
        } catch (RemoteException e) {
            Log.e(TAG, "error in addService", e);
        }
    }
```

## 1.1 getIServiceManager() - 获取 SMP

``` java
// ServiceManager.java
    private static IServiceManager sServiceManager;
	...
	private static IServiceManager getIServiceManager() {
        if (sServiceManager != null) {
            return sServiceManager;
        }
        // Find the service manager
        sServiceManager = ServiceManagerNative
                .asInterface(Binder.allowBlocking(BinderInternal.getContextObject()));
        return sServiceManager;
    }
```

### 1.1.1 BinderInternal.getContextObject() - 获取封装有 sm 的BpBinder 的 BinderProxy

``` java
// BinderInternal.java
public static final native IBinder getContextObject();
```

此处调用的是 native 函数，注册流程在 [Android_Binder进程间通信机制01]() 中的第六小结已经讲过，再简单说下注册流程：

app_main.main() ——> AndroidRuntime.start() ——> AndroidRuntime.startReg() ——> AndroidRuntime.register_jni_procs() ——> android_util_Binder.register_android_os_Binder() ——> android_util_Binder.int_register_android_os_BinderInternal(env) ——> android_util_Binder.gBinderInternalMethods：

``` cpp
// android_util_Binder.cpp
static const JNINativeMethod gBinderInternalMethods[] = {
     /* name, signature, funcPtr */
    { "getContextObject", "()Landroid/os/IBinder;", (void*)android_os_BinderInternal_getContextObject },
    { "joinThreadPool", "()V", (void*)android_os_BinderInternal_joinThreadPool },
    ...
};
```

可以看到实际调用的是 android_os_BinderInternal_getContextObject 方法：

``` cpp
// android_util_Binder.cpp
static jobject android_os_BinderInternal_getContextObject(JNIEnv* env, jobject clazz)
{
    sp<IBinder> b = ProcessState::self()->getContextObject(NULL);
    return javaObjectForIBinder(env, b);
}
```

主要做了两件事：

- ProcessState::self()->getContextObject(NULL)：获取 handle 值为 0 的 `BpBinder`，BpBinder 是 native 层的 binder 对象，详见 [Android_Binder进程间通信机制02-ServiceManager_启动和获取]() 第 2.2 小节；
- javaObjectForIBinder(env, BpBinder)：将 IBinder 转为 java 对象，即 BinderProxy 对象，转换过程就是将 IBinder 的指针（long 类型）存储在 BinderProxy 的 mNativeData 中；

``` cpp
// android_util_Binder.cpp
jobject javaObjectForIBinder(JNIEnv* env, const sp<IBinder>& val)
{
    ...
    BinderProxyNativeData* nativeData = new BinderProxyNativeData();
    nativeData->mOrgue = new DeathRecipientList;
    // 这个 mObject 是 BinderProxy 代理的本地 IBinder
    nativeData->mObject = val; // BpBinder 赋给 nativeData->mObject，nativeData 再传递给 BinderProxy 的 mNativeData 变量

    jobject object = env->CallStaticObjectMethod(gBinderProxyOffsets.mClass,
            gBinderProxyOffsets.mGetInstance, (jlong) nativeData, (jlong) val.get());
    ...

    return object;
}
```

参数 val 是 BpBinder 对象的指针引用，赋值给 nativeData->mObject，而 nativeData 是一个指向 BinderProxyNativeData 结构体变量的指针，在后面会赋值给 BinderProxy 的 mNativeData 变量；

gBinderProxyOffsets 的赋值在 int_register_android_os_BinderProxy() 中：

``` cpp
// android_util_Binder.cpp
const char* const kBinderProxyPathName = "android/os/BinderProxy";
static int int_register_android_os_BinderProxy(JNIEnv* env)
{
    ...
    jclass clazz = FindClassOrDie(env, kBinderProxyPathName); // 查找 BinderProxy 所属类
    gBinderProxyOffsets.mClass = MakeGlobalRefOrDie(env, clazz); // 将 java 层的 BinderProxy 类保存给 mClass 变量
    gBinderProxyOffsets.mGetInstance = GetStaticMethodIDOrDie(env, clazz, "getInstance",
            "(JJ)Landroid/os/BinderProxy;"); // 将 java 层 BinderProxy 类的 getInstance 方法 ID 保存到 mGetInstance 变量
    ...
    // 将 java 层 BinderProxy 类的 mNativeData 属性 ID 保存到 mNativeData 变量中
    gBinderProxyOffsets.mNativeData = GetFieldIDOrDie(env, clazz, "mNativeData", "J");
    return RegisterMethodsOrDie(
        env, kBinderProxyPathName,
        gBinderProxyMethods, NELEM(gBinderProxyMethods));
}
```

注意此处获取了 BinderProxy 的 `mNativeData` 的属性 ID 给了 gBinderProxyOffsets.mNativeData；

所以 `env->CallStaticObjectMethod()` 就是调用 BinderProxy.java 的 getInstance 方法：

``` java
// BinderProxy.java
	private static BinderProxy getInstance(long nativeData, long iBinder) {
        BinderProxy result;
        synchronized (sProxyMap) {
            try {
                result = sProxyMap.get(iBinder);
                if (result != null) {
                    return result;
                }
                result = new BinderProxy(nativeData);
            ...
            NoImagePreloadHolder.sRegistry.registerNativeAllocation(result, nativeData);
            // The registry now owns nativeData, even if registration threw an exception.
            sProxyMap.set(iBinder, result);
        return result;
    }
    private BinderProxy(long nativeData) {
        mNativeData = nativeData;
    }
    ...
    private final long mNativeData;
}
```

BinderProxy 对象包含一个名为 sProxyMap 的 ProxyMap 对象，将 Native 层传入的 BpBinder 为 key，BinderProxy 为 value，存入这个 sProxyMap 对象中；

然后在 new BinderProxy(nativeData) 的时候，把从 Native 层传入的 nativeData 传给了 BinderProxy 对象的 mNativeData 变量，nativeData 是一个指向 BinderProxyNativeData 结构体变量的指针：

``` cpp
// android_util_Binder.cpp
struct BinderProxyNativeData {
    sp<IBinder> mObject;
    sp<DeathRecipientList> mOrgue;
};
```

结构体中的 mObject 就是 BpBinder，所以拿到了 BinderProxy 对象，就拿到了 BpBinder 对象；

最终 javaObjectForIBinder() 返回一个 BinderProxy 对象，此对象封装了 handle 值为 0 的 BpBinder（BpBinder 赋给了 BinderProxy.mNativeData），即将 native 层的 binder 对象（BpBinder）封装成 Java 层的 binder 对象（BinderProxy）并返回给调用者；

### 1.1.2 Binder.allowBlocking()

``` java
// Binder.java
	public static IBinder allowBlocking(IBinder binder) {
        try {
            if (binder instanceof BinderProxy) {
                ((BinderProxy) binder).mWarnOnBlocking = false;
            } else if (binder != null && binder.getInterfaceDescriptor() != null
                    && binder.queryLocalInterface(binder.getInterfaceDescriptor()) == null) {
                Log.w(TAG, "Unable to allow blocking on interface " + binder);
            }
        } catch (RemoteException ignored) {
        }
        return binder;
    }
```

传入的参数是 BinderProxy，所以直接 `((BinderProxy) binder).mWarnOnBlocking = false;`，仍然返回 BinderProxy 对象；

**所以 `Binder.allowBlocking(BinderInternal.getContextObject())` 最终返回一个封装了 BpBinder(handle == 0) 的 BinderProxy 对象。**

### 1.1.3 ServiceManagerNative.asInterface() - 以 BinderProxy 为参数构造 SMP

``` java
// ServiceManagerNative.java
public final class ServiceManagerNative {
    private ServiceManagerNative() {}
    ...
	public static IServiceManager asInterface(IBinder obj) {
        if (obj == null) {
            return null;
        }
        // ServiceManager is never local
        return new ServiceManagerProxy(obj);
    }
```

这里返回了一个参数为 BinderProxy 对象的 ServiceManagerProxy 对象；

``` java
// ServiceManagerNative.java
class ServiceManagerProxy implements IServiceManager {
    public ServiceManagerProxy(IBinder remote) {
        mRemote = remote;
        mServiceManager = IServiceManager.Stub.asInterface(remote);
    }
    ...
    private IServiceManager mServiceManager;
}
```

在 SMP 的构造函数中，传递 BinderProxy 对象，并把其赋值给 mRemote，再通过 `IServiceManager.Stub.asInterface` 初始化 mServiceManager 对象。

IServiceManager 是一个 AIDL 文件，在源码编译的时候会将其转换为 Java 和 C++ 代码，在生成的 IServiceManager.java 文件中有一个 Stub 类，其中的`IServiceManager.Stub.asInterface` 函数实现返回的是 Stub 的内部类 Proxy 对象，Proxy 类实现了 IServiceManager，Proxy 对象是 IServiceManager 的客户端，所以此处返回的 **mServiceManager 对象也相当于是这个 Proxy 对象，是 IServiceManager 的客户端，而传入的 BinderProxy 参数是服务端**，当调用 mServiceManager 对应的函数时，会先调用 [<font color=red>**AIDL 生成的 IServiceManager.java**</font>](https://cs.android.com/android/platform/superproject/+/master:out/soong/.intermediates/frameworks/base/framework-minus-apex-intdefs/android_common/xref33/srcjars.xref/android/os/IServiceManager.java) 中的 Proxy 中对应的函数，然后在其中又最终会通过 IServiceManager 的服务端将消息传递出去，即会调用 mRemote.transact() 函数（mRemote 即为服务端）。

所以 `getIServiceManager()` 就是获取 ServiceManagerProxy 对象，参数是封装了 BpBinder(handle == 0) 的 BinderProxy。

## 1.2 addService()

再来看 `getIServiceManager().addService()`，调用的就是 `ServiceManagerProxy.addService()`：

``` java
// ServiceManagerNative.java
class ServiceManagerProxy implements IServiceManager {
    public ServiceManagerProxy(IBinder remote) {
        mRemote = remote;
        mServiceManager = IServiceManager.Stub.asInterface(remote);
    }
    ...
    public void addService(String name, IBinder service, boolean allowIsolated, int dumpPriority)
            throws RemoteException {
        mServiceManager.addService(name, service, allowIsolated, dumpPriority);
    }
```

这里又调用了 `mServiceManager.addService(name, service, allowIsolated, dumpPriority)`，前述 [1.1.3](#1.1.3 ServiceManagerNative.asInterface()) 小节已经分析得知，mServiceManager 作为客户端，调用 IServiceManager.java 中 Proxy 的 addService() 方法 `IServiceManager.Stub.Proxy.addService()`：

``` java
// AIDL 生成的 IServiceManager.java 中，
	@Override public void addService(java.lang.String name, android.os.IBinder service, boolean allowIsolated, int dumpPriority) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain(); // 传递数据的 data
        android.os.Parcel _reply = android.os.Parcel.obtain(); // 获取回复的 reply
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _data.writeString(name); // 写入 String 对象，name = "activity"
          _data.writeStrongBinder(service); // 写入 Binder 对象，service = new AMS()
          _data.writeBoolean(allowIsolated);
          _data.writeInt(dumpPriority);
          boolean _status = mRemote.transact(Stub.TRANSACTION_addService, _data, _reply, 0);
          _reply.readException();
        }
        finally {
          _reply.recycle();
          _data.recycle();
        }
      }
```

这里的 _data 是一个 Parcel 对象，`writeString(name)` 和 `writeStrongBinder(service)` 最终通过 JNI 调用到 frameworks/base/core/jni/android_os_Parcel.cpp 中的 `android_os_Parcel_writeString16()` 和 `android_os_Parcel_writeStrongBinder() -> Parcel.writeStrongBinder() -> flattenBinder() -> writeObject()`，最终结果就是 <font color=red>**data.mData**</font> 指向数据 buffer，调用 write 接口写入的数据都依次存放在这块 buffer 中， <font color=red>**data.mObjects**</font> 指向一个动态分配的一维数组，存放的是 mData 的下标值，当数据 buffer 中写入了 binder 对象，就好在 mObjects 中存放一条下标记录，表示 binder 对象在数据 buffer 中的存放位置；

这里 mRemote 是 BinderProxy，就会调用服务端 BinderProxy 的 `transact()` 函数（注意：调用服务端的 transact 的时候，客户端会挂起等待），name, service 等参数会打包到 data 参数中：

``` java
// BinderProxy.java
    public boolean transact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
        ...
        try {
            return transactNative(code, data, reply, flags);
        } ...
    }
...
    public native boolean transactNative(int code, Parcel data, Parcel reply, int flags) throws RemoteException;
```

传入的 code 为 **ADD_SERVICE_TRANSACTION**，传入的 flags 默认为 0，这里调用到了 transactNative 这个 native 方法，在 android_util_Binder.cpp 的 gBinderProxyMethods 中可以看出，

``` cpp
// android_util_Binder.cpp
static const JNINativeMethod gBinderProxyMethods[] = {
     /* name, signature, funcPtr */
    {"pingBinder",          "()Z", (void*)android_os_BinderProxy_pingBinder},
    {"isBinderAlive",       "()Z", (void*)android_os_BinderProxy_isBinderAlive},
    {"getInterfaceDescriptor", "()Ljava/lang/String;", (void*)android_os_BinderProxy_getInterfaceDescriptor},
    {"transactNative",      "(ILandroid/os/Parcel;Landroid/os/Parcel;I)Z", (void*)android_os_BinderProxy_transact},
    {"linkToDeath",         "(Landroid/os/IBinder$DeathRecipient;I)V", (void*)android_os_BinderProxy_linkToDeath},
    {"unlinkToDeath",       "(Landroid/os/IBinder$DeathRecipient;I)Z", (void*)android_os_BinderProxy_unlinkToDeath},
    {"getNativeFinalizer",  "()J", (void*)android_os_BinderProxy_getNativeFinalizer},
    {"getExtension",        "()Landroid/os/IBinder;", (void*)android_os_BinderProxy_getExtension},
};
```

实际调用的是 android_os_BinderProxy_transact 方法：

``` cpp
// android_util_Binder.cpp
static jboolean android_os_BinderProxy_transact(JNIEnv* env, jobject obj,
        jint code, jobject dataObj, jobject replyObj, jint flags) // throws RemoteException
{
    ...
    // 将 java 端的 Parcel 对象转为 native 的 Parcel
    Parcel* data = parcelForJavaObject(env, dataObj);
    ...
    Parcel* reply = parcelForJavaObject(env, replyObj);
    ...
    IBinder* target = getBPNativeData(env, obj)->mObject.get(); // 获取 BpBinder
    ...
    status_t err = target->transact(code, *data, reply, flags); 
    ...
    if (err == NO_ERROR) {
        return JNI_TRUE;
    } else if (err == UNKNOWN_TRANSACTION) {
        return JNI_FALSE;
    }
	...
    return JNI_FALSE;
}
```

首先拿到传入的 data，然后调用 `IBinder* target = getBPNativeData(env, obj)->mObject.get()`：

### 1.2.1 BpBinder->transact()

**getBPNativeData(env, obj)->mObject.get()**

``` cpp
BinderProxyNativeData* getBPNativeData(JNIEnv* env, jobject obj) {
    return (BinderProxyNativeData *) env->GetLongField(obj, gBinderProxyOffsets.mNativeData);
}
```

上述 [1.1.1](# 1.1.1 BinderInternal.getContextObject()) 小节中分析得知 gBinderProxyOffsets.mNativeData 存入的是 BinderProxy 的 mNativeData 属性 ID，所以此处 getBPNativeData 获取的就是指向 BinderProxyNativeData 结构体的指针，从 [1.1.1](# 1.1.1 BinderInternal.getContextObject()) 小节的 javaObjectForIBinder() 函数得知，这个结构体的 `mObject`就是 BpBinder 对象，所以后面的 `target->transact()` 则是调用 BpBinder->transact()。

**BpBinder->transact()**

``` cpp
// BpBinder.cpp
status_t BpBinder::transact(
    uint32_t code, const Parcel& data, Parcel* reply, uint32_t flags)
{
    ...
        status_t status;
        if (CC_UNLIKELY(isRpcBinder())) {
            status = rpcSession()->transact(rpcAddress(), code, data, reply, flags);
        } else {
            status = IPCThreadState::self()->transact(binderHandle(), code, data, reply, flags);
        }

        return status;
    }
	...
}
```

CC_UNLICKLY 意思是告诉编译器执行 else 语句的可能性更大，减少性能的下降；这里又调用了 IPCThreadState 的 transact() 方法。

### 1.2.2 IPCThreadState::self()->transact()

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::transact(int32_t handle,
                                  uint32_t code, const Parcel& data,
                                  Parcel* reply, uint32_t flags)
{
    ...
    flags |= TF_ACCEPT_FDS; // 从 AIDL 中默认传入的 flags 是 0，此处或操作的 TF_ACCEPT_FDS 非异步，表示允许回复中包含文件描述符
    ...
    // 将数据打包到 mOut 中，准备写入到 binder 驱动
    err = writeTransactionData(BC_TRANSACTION, flags, handle, code, data, nullptr);
    ...
    if ((flags & TF_ONE_WAY) == 0) { // TF_ONE_WAY 是异步，此处非异步状态，需要等待回复
        ...
        // 等待回应
        if (reply) {
            err = waitForResponse(reply);
        } else {
            Parcel fakeReply;
            err = waitForResponse(&fakeReply);
        }
        ...
        IF_LOG_TRANSACTIONS() {
            TextOutput::Bundle _b(alog);
            alog << "BR_REPLY thr " << (void*)pthread_self() << " / hand "
                << handle << ": ";
            if (reply) alog << indent << *reply << dedent << endl;
            else alog << "(none requested)" << endl;
        }
    } else {
        err = waitForResponse(nullptr, nullptr); // TF_ONE_WAY 状态，无需等待回复
    }

    return err;
}
```

这里的 TF_ACCETP_FDS 表示允许回复中包含文件描述符，非异步，异步是 TF_ONEWAY，随后主要有两个函数比较重要：

- writeTransactionData()：将数据打包到 mOut 中，准备写入到 binder 驱动
- waitForResponse()：实际执行写入到 binder 驱动

#### 1.2.2.1 writeTransactionData - 打包数据和命令到 mOut

**writeTransactionData()**

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::writeTransactionData(int32_t cmd, uint32_t binderFlags,
    int32_t handle, uint32_t code, const Parcel& data, status_t* statusBuffer)
{
    binder_transaction_data tr; // 到驱动内部后会取出此结构体进行处理

    tr.target.ptr = 0; // binder_node 的地址
    tr.target.handle = handle; // 此处 handle 为 0，目标 server 的 binder 句柄，是 BpBinder(0) 传入的
    tr.code = code; // 此处 code 为 TRANSACTION_addService，getService() 的话就是 TRANSACTION_getService
    tr.flags = binderFlags; // flags 为 0（默认）
    tr.cookie = 0;
    tr.sender_pid = 0;
    tr.sender_euid = 0;

    const status_t err = data.errorCheck(); // 验证数据合理性
    // 将数据保存到 tr
    if (err == NO_ERROR) {
        tr.data_size = data.ipcDataSize(); // 传输数据大小
        tr.data.ptr.buffer = data.ipcData(); // 传输的数据区 buffer 首地址
        tr.offsets_size = data.ipcObjectsCount()*sizeof(binder_size_t); // 传递的 binder 对象个数 * 数据类型大小
        tr.data.ptr.offsets = data.ipcObjects(); // 偏移数组，存储 binder 对象在 mData 中的下标值
    } ...

    mOut.writeInt32(cmd); // 把命令写入到 mOut，传入的 cmd 是 BC_TRANSACTION
    mOut.write(&tr, sizeof(tr)); // 把 tr 写入到 mOut，此时 mOut.data 包含 cmd 和 tr

    return NO_ERROR;
}
// Parcel.cpp
uintptr_t Parcel::ipcData() const
{
    return reinterpret_cast<uintptr_t>(mData); // 数据区 buffer 首地址，存放传输的数据（包括 binder 对象）
}
uintptr_t Parcel::ipcObjects() const
{
    return reinterpret_cast<uintptr_t>(mObjects); // 一维数组首地址，数组中存放 binder 对象在数据区 buffer 中的下标值
}

status_t Parcel::writeObject(const flat_binder_object& val, bool nullMetaData)
{
        *reinterpret_cast<flat_binder_object*>(mData+mDataPos) = val;
        // Need to write meta-data?
        if (nullMetaData || val.binder != 0) {
            mObjects[mObjectsSize] = mDataPos; // mDataPos 是数据指针的当前位置，所以存放的是相对 mData 的偏移地址
            acquire_object(ProcessState::self(), val, this, &mOpenAshmemSize);
            mObjectsSize++;
        }
```

这里的 tr.data.ptr.buffer(就是 mData) 和 tr.data.ptr.offsets(就是mObjects) 存储的都是地址，buffer 指的是数据区的首地址，存放传输的数据（包括 binder 对象）；offsets 指的是偏移数组的首地址，用来描述数据区中每一个 IPC 对象（flat_binder_object）在数据区 buffer 中的位置，数组的每一项为一个 binder_size_t（其实就是 unsigned int 或者 unsigned long），这个值对应每一个 IPC 对象在 buffer 中相对于 mData 的偏移地址（理解为数组下标）；

这里的 `binder_transaction_data tr`，从名称上看就知道实际上就是要传递的数据，不过真正要传递的数据是 tr.data.ptr.buffer，传入的 cmd 参数是 BC_TRANSACTION，然后先后把这个 cmd 和传递的数据 tr 写入 mOut 中（这样当跳过 cmd 地址后就是数据 tr 的地址了），在后面 `talkWithDriver()` 中会把这个 mOut.data(指针值) 赋值给 binder_write_read.write_buffer 从而传递到驱动层。

BC 就是 Binder Command，是向驱动发送的命令，BR 就是 Binder Return，是从驱动返回的命令；

mIn 和 mOut 都是 IPCThreadState 中的 Parcel 对象，定义在 IPCThreadState.h 中:

``` cpp
// IPCThreadState.h
Parcel              mIn; // 存放从别处读取而来的数据
Parcel              mOut; // 存放要写入到别处的数据
```

#### 1.2.2.2 waitForResponse - 写入数据到 binder 驱动

``` cpp
// IPCThreadState.h
status_t            waitForResponse(Parcel *reply, status_t *acquireResult=nullptr);
// IPCThreadState.cpp
status_t IPCThreadState::waitForResponse(Parcel *reply, status_t *acquireResult)
{
    uint32_t cmd;
    int32_t err;

    while (1) {
        // 进一步调用 talkWithDriver 去执行写入数据到 binder 驱动
        if ((err=talkWithDriver()) < NO_ERROR) break;
        // 检查数据有效性，如果驱动返回数据，会放入 mIn 中
        err = mIn.errorCheck();
        ...
        cmd = (uint32_t)mIn.readInt32(); // 从 mIn 读取 binder 驱动返回的命令
        ...
        switch (cmd) { // 处理 binder 驱动发来的命令
        ...
        case BR_TRANSACTION_COMPLETE:
            // TF_ONE_WAY 模式时传入的 reply 和 acquireResult 是 nullptr，则直接 finish 退出循环，不再等待 binder 驱动的回复
            if (!reply && !acquireResult) goto finish;
            break;
        ...
        default: // 其他命令在 executeCommand 方法中处理
            err = executeCommand(cmd);
            if (err != NO_ERROR) goto finish;
            break;
        }
    }
...
    return err;
}
```

waitForResponse() 主要做了两件事：

- 向 binder 驱动中写入数据：waitForResponse() 没有直接去执行写入数据到 binder 驱动，而是调用了 talkWithDriver() 去处理；
- 处理从 binder 驱动发送过来的命令：比如 BR_TRANSACTION_COMPLETE, BR_REPLY；

##### 1.2.2.2.1 talkWithDriver() - 写入数据到 binder 驱动并把驱动返回数据放入 mIn 中

``` cpp
// IPCThreadState.h
status_t            talkWithDriver(bool doReceive=true); // 默认参数为 true
// IPCThreadState.cpp
status_t IPCThreadState::talkWithDriver(bool doReceive)
{
    ...
    binder_write_read bwr; // 1. binder 驱动使用的数据格式
    // mIn 还没有写入数据，因此值为初始值，那么 mIn.dataPosition()返回 mDataPos，值为 0
    // mIn.dataSize() 返回 mDataSize，初始值也为 0，因此 needRead 为 true
    const bool needRead = mIn.dataPosition() >= mIn.dataSize();
    const size_t outAvail = (!doReceive || needRead) ? mOut.dataSize() : 0;
    bwr.write_size = outAvail; // 要写入的数据量
    // 要写入的数据，把 mOut.data（包含了 cmd 和 binder_transaction_data tr）赋给 bwr.write_buffer
    // mOut.data() 返回的是指针，即 bwr.write_buffer 存入的是指针值，是要传输数据的地址
    bwr.write_buffer = (uintptr_t)mOut.data();
    // This is what we'll read.
    if (doReceive && needRead) {
        bwr.read_size = mIn.dataCapacity(); // 256，IPCThreadState 初始化时设置的
        bwr.read_buffer = (uintptr_t)mIn.data(); // 同 bwr.write_buffer 是个地址值
    } else {
        // needRead 为 false，进入 else 分支
        bwr.read_size = 0;
        bwr.read_buffer = 0;
    }
    ...
    // 如果读写的数据量都为 0，则直接返回
    if ((bwr.write_size == 0) && (bwr.read_size == 0)) return NO_ERROR;

    bwr.write_consumed = 0; // 表示 binder 驱动是否消耗了 mOut 中的数据（大于 0 消耗，否则未消耗）
    bwr.read_consumed = 0; // 表示 binder 驱动是否是否成功返回数据并写入 mIn（大于 0 成功）
    status_t err;
    do {
       ...
        // 真正执行写入的地方，传入 bwr 的地址，bwr.xxx_buffer 中包含传递的命令和数据
        if (ioctl(mProcess->mDriverFD, BINDER_WRITE_READ, &bwr) >= 0)
            err = NO_ERROR;
        else
            err = -errno;
        ...
    } while (err == -EINTR); // while 条件一般不成立，do 代码块只执行一次
    ...
```

talkWithDriver() 在 IPCThreadState.h 中定义的时候，doReceive 参数默认值为 true，在 waitForResponse() 中调用 talkWithDriver() 时没有传入参数，所以这里的 doReceive 为 true；mIn 还没有写入数据，因此值为初始值，那么 `mIn.dataPosition()` 返回 mDataPos，值为 0，`mIn.dataSize()` 返回 mDataSize，初始值也为 0，因此 needRead 为 true，bwr.read_size 则设置为 256，

talkWithDriver() 主要做了两个工作：

- 准备 binder_write_read 数据，通过 ioctl 进入驱动，执行驱动层的 binder_ioctl()，binder_ioctl_write_read()，执行了 `binder_thread_write()` 写入数据，随后又执行了 `binder_thread_read()` 函数把 BR_NOOP 和 BR_TRANSACTION 两个命令写入用户空间（具体流程可以看 [Android_Binder进程间通信机制01]() 的驱动层讲解）；
- 处理驱动的返回数据，放入 mIn 中供后续处理；

**binder_ioctl_write_read()**

``` c
// binder.c
static int binder_ioctl_write_read(struct file *filp,
                unsigned int cmd, unsigned long arg,
                struct binder_thread *thread)
{
    int ret = 0;
    struct binder_proc *proc = filp->private_data;
    unsigned int size = _IOC_SIZE(cmd);
    // arg 是用户空间 ioctl() 传入的 bwr 的地址，__user 表示这个地址是用户空间的
    void __user *ubuf = (void __user *)arg;
    struct binder_write_read bwr;
    ...
    // ubuf 就是用户空间 bwr 的地址，则是把用户空间 bwr 数据拷贝到内核 bwr 的地址
    if (copy_from_user(&bwr, ubuf, sizeof(bwr))) {
        ret = -EFAULT;
        goto out;
    }
    ...
    // 当写缓存中有数据，则执行 binder 写操作
    if (bwr.write_size > 0) {
        ret = binder_thread_write(proc, thread,
                      bwr.write_buffer,
                      bwr.write_size,
                      &bwr.write_consumed);
        trace_binder_write_done(ret);
        ...
    }
    ...
}
```

此处的 copy_from_user() 并非 binder 一次拷贝的地方，因为此处虽然是把用户空间 bwr 的数据拷贝到了内核 bwr 的地址，但是真实的传输数据是 bwr.write_buffer，bwr.write_buffer 是 mOut.data()，mOut.data() 返回的是一个地址值，所以此处拷贝的只是一个地址，并非真实传输的数据。

###### a. binder_thread_write() - 找到目标进程 sm 并向其传递传输数据，唤醒 sm

``` c
// binder.c
static int binder_thread_write(struct binder_proc *proc,
            struct binder_thread *thread,
            binder_uintptr_t binder_buffer, size_t size,
            binder_size_t *consumed)
{
    uint32_t cmd;
    struct binder_context *context = proc->context;
    // 传入的 bwr.write_buffer，是一个地址值
    void __user *buffer = (void __user *)(uintptr_t)binder_buffer;
    void __user *ptr = buffer + *consumed; // 数据起始地址
    void __user *end = buffer + size; // 数据结束地址
    // 可能有多个命令及对应数据要处理，所以要循环
    while (ptr < end && thread->return_error.cmd == BR_OK) {
        int ret;
        if (get_user(cmd, (uint32_t __user *)ptr)) // 从用户空间读取一个 cmd
            return -EFAULT;
        ptr += sizeof(uint32_t); // 跳过 cmd 所占的地址，指向要处理的数据
        switch (cmd) {
         ...
        case BC_TRANSACTION:
        case BC_REPLY: {
            // 与 IPCThreadState.writeTransactionData() 中准备的数据结构体对应
            struct binder_transaction_data tr;
            // 前面 ptr 已经跳过了 cmd，所以现在的 ptr 指向数据地址，将其拷贝到内核空间的 tr 中
            if (copy_from_user(&tr, ptr, sizeof(tr)))
                return -EFAULT;
            ptr += sizeof(tr); // ptr 跳过数据空间地址
            // cmd 此时是 BC_TRANSACTION，所以第四个参数为 false
            binder_transaction(proc, thread, &tr,
                       cmd == BC_REPLY, 0);
            break;
        }
         ...
        // 执行完 BC_TRANSACTION 后跳出 switch 语句，然后执行下面语句，
        // consumed 是被前面写入处理消耗的数据量，对应于用户空间的 bwr.write_consumed
        // ptr 现在已经跳过了 cmd 和 tr，而 buffer 是传入 binder_buffer 的起始地址，相减则是已消耗的数据量
        *consumed = ptr - buffer;
```

由小节 [1.2.2](#1.2.2 IPCThreadState::self()->transact()) 中得知，传递给 `writeTransactionData()` 函数的 cmd 是 BC_TRANSACTION，所以进入 BC_TRANSACTION 这个 case，调用 `binder_transaction` 方法，并且第四个参数 `cmd == BC_REPLY` 为 false。

**binder_transaction**

``` cpp
// binder.c
static void binder_transaction(struct binder_proc *proc,
                   struct binder_thread *thread,
                   struct binder_transaction_data *tr, int reply,
                   binder_size_t extra_buffers_size)
{
    int ret;
    struct binder_transaction *t; // 用于描述本次 server 端要进行的 transaction
    struct binder_work *w;
    struct binder_work *tcomplete; // 用于描述当前线程未完成的 transaction
    ...
    struct binder_proc *target_proc = NULL; // 目标进程
    struct binder_thread *target_thread = NULL; // 目标线程
    struct binder_node *target_node = NULL; // 目标 binder_node
    ...
    struct binder_context *context = proc->context; // 全局唯一，存储了 sm 对应的 binder_node
    ...
    if (reply) { // 第四个参数 reply 为 false
        ...
    } else { // 处理 BC_TRANSACTION
        if (tr->target.handle) { // handle 不为 0 时的操作
            ...
        } else { // handle 为 0，目标进程是 sm
            ...
            // 获取 sm 对应的 binder_node，target_node 即为 sm 的 binder 实体对象（binder_node）
            target_node = context->binder_context_mgr_node;
            if (target_node)
                // target_node 里面存储了所属进程的 binder_proc 信息，所以此处直接获取
                // target_node->proc 给 target_proc
                target_node = binder_get_node_refs_for_txn(
                        target_node, &target_proc,
                        &return_error);
            ...
        }
        ...
        w = list_first_entry_or_null(&thread->todo,
                         struct binder_work, entry); // thread->todo 为空，所以 w 为空
        ...
        // 此时 binder_thread 还没有通信事务，所以跳过
        if (!(tr->flags & TF_ONE_WAY) && thread->transaction_stack) {
            ...
        }
        binder_inner_proc_unlock(proc);
    }
    ...
    // 初始化 binder_transaction 对象 t，用于描述本次 server 端要进行的 transaction
    t = kzalloc(sizeof(*t), GFP_KERNEL);
    ...
    // 初始化 binder_work 对象 tcomplete，用于描述当前调用线程未完成的 transaction
    tcomplete = kzalloc(sizeof(*tcomplete), GFP_KERNEL);
    ...
    if (!reply && !(tr->flags & TF_ONE_WAY))
        // t->from 记录当前线程，用于 sm 返回结果时可以唤醒对应的请求进程
        t->from = thread;
    ...
    t->sender_euid = task_euid(proc->tsk);
    t->to_proc = target_proc; // 记录目标进程
    t->to_thread = target_thread; // 记录目标线程，目前还是 NULL
    t->code = tr->code; // 记录请求码，此时为 ADD_SERVICE_TRANSACTION
    t->flags = tr->flags; // flags 为 0
    ...
    // 从 mmap 开辟的空间申请物理内存，这个 buffer 是共享空间，准备接收要传输的数据
    t->buffer = binder_alloc_new_buf(&target_proc->alloc, tr->data_size,
        tr->offsets_size, extra_buffers_size,
        !reply && (t->flags & TF_ONE_WAY), current->tgid);
    ...
    t->buffer->debug_id = t->debug_id;
    t->buffer->transaction = t;
    t->buffer->target_node = target_node;
    t->buffer->clear_on_free = !!(t->flags & TF_CLEAR_BUF);
    trace_binder_transaction_alloc_buf(t->buffer);
    // 把数据从用户空间拷贝到上面的 buffer 共享内存区域，
    // 即 binder 真正一次拷贝有效数据的地方
    // 拷贝用户空间的 tr->data.ptr.buffer 到 t->buffer 对应的物理内存，拷贝的是 transact() 中 data 参数的非 IBinder 数据
    if (binder_alloc_copy_user_to_buffer(
                &target_proc->alloc,
                t->buffer, 0,
                (const void __user *)
                    (uintptr_t)tr->data.ptr.buffer,
                tr->data_size)) {
        ...
    }
    // 拷贝用户空间的 tr->data.ptr.offsets 到 t->buffer 对应的物理内存，拷贝的是 transact() 中 data 参数的 IBinder 对象
    if (binder_alloc_copy_user_to_buffer(
                &target_proc->alloc,
                t->buffer,
                ALIGN(tr->data_size, sizeof(void *)),
                (const void __user *)
                    (uintptr_t)tr->data.ptr.offsets,
                tr->offsets_size)) {
        ...
    }
    ...
    // 循环取出 Binder 服务，根据本地 Binder 对象还是代理对象做对应处理
    for (buffer_offset = off_start_offset; buffer_offset < off_end_offset;
         buffer_offset += sizeof(binder_size_t)) {
        ...
    if (t->buffer->oneway_spam_suspect)
        tcomplete->type = BINDER_WORK_TRANSACTION_ONEWAY_SPAM_SUSPECT;
    else
        tcomplete->type = BINDER_WORK_TRANSACTION_COMPLETE;// 发送给 client(就是当前进程)，让其挂起
    t->work.type = BINDER_WORK_TRANSACTION;// 发送给 sm，让其把 service 添加到 sm 中
    if (reply) {
        ...
    } else if (!(t->flags & TF_ONE_WAY)) {
        ...
        // 将 tcomplete 加入到当前调用线程待处理的任务队列 thread->todo 中
        // 相当于 list_add_tail(&tcomplete->entry, target_list);
        binder_enqueue_deferred_thread_work_ilocked(thread, tcomplete);
        t->need_reply = 1;
        t->from_parent = thread->transaction_stack; // 保存 thread ->transaction_stack 方便 sm 找到客户端
        // 把此次创建的 binder_transaction 对象记录在当前线程的 transaction_stack
        thread->transaction_stack = t;
        binder_inner_proc_unlock(proc);
        // 此时 target_thread 还是 NULL，进去后会从 target_proc 的 waiting_threads 链表取出一个空闲的 binder 线程赋值给 target_thread
        //  将 t 加入到 target_thread->todo 处理队列中，向目标进程发送事务 BINDER_WORK_TRANSACTION 并将其唤醒，
        // 并配置 target_thread->process_todo = true
        return_error = binder_proc_transaction(t,
                target_proc, target_thread); 
        if (return_error) {
            binder_inner_proc_lock(proc);
            binder_pop_transaction_ilocked(thread, t);
            binder_inner_proc_unlock(proc);
            goto err_dead_proc_or_thread;
        }
    }
```

调用 binder_proc_transaction() 向 sm 发送 BINDER_WORK_TRANSACTION 并将 sm 唤醒：

``` cpp
// binder.c
static int binder_proc_transaction(struct binder_transaction *t,
                    struct binder_proc *proc,
                    struct binder_thread *thread)
{
    struct binder_node *node = t->buffer->target_node;
    struct binder_priority node_prio;
    bool oneway = !!(t->flags & TF_ONE_WAY); // 值为 false
    bool pending_async = false;
    bool skip = false;
    ...
    if (oneway) {
        ...
    }
    ...
    // thread 为 NULL，pending_async 为 false，skip 为 false，进入 if 分支
    if (!thread && !pending_async && !skip)
        // 在目标进程 target_proc 的 waiting_threads 链表里面取出一个空闲 binder 线程
        thread = binder_select_thread_ilocked(proc);
    ...
    if (thread) {
        ...
        // 将 t 加入到目标线程的target_thread 的 todo 链表中并配置 thread->process_todo = true
        binder_enqueue_thread_work_ilocked(thread, &t->work);
    } else if (!pending_async) {
        // 如果上面 binder_thread 为空，则记录到 target_proc 的 todo 链表
        binder_enqueue_work_ilocked(&t->work, &proc->todo);
    ...
    if (!pending_async)
        // 调用 wake_up_interruptible_sync() 唤醒 sm
        binder_wakeup_thread_ilocked(proc, thread, !oneway /* sync */); // oneway 为 false
    ...
    return 0;
}
static void
binder_enqueue_thread_work_ilocked(struct binder_thread *thread,
                   struct binder_work *work)
{
    WARN_ON(!list_empty(&thread->waiting_thread_node));
    binder_enqueue_work_ilocked(work, &thread->todo);
    thread->process_todo = true; // 配置 process_todo = true
}
static void binder_wakeup_thread_ilocked(struct binder_proc *proc,
                     struct binder_thread *thread,
                     bool sync)
{
    assert_spin_locked(&proc->inner_lock);
    if (thread) {
        trace_android_vh_binder_wakeup_ilocked(thread->task, sync, proc);
        if (sync) // sync 为 true
            wake_up_interruptible_sync(&thread->wait); // 唤醒目标进程 sm
        else
            wake_up_interruptible(&thread->wait);
        return;
    }
```

这里要注意：binder_proc_transaction() -> binder_enqueue_thread_work_ilocked() -> binder_enqueue_thread_work_ilocked()， <font color=red>**在最后一步的时候配置了 process_todo = true，这里的作用是在后面进入 binder_thread_read() 的时候线程不休眠**</font>， 最终还是调用 `wake_up_interruptible_sync()` 把 sm 唤醒，异步则调用 `wake_up_interruptible()`。

binder_transaction() 主要工作：

- 获取 target_node，target_proc
- 拷贝数据到内核和目标进程映射的物理内存空间
- binder_transaction_binder 转换成 binder_transaction_handle（**这里判断是 BINDER_TYPE_BINDER 还是 BINDER_TYPE_HANDLE 是在 transact 之前的 `writeStrongBinder()` 数据序列化的时候处理的，因为我们传入在 addService 的是 ams 的服务端，所以 binder.localBinder() 不为空，所以传入的是 BBinder，那么就是 BINDER_TYPE_BINDER**）
- 保存 `thread ->transaction_stack` 方便 sm 找到客户端
- `t->work.type = BINDER_WORK_TRANSACTION`，发送到 sm 让其工作
- `tcomplete-type = BINDER_WORK_TRANSACTION_COMPLETE`，发送给 client
- `wake_up_interruptible_sync()` 唤醒 sm

**为什么这里拷贝之前要通过 binder_alloc_new_buf() 申请内存呢？因为在 binder_mmap() 的时候虽然映射了 1M-8K 的虚拟内存，但却只申请了 1页(4K) 的物理页面，等到实际使用时再动态申请，也就是说在 binder_ioctl() 实际传输数据的时候再通过 binder_alloc_new_buf() 方法去申请物理内存。**

自此已经将要传输的数据拷贝到目标进程，目标进程可以直接读取到了，目标 sm 进程被唤醒，~~~在此之前 sm 是阻塞在 binder_thread_read() 中的~~~，接下来还有三件事要做：

- 客户端调用线程进入休眠

- 目标进程直接拿到数据进行处理，处理完成后唤醒调用线程

- 客户端调用线程返回处理结果

其中前两步没有时序上的限制，而是并行处理的，先来看看客户端调用线程。

binder_transaction 执行完后，那么 binder_thread_write 也就执行完了，返回到 binder_ioctl_write_read() 中继续执行：

``` c
// binder.c
static int binder_ioctl_write_read(struct file *filp,
				unsigned int cmd, unsigned long arg,
				struct binder_thread *thread)
{
    ...
	// 当读缓存中有数据，则执行 binder 读操作
    if (bwr.read_size > 0) {
        ret = binder_thread_read(proc, thread, bwr.read_buffer,
                     bwr.read_size,
                     &bwr.read_consumed,
                     filp->f_flags & O_NONBLOCK);
        ...
        if (!binder_worklist_empty_ilocked(&proc->todo))
            // 进程 todo 队列不为空,则唤醒该队列中的线程
            binder_wakeup_proc_ilocked(proc);
        ...
    }
    ...
```

因为 bwr.read_size > 0，所以接着执行 binder_thread_read() 方法。

###### b. binder_thread_read() - 客户端进程挂起

``` c
 // binder.c
static int binder_thread_read(struct binder_proc *proc,
			      struct binder_thread *thread,
			      binder_uintptr_t binder_buffer, size_t size,
			      binder_size_t *consumed, int non_block)
{
	// 传入的 bwr.read_buffer，是一个地址值
	void __user *buffer = (void __user *)(uintptr_t)binder_buffer;
	void __user *ptr = buffer + *consumed; // 数据起始地址
	void __user *end = buffer + size; // 数据结束地址

	int ret = 0;
	int wait_for_proc_work;

	if (*consumed == 0) {
		// 向用户空间 ptr 地址添加 BR_NOOP 命令
		if (put_user(BR_NOOP, (uint32_t __user *)ptr))
			return -EFAULT;
		ptr += sizeof(uint32_t); // 跳过 BR_NOOP 命令地址
	}
...
	wait_for_proc_work = binder_available_for_proc_work_ilocked(thread);
    ...
    if (wait_for_proc_work) {
        ...
    }
    // non_block == filp->f_flags & O_NONBLOCK，filp->f_flags 在 sm 打开 binder
    // 设备节点时(ProcessState.open_driver()) 传入的是 O_RDWR | OCLOEXEC，所以 non_block 为 false
    if (non_block) {
        if (!binder_has_work(thread, wait_for_proc_work))
            ret = -EAGAIN;
    } else {
        ret = binder_wait_for_work(thread, wait_for_proc_work);
    }
    // 走到这里，证明已经被唤醒了，结束等待，需要去掉线程 looper 的等待状态
    thread->looper &= ~BINDER_LOOPER_STATE_WAITING;
    ...
｝

// 判断 wait_for_proc_work
static bool binder_available_for_proc_work_ilocked(struct binder_thread *thread)
{ // 判断 wait_for_proc_work
    return !thread->transaction_stack &&
        binder_worklist_empty_ilocked(&thread->todo) &&
        (thread->looper & (BINDER_LOOPER_STATE_ENTERED |
                   BINDER_LOOPER_STATE_REGISTERED));
}
```

consumed 就是用户空间的 bwr.read_consumed，此时值为 0，把 BR_NOOP 传递到了用户空间地址 ptr  中。

在 binder_transaction() 中将 server 端要处理的 transaction 记录到了当前调用线程 `thread->transaction_stack = t;`，所以 thread->transaction_stack != NULL，而且将 tcomplete 加入到当前调用线程待处理的任务队列 &thread->todo，所以 &thread->todo 也不为空，wait_for_proc_work 为 false，non_block 也为 false，进入 binder_wait_for_work()：

``` c
// binder.c
static int binder_wait_for_work(struct binder_thread *thread,
                bool do_proc_work)
{
    DEFINE_WAIT(wait); // 建立并初始化一个等待队列项 wait
    ...
    for (;;) { // 循环的作用是让线程被唤醒后再一次去检查一下 condition 是否满足
        // 将 wait 添加到等待队列头中，并设置进程的状态为 TASK_INTERRUPTIBLE，此时进程还没有睡眠
        prepare_to_wait(&thread->wait, &wait, TASK_INTERRUPTIBLE);
        // 唤醒条件 condition,如果满足则跳出循环，否则一直循环等待
        if (binder_has_work_ilocked(thread, do_proc_work))
            break;
        // 如果是在等待处理本进程的todo队列的任务
        if (do_proc_work)
            // 把本线程的 waiting_thread_node 添加到所属进程的 waiting_threads 中
            list_add(&thread->waiting_thread_node,
                 &proc->waiting_threads);
        ...
        schedule(); // 调用schedule()，让出cpu资源，开始休眠，进程真正睡眠的地方
        ...
    // 会有一个和队列 A 相关的线程来唤醒队列 A 中的线程
    // 进程被唤醒后，就把自己从队列 A 中移出来，重新恢复状态为 TASK_RUNNING
    finish_wait(&thread->wait, &wait);
    ...
}
```

最终还是在 binder_wait_for_work() 里面阻塞了，客户端进程挂起。接下来继续看 sm 做了什么。

###### c. 服务端进程处理数据 

###### c.1 sm 调用 handleEvent() 去读取消息

sm 通过 epoll 机制对 binder_fd 进行监听，当监听到 binder_fd 可读时就会调用 handleEvent() 处理。

``` cpp
// frameworks/native/cmds/servicemanager/main.cpp
class BinderCallback : public LooperCallback {
public:
    static sp<BinderCallback> setupTo(const sp<Looper>& looper) {
        ... // 添加并监听文件描述符
        int ret = looper->addFd(binder_fd, Looper::POLL_CALLBACK, Looper::EVENT_INPUT, cb, nullptr /*data*/);
        return cb;
    }

    int handleEvent(int /* fd */, int /* events */, void* /* data */) override {
        // 调用 handlePolledCommands() 处理回调
        IPCThreadState::self()->handlePolledCommands();
        return 1;  // Continue receiving callbacks.
    }
```

调用 handlePolledCommands()

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::handlePolledCommands()
{
    status_t result;

    do {
        result = getAndExecuteCommand();
    } while (mIn.dataPosition() < mIn.dataSize());

    processPendingDerefs();
    flushCommands();
    return result;
}
```

handlePolledCommands() 是告诉 sm，binder 驱动有数据可读，调用 getAndExecuteCommand()

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::getAndExecuteCommand()
{
    status_t result;
    int32_t cmd;

    result = talkWithDriver();
    ...
}
```

看到熟悉的 talkWithDriver()

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::talkWithDriver(bool doReceive)
{
    ...
    const bool needRead = mIn.dataPosition() >= mIn.dataSize();
    // doReceive 为 true，needRead 为 false，所以 outAvail = 0
    const size_t outAvail = (!doReceive || needRead) ? mOut.dataSize() : 0;
    bwr.write_size = outAvail; // // 要写入的数据量，bwr.write_size = 0
    ...
    if (doReceive && needRead) { // needRead 为 true
        bwr.read_size = mIn.dataCapacity(); // 256，IPCThreadState 初始化时设置的
        bwr.read_buffer = (uintptr_t)mIn.data(); // 同 bwr.write_buffer 是个地址值
    } else {
        ...
```

~~<font color=red>**sm 启动时，mIn .dataSize() = 0，mOut.dataSize() = 0，所以这里 needRead 为 true，bwr.read_size = 256(默认值)，bwr.write_size = 0，会进入驱动中进行读操作，sm 在 binder_thread_read() 里面的 binder_wait_for_work() 进入休眠。**</font>(此部分有误，参考下面)~~

此时 mIn 和 mOut 都没有数据，则 needRead 为 true，bwr.read_size = 256，bwr.write_size = 0，进入 binder_thread_read()；

###### c.2 处理 BINDER_WORK_TRANSACTION，向用户空间传递 BR_TRANCACTION

回忆一下在上面 binder_transaction() 的时候，我们配置了目标线程的 thread->process_todo = true，所以<font color=red>**此时 sm 在 binder_wait_for_work() 中 sm 不会休眠**</font>，继续往下执行：

``` c
static int binder_thread_read(
    ...
    } else {
        ret = binder_wait_for_work(thread, wait_for_proc_work); // 因为 
    }
    // 走到这里，证明已经被唤醒了，结束等待，需要去掉线程 looper 的等待状态
    thread->looper &= ~BINDER_LOOPER_STATE_WAITING;
    while (1) {
        uint32_t cmd;
        struct binder_transaction_data_secctx tr;
        struct binder_transaction_data *trd = &tr.transaction_data;
        struct binder_work *w = NULL;
        struct list_head *list = NULL;
        struct binder_transaction *t = NULL;
        struct binder_thread *t_from;
        size_t trsize =  (*trd);
        ...
        // 优先处理本线程内部的 todo 队列，如果为空，则处理进程的 todo 队列
        if (!binder_worklist_empty_ilocked(&thread->todo)) // 判断 thread->todo 是否为空，此时不为空，条件为 true
            list = &thread->todo; // 获取线程 todo 队列
        else if (!binder_worklist_empty_ilocked(&proc->todo) &&
               wait_for_proc_work) // 如果 thread->todo 为空，判断 proc->todo
            list = &proc->todo; // 获取进程 todo 队列
        ...
        w = binder_dequeue_work_head_ilocked(list); // 从 sm 的 todo 队列获取 binder_work 对象
        ...
        switch (w->type) { // 判断 binder_transaction() 时传入的 binder_work 的类型
        case BINDER_WORK_TRANSACTION: {
            binder_inner_proc_unlock(proc);
            t = container_of(w, struct binder_transaction, work); // 通过 w 获取 binder_transaction 事务
        } break;
        ...
        // 以上我们已经拿到了从客户端发送过来的 binder_transaction 事务，接下来解析这个事务
        if (t->buffer->target_node) { // 是否存在目标节点，这里 target_node 为 sm 的 binder_node
            struct binder_node *target_node = t->buffer->target_node;
            struct binder_priority node_prio;
            // 非常重要，把 Binder 实体的弱引用地址赋值给 trd->target.ptr，sm 的binder 实体地址是什么呢？
            // trd 地址中存的是 binder_transaction_data
            trd->target.ptr = target_node->ptr;
            // 非常重要，Binder 实体的 cookie 赋值给 trd->target.cookie
            trd->cookie =  target_node->cookie;
            node_prio.sched_policy = target_node->sched_policy;
            node_prio.prio = target_node->min_priority;
            binder_transaction_priority(current, t, node_prio,
                            target_node->inherit_rt);
            cmd = BR_TRANSACTION; // 记录 BR_TRANSACTION，要传递到用户空间的
        } else {
            trd->target.ptr = 0;
            trd->cookie = 0;
            cmd = BR_REPLY;
        }
        trd->code = t->code; // 添加服务时为 ADD_SERVICE_TRANSACTION
        trd->flags = t->flags; // 0
        trd->sender_euid = from_kuid(current_user_ns(), t->sender_euid);
        t_from = binder_get_txn_from(t); // 通过 t 获取客户端线程 t->from
        if (t_from) {
            struct task_struct *sender = t_from->proc->tsk;
            trd->sender_pid =
                task_tgid_nr_ns(sender,
                        task_active_pid_ns(current));
            trace_android_vh_sync_txn_recvd(thread->task, t_from->task);
        } else {
            trd->sender_pid = 0;
        }
        ...
        trd->data_size = t->buffer->data_size; // 数据大小
        trd->offsets_size = t->buffer->offsets_size; // 数据中对象的偏移数组的大小(即对象的个数)
        trd->data.ptr.buffer = (uintptr_t)t->buffer->user_data;
        trd->data.ptr.offsets = trd->data.ptr.buffer +
                    ALIGN(t->buffer->data_size,
                        sizeof(void *));
        tr.secctx = t->security_ctx;
        if (t->security_ctx) {
            cmd = BR_TRANSACTION_SEC_CTX;
            trsize = sizeof(tr);
        }
        // 把 BR_TRANSACTION 命令拷贝到用户空间
        if (put_user(cmd, (uint32_t __user *)ptr)) {
            if (t_from)
                binder_thread_dec_tmpref(t_from);
            binder_cleanup_transaction(t, "put_user failed",
                           BR_FAILED_REPLY);
            return -EFAULT;
        }
        ptr += sizeof(uint32_t);
        // 把 binder_transaction_data_secctx tr 数据拷贝到用户空间
        if (copy_to_user(ptr, &tr, trsize)) {
            if (t_from)
                binder_thread_dec_tmpref(t_from);
            binder_cleanup_transaction(t, "copy_to_user failed",
                           BR_FAILED_REPLY);
            return -EFAULT;
        }
        ptr += trsize;
```

主要工作有：

- 获取 sm 的 thread->todo 队列；
- 从 thread->todo 队列获取 binder_work 对象 w；
- 根据 w->type(BINDER_WORK_TRANSACTION) ，通过 w 获取传输数据 binder_transaction 对象 t；
- 记录命令 TR_TRANSACTION;
- 把 t 中的数据放入 binder_transaction_data trd 中，而 trd 是 binder_transaction_data_secctx tr 的一个属性，指向 binder_transaction_data；
- 把 Binder 实体的地址赋值给 `trd->target.ptr = target_node->ptr;`，这里的 target_node 是 sm 的 binder_node，target_node->ptr 指向的是 binder 实体在宿主进程中的首地址，<font color=red>**sm 在注册为大管家的时候并没有对其赋值，所以此处的 `target_node->ptr`**</font> 其实为空值，尽管客户端在 writeTransactionData 中赋值了一个 `tr.target.ptr = 0`，但是在 `binder_transaction()` 中并未将 `tr.target.ptr` 赋值给 `target_node->ptr`；
- 把 TR_TRANSACTION 和 tr 传递到用户空间 ptr 地址中；

binder_thread_read() 执行完后回到 sm 进程用户空间。

###### c.3 处理 BR_TRANCACTION

先返回到 talkWithDriver() ，在其中后续未做重要的工作，再返回到 getAndExecuteCommand() 获取驱动发来的 TR_TRANSACTION 命令：

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::getAndExecuteCommand()
{
    ...
    result = talkWithDriver();
    if (result >= NO_ERROR) {
        size_t IN = mIn.dataAvail();
        if (IN < sizeof(int32_t)) return result;
        cmd = mIn.readInt32(); // 获取 TR_TRANSACTION 命令
        ...
        result = executeCommand(cmd);
	...
    return result;
}
```

把前面 binder_transaction() 中传递到用户空间的 TR_TRANSACTION 命令取出来，调用 executeCommand(cmd)：

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::executeCommand(int32_t cmd)
{
    BBinder* obj;
    RefBase::weakref_type* refs;
    status_t result = NO_ERROR;

    switch ((uint32_t)cmd) {
    ...
    case BR_TRANSACTION: // 处理 BR_TRANCACTION
        {
            ...
            if (cmd == (int) BR_TRANSACTION_SEC_CTX) {
                result = mIn.read(&tr_secctx, sizeof(tr_secctx));
            } else {
                result = mIn.read(&tr, sizeof(tr)); // 读取传递过来的数据
                tr_secctx.secctx = 0;
            }
            ...
            Parcel reply; // Parcel 对象，用于写入 sm.addService 返回结果
            ...
            // tr.target.ptr 指向 binder 实体在宿主进程的首地址，由驱动在写回数据时赋值的
            if (tr.target.ptr) {
                if (reinterpret_cast<RefBase::weakref_type*>(
                        tr.target.ptr)->attemptIncStrong(this)) {
                    // 使用 tr.cookie 强转成指针，然后调用 transact() 方法
                    error = reinterpret_cast<BBinder*>(tr.cookie)->transact(tr.code, buffer,
                            &reply, tr.flags);
                    reinterpret_cast<BBinder*>(tr.cookie)->decStrong(this);
                } else {
                    error = UNKNOWN_TRANSACTION;
                }

            } else {
                // 对于 sm 执行此分支，the_context_object 是一个 BBinder 对象
                error = the_context_object->transact(tr.code, buffer, &reply, tr.flags);
            }
```

这个 tr.target.ptr 指向的是 binder 实体(binder_node)在宿主进程的首地址，由驱动在写回数据时赋值的（`binder_thread_read()` 中），但是此时进程是 sm，sm 在注册为大管家的时候，binder 驱动并没有存储它的首地址（**具体见 binder.c -> binder_ioctl_set_ctx_mgr()**），所以 sm 进程在 binder_thread_read() 中写回数据时写的是个空值，而别的 iBinder 对象则会有值，所以此时进入 else 分支；

###### c.4 服务端处理 IPC 数据 - trancact->onTrancact-> TRANSACTION_addService

the_context_object 是一个 BBinder 对象，在 sm 启动时（main.cpp）传入的是 sm 对象，sm 继承了 BnServiceManager，BnServiceManager 继承 BnInterface，而 BnInterface 又继承了 BBinder & IServiceManager；

``` h
// frameworks/native/cmds/servicemanager/ServiceManager.cpp
class ServiceManager : public os::BnServiceManager
// out/soong/.intermediates/frameworks/native/libs/binder/libbinder/android_native_bridge_arm64_armv8-a_shared/gen/aidl/android/os/BnServiceManager.h
class BnServiceManager : public ::android::BnInterface<IServiceManager> {
class BnInterface : public INTERFACE, public BBinder
```

所以 `the_context_object->transact()` 最终执行的是 `BBinder::transact()`

``` cpp
// frameworks/native/libs/binder/Binder.cpp
status_t BBinder::transact(
    uint32_t code, const Parcel& data, Parcel* reply, uint32_t flags)
{
    data.setDataPosition(0);
...
    status_t err = NO_ERROR;
    switch (code) {
        ...
        default:
            err = onTransact(code, data, reply, flags);
            break;
    }
...
}
```

进入 default 分支，这里的 onTransact() 调用的是 JavaBBinder 中的 onTransact()，

``` cpp
// android_util_Binder.cpp
    status_t onTransact(
        uint32_t code, const Parcel& data, Parcel* reply, uint32_t flags = 0) override
    {
        ...
        jboolean res = env->CallBooleanMethod(mObject, gBinderOffsets.mExecTransact,
            code, reinterpret_cast<jlong>(&data), reinterpret_cast<jlong>(reply), flags);

        if (env->ExceptionCheck()) {
            ScopedLocalRef<jthrowable> excep(env, env->ExceptionOccurred());
            binder_report_exception(env, excep.get(),
                                    "*** Uncaught remote exception!  "
                                    "(Exceptions are not yet supported across processes.)");
            res = JNI_FALSE;
        }
```

又通过 CallBooleanMethod() 继续调用 Binder.java 的 execTransact() 方法：

``` java
// Binder.java
	private boolean execTransact(int code, long dataObj, long replyObj,
            int flags) {
        // At that point, the parcel request headers haven't been parsed so we do not know what
        // WorkSource the caller has set. Use calling uid as the default.
        final int callingUid = Binder.getCallingUid();
        final long origWorkSource = ThreadLocalWorkSource.setUid(callingUid);
        try {
            return execTransactInternal(code, dataObj, replyObj, flags, callingUid);
        } finally {
            ThreadLocalWorkSource.restore(origWorkSource);
        }
    }

```

继续到 execTransactInternal()：

``` java
// Binder.java
	private boolean execTransactInternal(int code, long dataObj, long replyObj, int flags,
            int callingUid) {
		...
                    res = onTransact(code, data, reply, flags);
```

然后这里的 onTransact() 就是调用 IServiceManager.java 中的 `BnServiceManager::onTransact()` ，BnServiceManager 继承了 BBinder，重写了 BBinder 中 onTransact() 这个虚函数，在 AIDL 生成的 IServiceManager.cpp 文件中（<font color=red>**这部分调用流程还存在疑惑，**[此文解释了为什么会调用到 JavaBBinder.onTransact()，学习 java 层 Binder 对象的初始过程](https://juejin.cn/post/6990152454058803213)</font>。

``` cpp
// out/.../gen/aidl/android/os/IServiceManager.cpp
::android::status_t BnServiceManager::onTransact(uint32_t _aidl_code, const ::android::Parcel& _aidl_data, ::android::
Parcel* _aidl_reply, uint32_t _aidl_flags) {
  ::android::status_t _aidl_ret_status = ::android::OK;
  switch (_aidl_code) {
  ...
  case BnServiceManager::TRANSACTION_addService:
  {
    ...
    // 调用真正的 ServiceManager.cpp 中的实现
    ::android::binder::Status _aidl_status(addService(in_name, in_service, in_allowIsolated, in_dumpPriority));
    // addService 返回一个 Status 对象状态值，写到 Parcel 对象 _aidl_reply 中
    _aidl_ret_status = _aidl_status.writeToParcel(_aidl_reply);
    if (((_aidl_ret_status) != (::android::OK))) {
      break;
    }
    if (!_aidl_status.isOk()) {
      break;
    }
  }
  break;
```

addService 返回一个 Status 对象状态值，写到 Parcel 对象 _aidl_reply 中，上面说 ServiceManager 间接继承了 IServiceManager，同时也实现了 addService() 这个虚函数：

``` cpp
// ServiceManager.h
    ServiceMap mNameToService;
// ServiceManager.cpp
Status ServiceManager::addService(const std::string& name, const sp<IBinder>& binder, bool allowIsolated, int32_t dumpPriority) {
    auto ctx = mAccess->getCallingContext();
    ...
	// 新增一个结构体到 map 中
    // Overwrite the old service if it exists
    mNameToService[name] = Service {
        .binder = binder,
        .allowIsolated = allowIsolated,
        .dumpPriority = dumpPriority,
        .debugPid = ctx.debugPid,
    };
...
    return Status::ok(); // 这里返回了 Status，后面会写入 reply
}
```

sm 通过 nNameToService 这个 map 保存服务及其对应的信息，服务名 name 为 key，value 是一个 Service 结构体；`Status::ok()` 返回 Status 的默认构造函数 `Status()`。

<font color=red>**到这里 sm 就保存了服务和对应的 binder**</font>，现在返回 IPCThreadState.executeCommand() 中继续执行：

###### c.5 sendReply() - 服务端向驱动写入 BC_REPLY

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::executeCommand(int32_t cmd)
{
    ...
            } else {
                // the_context_object 是一个 BBinder 对象
                error = the_context_object->transact(tr.code, buffer, &reply, tr.flags);
            }
            if ((tr.flags & TF_ONE_WAY) == 0) {
                ...
                constexpr uint32_t kForwardReplyFlags = TF_CLEAR_BUF;
                sendReply(reply, (tr.flags & kForwardReplyFlags));
            } else {
```

这里的 tr.flags 还是 0，进入 if 分支，调用 `sendReply()` 将 reply 发送给请求方客户端：

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::sendReply(const Parcel& reply, uint32_t flags)
{
    status_t err;
    status_t statusBuffer;
    err = writeTransactionData(BC_REPLY, flags, -1, 0, reply, &statusBuffer);
    if (err < NO_ERROR) return err;

    return waitForResponse(nullptr, nullptr);
}
```

`writeTransactionData()` 参见 [1.2.2.1](# 1.2.2.1 writeTransactionData - 打包数据和命令到 mOut) 小结，打包 <font color=red>**BC_REPLY**</font> 命令和 reply 数据到 mOut 中； 进入 waitForResponse() 继续执行（流程参考 [1.2.2.2 小结](# 1.2.2.2 waitForResponse - 写入数据到 binder 驱动)），通过 `talkWithDriver()` 与驱动沟通，因为此时 mOut 有数据，mIn 中无数据，所以在 talkWithDriver() 时 write_size 和 read_size 都大于 0，通过 ioctl() 向驱动写入和读取数据：

``` c
// binder.c
static int binder_thread_write(struct binder_proc *proc,
            struct binder_thread *thread,
            binder_uintptr_t binder_buffer, size_t size,
            binder_size_t *consumed)
{
    ...
        case BC_TRANSACTION:
        case BC_REPLY: {
            // 与 IPCThreadState.writeTransactionData() 中准备的数据结构体对应
            struct binder_transaction_data tr;
            // 前面 ptr 已经跳过了 cmd，所以现在的 ptr 指向数据地址，将其拷贝到内核空间的 tr 中
            if (copy_from_user(&tr, ptr, sizeof(tr)))
                return -EFAULT;
            ptr += sizeof(tr); // ptr 跳过数据空间地址
            // cmd 此时是 BC_REPLY，所以第四个参数为 true
            binder_transaction(proc, thread, &tr,
                       cmd == BC_REPLY, 0);
            break;
        }
```

此时的 cmd 为 BC_REPLY，所以 `binder_transaction()`的第四个参数为 true。

###### c.6 服务端处理 BC_REPLY，唤醒客户端

分别向自身和客户端 todo 队列添加 BINDER_WORK_TRANCACTION_COMPLETE 和 BINDER_WORK_TRANCACTION，然后唤醒客户端。

``` c
// binder.c
static void binder_transaction(struct binder_proc *proc,
                   struct binder_thread *thread,
                   struct binder_transaction_data *tr, int reply, // 此时 reply 为 true
                   binder_size_t extra_buffers_size)
{
    int ret;
    struct binder_transaction *t; // 用于描述本次 server 端要进行的 transaction
    struct binder_work *w;
    struct binder_work *tcomplete; // 用于描述当前线程未完成的 transaction
    binder_size_t buffer_offset = 0;
    binder_size_t off_start_offset, off_end_offset;
    binder_size_t off_min;
    binder_size_t sg_buf_offset, sg_buf_end_offset;
    struct binder_proc *target_proc = NULL; // 目标进程
    struct binder_thread *target_thread = NULL; // 目标线程
    struct binder_node *target_node = NULL; // 目标 binder_node
    struct binder_transaction *in_reply_to = NULL;
    struct binder_transaction_log_entry *e;
    uint32_t return_error = 0;
    uint32_t return_error_param = 0;
    uint32_t return_error_line = 0;
    binder_size_t last_fixup_obj_off = 0;
    binder_size_t last_fixup_min_off = 0;
    struct binder_context *context = proc->context; // 全局唯一，存储了 sm 对应的 binder_node
    ...
    if (reply) { // reply 为 true
        binder_inner_proc_lock(proc);
        in_reply_to = thread->transaction_stack;
        ...
        thread->transaction_stack = in_reply_to->to_parent;
        binder_inner_proc_unlock(proc);
        target_thread = binder_get_txn_from_and_acq_inner(in_reply_to);
        ...
        target_proc = target_thread->proc; // 获取目标进程
        target_proc->tmp_ref++;
        binder_inner_proc_unlock(target_thread->proc);
        ...
    } else...
    ...
    // 初始化 binder_transaction 对象 t，用于描述本次 server 端要进行的 transaction
    t = kzalloc(sizeof(*t), GFP_KERNEL);
    ...
    // 初始化 binder_work 对象 tcomplete，用于描述当前调用线程未完成的 transaction
    tcomplete = kzalloc(sizeof(*tcomplete), GFP_KERNEL);
    ...
    // 从 mmap 开辟的空间申请物理内存，这个 buffer 是共享空间，准备接收要传输的数据
    t->buffer = binder_alloc_new_buf(&target_proc->alloc, tr->data_size,
    ...
    t->buffer->target_node = target_node; // 前面 target_node 并未赋值，为 null
    ...
    // 把数据从用户空间拷贝到上面的 buffer 共享内存区域，
    // 即 binder 真正一次拷贝有效数据的地方
    // 拷贝用户空间的 tr->data.ptr.buffer 到 t->buffer 对应的物理内存
    if (binder_alloc_copy_user_to_buffer(
        ...
    }
    // 拷贝用户空间的 tr->data.ptr.offsets 到 t->buffer 对应的物理内存
    if (binder_alloc_copy_user_to_buffer(
        ...
    }
    ...
    if (t->buffer->oneway_spam_suspect)
        tcomplete->type = BINDER_WORK_TRANSACTION_ONEWAY_SPAM_SUSPECT;
    else
        tcomplete->type = BINDER_WORK_TRANSACTION_COMPLETE;// 发送给 client(就是当前调用进程 sm)，让其挂起
    t->work.type = BINDER_WORK_TRANSACTION;// 发送给目标进程（前面和 sm 通信的进程）
    if (reply) {
        // 将 tcomplete 加入到当前调用线程(sm)待处理的任务队列，并配置 process_todo = true
        binder_enqueue_thread_work(thread, tcomplete);
        binder_inner_proc_lock(target_proc);
        ...
        // 将 t 加入到目标(和 sm 通信的 client)的处理队列中，并配置 process_todo = true
        binder_enqueue_thread_work_ilocked(target_thread, &t->work);
        ...
        wake_up_interruptible_sync(&target_thread->wait); // 唤醒客户端进程
    } else if (!(t->flags & TF_ONE_WAY)) {
    ...
}

```

这里和前文的 binder_transaction() 分析一样，只不过是走了不同的分支，<font color=red>**注意这里的 binder_enqueue_thread_work() 中会对当前调用线程配置 `thread->process_todo = true;`**</font>，binder_transaction() 完成后返回到 binder_ioctl_write_read()，继续执行 binder_thread_read()。

``` c
// binder.c
static int binder_thread_read(struct binder_proc *proc,
                  struct binder_thread *thread,
                  binder_uintptr_t binder_buffer, size_t size,
                  binder_size_t *consumed, int non_block)
{
...
    wait_for_proc_work = binder_available_for_proc_work_ilocked(thread);
...
    if (wait_for_proc_work) {
        ...
    }
    // non_block == filp->f_flags & O_NONBLOCK，filp->f_flags 在 sm 打开 binder 设备节点时
    // (ProcessState.open_driver()) 传入的是 O_RDWR | OCLOEXEC，所以 non_block 为 false
    if (non_block) {
        ...
    } else {
        ret = binder_wait_for_work(thread, wait_for_proc_work); // 进程睡眠的地方
    }
```

thread->todo 不为空，所以wait_for_proc_work 为 false，进入 binder_wait_for_work()：

``` cpp
// binder.c
static int binder_wait_for_work(struct binder_thread *thread,
                bool do_proc_work)
{
    DEFINE_WAIT(wait); // 建立并初始化一个等待队列项 wait
    struct binder_proc *proc = thread->proc;
    int ret = 0;
    freezer_do_not_count();
    binder_inner_proc_lock(proc);
    for (;;) { // 循环的作用是让线程被唤醒后再一次去检查一下condition是否满足
        // 将 wait 添加到等待队列头中，并设置进程的状态为 TASK_INTERRUPTIBLE，此时进程还没有睡眠
        prepare_to_wait(&thread->wait, &wait, TASK_INTERRUPTIBLE);
        // 唤醒条件 condition,如果满足则跳出循环，否则一直循环等待
        if (binder_has_work_ilocked(thread, do_proc_work))
            break;
        ...
        schedule(); // 调用schedule()，让出cpu资源，开始休眠，进程真正睡眠的地方
        ...
    return ret;
}
```

是否休眠取决于 binder_has_work_ilocked() 是否返回 true，返回 true 的话就直接跳出循环，进程不休眠，看一下 binder_has_work_ilocked()：

``` cpp
// binder.c
static bool binder_has_work_ilocked(struct binder_thread *thread,
                    bool do_proc_work)
{
    ...
    return thread->process_todo ||
        thread->looper_need_return ||
        (do_proc_work &&
         !binder_worklist_empty_ilocked(&thread->proc->todo));
}
```

因为在 binder_trancaction() 中配置了当前调用线程的 `thread->process_todo = true;`，<font color=red>**所以 binder_has_work_ilocked() 返回 true，此次 binder_wait_for_work() 中暂时并未休眠**</font>，继续往下执行处理 BINDER_WORK_TRANCACTION_COMPLETE，向 sm 用户空间传递 BR_TRANSACTION_COMPLETE 命令，

###### c.7 服务端处理 BR_TRANSACTION_COMPLETE 命令

``` c
// binder.c
static int binder_thread_read(...)
{
    ...
        w = binder_dequeue_work_head_ilocked(list); // 从 sm 的 todo 队列获取 binder_work 对象
        // 取出 binder_work 对象后，如果为空，thread->process_todo 置为 false
        if (binder_worklist_empty_ilocked(&thread->todo))
            thread->process_todo = false;
        case BINDER_WORK_TRANSACTION_COMPLETE:
    		...
            else
                cmd = BR_TRANSACTION_COMPLETE;
    ...
        // 把 BR_TRANSACTION_COMPLETE 命令拷贝到用户空间
        if (put_user(cmd, (uint32_t __user *)ptr)) {
}
```

注意，从 todo 队列取出 binder_work 对象后，todo 队列就会删除这个 binder_work 对象，此时 todo 队列就一个 binder_work 对象，<font color=red>**所以 binder_worklist_empty_ilocked() 返回 true，thread->process_todo = false**</font>，binder_thread_read() 执行完后就返回到了用户空间，回忆一下，前面 sm 在通过 waitForResponse() -> talkWithDriver() 向驱动发送 BC_REPLY 的时候进入的驱动，所以回到 talkWithDriver()，但是并没有做重要的事，继续返回到 waitForResponse()，

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::waitForResponse(Parcel *reply, status_t *acquireResult)
{
    ...
while (1) {
        if ((err=talkWithDriver()) < NO_ERROR) break;
        switch (cmd) {  // 处理 binder 驱动发来的命令
        case BR_TRANSACTION_COMPLETE:
            // TF_ONE_WAY 模式时传入的 reply 和 acquireResult 是 nullptr，
            // 则直接 finish 退出循环，不再等待 binder 驱动的回复
            if (!reply && !acquireResult) goto finish;
            break;
```

处理 BR_TRANCACTION_COMPLETE 命令，也没有重要工作，再回到 while 循环，又进入 talkWithDriver()，mIn.size = 256，mOut.size = 0，进入驱动执行 binder_thread_read()。

###### c.8 服务端挂起

``` c
// binder.c
static int binder_thread_read(struct binder_proc *proc,
                  struct binder_thread *thread,
                  binder_uintptr_t binder_buffer, size_t size,
                  binder_size_t *consumed, int non_block)
{
...
    wait_for_proc_work = binder_available_for_proc_work_ilocked(thread);
...
    if (wait_for_proc_work) {
        ...
    }
    if (non_block) {
        ...
    } else {
        ret = binder_wait_for_work(thread, wait_for_proc_work); // 进程睡眠的地方
    }

static int binder_wait_for_work(struct binder_thread *thread,
                bool do_proc_work)
{
    ...
    for (;;) { // 循环的作用是让线程被唤醒后再一次去检查一下condition是否满足
        prepare_to_wait(&thread->wait, &wait, TASK_INTERRUPTIBLE);
        // 唤醒条件 condition,如果满足则跳出循环，否则一直循环等待
        // thread->process_todo = true 时 binder_has_work_ilocked 
        if (binder_has_work_ilocked(thread, do_proc_work))
            break;
        ...
        schedule(); // 调用schedule()，让出cpu资源，开始休眠，进程真正睡眠的地方
        ...
    }
    ...
}
```

wait_for_proc_work = false，进入 binder_wait_for_work()，回忆一下[c.7 小节](# c.7 服务端处理 BR_TRANSACTION_COMPLETE 命令) 中 `thread->process_todo = false` ，<font color=red>**所以 sm 在此处挂起！！！**</font>具体逻辑可参考 [c.6 小节](# c.6 唤醒客户端)。

主要做了三件事：

- **将 tcomplete 加入到当前调用线程(sm)待处理的任务队列**
- **将 t 加入到目标(和 sm 通信的 client)的处理队列中**
- **wake_up_interruptible_sync()：唤醒客户端进程**

接下来继续看 client 进程，从前文分析得知，client 进程也是在 binder_wait_for_work() 出挂起，唤醒后继续往下执行。

###### d. 客户端继续执行  - 把  BR_TRANSACTION_COMPLETE/BR_REPLY 写入用户空间

``` c
// binder.c
static int binder_thread_read(struct binder_proc *proc,...)
...
        ret = binder_wait_for_work(thread, wait_for_proc_work); // 进程睡眠的地方
    }
    while (1) {
	...
        w = binder_dequeue_work_head_ilocked(list); // 从客户端的 todo 队列获取 binder_work 对象
        switch (w->type) { // 判断 binder_transaction() 时传入的 binder_work 的类型
        case BINDER_WORK_TRANSACTION: {
            binder_inner_proc_unlock(proc);
            t = container_of(w, struct binder_transaction, work); // 通过 w 获取 binder_transaction 事务
        } break;
        ...
        case BINDER_WORK_TRANSACTION_COMPLETE:
        case BINDER_WORK_TRANSACTION_ONEWAY_SPAM_SUSPECT: {
            if (proc->oneway_spam_detection_enabled &&
                   w->type == BINDER_WORK_TRANSACTION_ONEWAY_SPAM_SUSPECT)
                cmd = BR_ONEWAY_SPAM_SUSPECT;
            else
                cmd = BR_TRANSACTION_COMPLETE; // 返回到用户空间的命令
            ...
            kfree(w);
            binder_stats_deleted(BINDER_STAT_TRANSACTION_COMPLETE);
            if (put_user(cmd, (uint32_t __user *)ptr)) // 把命令写入用户空间的 ptr（read_buffer）
                return -EFAULT;
            ptr += sizeof(uint32_t); // ptr 跳过上述命令的地址空间
            ...
        } break;
        ...
        } // end switch w->type
        if (!t)
            continue; // 处理 BINDER_WORK_TRANSACTION_COMPLETE 时走到这里 continue，回到循环
        if (t->buffer->target_node) { // 是否存在目标节点，这里 target_node 为 sm 的 binder_node
            ...
        } else {
            trd->target.ptr = 0;
            trd->cookie = 0;
            cmd = BR_REPLY;
        }
        ...
        // 把 BR_REPLY 命令拷贝到用户空间
        if (put_user(cmd, (uint32_t __user *)ptr)) {
            if (t_from)
                binder_thread_dec_tmpref(t_from);
            binder_cleanup_transaction(t, "put_user failed",
                           BR_FAILED_REPLY);
            return -EFAULT;
        }
        ptr += sizeof(uint32_t);
        // 把 binder_transaction_data_secctx 数据拷贝到用户空间
        if (copy_to_user(ptr, &tr, trsize)) {
            if (t_from)
                binder_thread_dec_tmpref(t_from);
            binder_cleanup_transaction(t, "copy_to_user failed",
                           BR_FAILED_REPLY);
            return -EFAULT;
        }
```

客户端调用 binder_transaction() 时，客户端的 todo 队列添加了 BINDER_WORK_TRANSACTION_COMPLETE 命令，

sm 处理完数据向驱动发送 BC_REPLY 命令时也调用了 binder_transaction()，又向目标进程（之前和 sm 通信的进程，也就是客户端）的 todo 队列添加了 BINDER_WORK_TRANSACTION，所以现在客户端的 todo 链表有两个 binder_work，BINDER_WORK_TRANSACTION_COMPLETE 和 BINDER_WORK_TRANSACTION，在处理 BINDER_WORK_TRANSACTION_COMPLETE  时，t 还是 NULL，执行完 switch 语句后，直接就 continue 返回循环执行下一条 binder_work了，也就是 BINDER_WORK_TRANSACTION；

sm 执行 binder_transaction() 时并未给 target_node 赋值，所以这次 t->buffer->target_node 就是空值了，进入 else 分支，传递 BR_REPLY 给 cmd，接下来把 BR_REPLY 写入用户空间的 ptr(read_buffer)，把 binder_transaction_data_secctx 拷贝到用户空间的 ptr(read_buffer)，总结下来就是三件事：

- 把 BR_TRANSACTION_COMPLETE 写入 read_buffer
- 把 BR_REPLY 写入 read_buffer
- 把 binder_transaction_data_secctx 写入 read_buffer

到这里客户端的 binder_ioctl_write_read() 就执行完了，回到 talkWithDriver()，talkWithDriver() 没做什么有用的事，继续回到 waitForResponse()。

##### 1.2.2.2.2 处理 binder 驱动发来的命令 - BR_TRANSACTION_COMPLETE/BR_REPLY

``` cpp
// IPCThreadState.cpp
status_t IPCThreadState::waitForResponse(Parcel *reply, status_t *acquireResult)
{
    uint32_t cmd;
    int32_t err;

    while (1) {
        // 进一步调用 talkWithDriver 去执行写入数据到 binder 驱动
        if ((err=talkWithDriver()) < NO_ERROR) break;
        ...
        cmd = (uint32_t)mIn.readInt32(); // 从 mIn 读取 binder 驱动返回的命令
        ...
        switch (cmd) {  // 处理 binder 驱动发来的命令
        ...
        case BR_TRANSACTION_COMPLETE:
            // TF_ONE_WAY 模式时传入的 reply 和 acquireResult 是 nullptr，则直接 finish 退出循环，不再等待 binder 驱动的回复
            if (!reply && !acquireResult) goto finish;
            break;
            ...
        case BR_REPLY:
            {
                binder_transaction_data tr;
                err = mIn.read(&tr, sizeof(tr));
                ...
                if (reply) { // reply 不为空
                    if ((tr.flags & TF_STATUS_CODE) == 0) { // flags 还是 0
                        reply->ipcSetDataReference(
                            reinterpret_cast<const uint8_t*>(tr.data.ptr.buffer),
                            tr.data_size,
                            reinterpret_cast<const binder_size_t*>(tr.data.ptr.offsets),
                            tr.offsets_size/sizeof(binder_size_t),
                            freeBuffer);
                    } ...
```

非 ONEWAY 模式，BR_TRANSACTION_COMPLETE 分支什么也没做，BR_REPLY 分支调用了 Parcel.ipcSetDataReference()，主要作用就是根据参数的值重新初始化 Parcel 的数据和对象，客户端后续就可以使用 Parcel 提供的函数从中读取数据。

到这里 AMS 注册到 SM 的过程就结束了。

# 2. IPC 命令流程图

[IPC 命令流程图](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Binder_trancaction_command.png)

![Binder_trancaction_command](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Binder_trancaction_command.png "IPC 命令流程")

# 3. AMS 注册时序图

[Binder_AMS注册时序图](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Binder_AMS注册时序图.png)

![Binder_AMS注册时序图](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Binder_AMS注册时序图.png "AMS 注册时序图")



# 4. 总结

**getIServiceManager() 主要工作：**

- BinderInternal.getContextObject()：返回一个封装了 BpBinder(handle == 0) 的 BinderProxy 对象，BinderProxy 对象包含一个 mNativeData 的 long 型地址，其对应 native 层的 BinderProxyNativeData 结构体变量指针，这个结构体第一个参数是 mObject，指向 BpBinder(handle == 0)；
- ServiceManagerNative.asInterface()：获取 ServiceManagerProxy 对象，参数是 BinderProxy。

**addService() 主要工作：**

- writeTransactionData：打包数据和命令到 mOut；
- waitForResponse：写入数据和 <font color=green>**BC_TRANSACTION**</font> 命令到 binder 驱动
  - talkWithDriver()：根据 mIn.size 和 mOut.size 判断是否要执行 ioctl
    - 客户端 binder_thread_write()：处理 BC_TRANSACTION 命令，
    - 客户端 binder_transaction()：找到目标进程 sm 并向其传递传输 BINDER_WORK_TRANSACTION 命令和数据，向调用线程（客户端）传递 BINDER_WORK_TRANSACTION_COMPLETE 命令，<font color=red>**唤醒 sm**</font>；
    - a. 客户端 binder_thread_read()：<font color=red>**客户端进程挂起**</font>；
    - b. 服务端 binder_thread_read()：服务端处理命令 BINDER_WORK_TRANSACTION，驱动向服务端用户空间传递 <font color=green>**BR_TRANSACTION**</font> 命令；
    - 服务端 handleEvent()：获取并处理 BR_TRANSACTION 命令；
    - 服务端 transact()/onTransact()：处理 TRANSACTION_addService 并返回 reply；
    - 服务端 sendReply()：向驱动发送 <font color=green>**BC_REPLY**</font>；
    - 服务端 binder_thread_write()：处理 BC_REPLY 命令；
    - 服务端 binder_transaction()：找到客户端进程并向其传递 BINDER_WORK_TRANSACTION 命令和数据，向调用线程（sm）传递 BINDER_WORK_TRANSACTION_COMPLETE 命令，<font color=red>**唤醒客户端进程**</font>；
    - 服务端 binder_thread_read()：处理 BINDER_WORK_TRANSACTION_COMPLETE，驱动向 sm 用户空间发送 <font color=green>**BR_TRANCACTION_COMPLETE**</font> 命令
    - 服务端 waitForResponse()：处理 BR_TRANCACTION_COMPLETE 命令
    - c. 服务端 binder_thread_read()：<font color=red>**服务端挂起**</font>；
    - d. 客户端 binder_thread_read()：客户端处理命令 BINDER_WORK_TRANSACTION_COMPLETE 和 BINDER_WORK_TRANSACTION 命令，驱动向客户端用户空间传递 <font color=green>**BR_TRANSACTION_COMPLETE**</font> 和 <font color=green>**BR_REPLY**</font> 命令；
  - 客户端 waitForResponse()：处理 BR_TRANSACTION_COMPLETE 和 BR_REPLY 命令；

a 和 b 同时进行，c 和 d 同时进行，无先后顺序；

