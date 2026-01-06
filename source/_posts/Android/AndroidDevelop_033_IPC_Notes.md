---
title: Android - 跨进程通信随笔
date: 2023-02-21 23:22:05
tags:
categories: Android
copyright: true
password:
---

> Android 跨进程通信随笔。

<!--more-->

# 跨进程通信

## Binder 使用

常见通信方式：

- Service.bindService()
- ServiceManager.getService()

AIDL 方法参数修饰：

- in：客户端流向服务端，只有客户端可以修改，服务端修改了客户端也不会收到

- out：服务端流向客户端，只有服务端可以修改，服务端收到的会是空数据，比如 ViewRootImpl 中的 outSurfaceControl

- inout：双向都可修改

## socket

Android 中 socket 代码：`system/core/libcutils/socket_local_client_unix.c`

### 普通文件系统套接字（默认方式）

``` cpp
struct sockaddr_un addr;
addr.sun_family = AF_UNIX;
strcpy(addr.sun_path, "/tmp/mysocket");  // 普通路径
// 会在文件系统中创建 /tmp/mysocket 文件
```

**特点：**

- 在文件系统中可见（`ls -l /tmp/mysocket` 可以看到）
- 有权限控制（文件权限位）
- 需要手动清理（程序退出后文件还在）
- 路径长度受限制

### 抽象套接字名（Linux 特有）

``` cpp
struct sockaddr_un addr;
addr.sun_family = AF_UNIX;
addr.sun_path[0] = 0;  // 关键操作：将第一个字节设为 '\0'
strcpy(&addr.sun_path[1], "myabstractsocket");  // 从第二个字节开始
```

**关键点：`sun_path[0] = '\0'` 的作用：**

完整示例

``` cpp
#include <sys/socket.h>
#include <sys/un.h>
#include <stdio.h>
#include <string.h>

int main() {
    int sockfd = socket(AF_UNIX, SOCK_STREAM, 0);
    
    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    
    // 关键：第一个字节设为 0
    addr.sun_path[0] = 0;
    
    // 套接字名从第二个字节开始
    const char* abstract_name = "my_application_socket";
    strncpy(&addr.sun_path[1], abstract_name, 
            sizeof(addr.sun_path) - 2);
    
    bind(sockfd, (struct sockaddr*)&addr, 
         sizeof(addr.sun_family) + 1 + strlen(abstract_name));
    
    // 现在可以监听、接受连接了...
    
    return 0;
}
```

两种方式对比

| 特性           | 文件系统套接字       | 抽象套接字（`sun_path[0]=0`） |
| :------------- | :------------------- | :---------------------------- |
| 文件系统可见性 | 是，创建 socket 文件 | 否，无文件系统实体            |
| 命名空间       | 全局文件系统         | 内核抽象命名空间              |
| 名称冲突       | 路径必须唯一         | 名称在系统范围内唯一即可      |
| 权限控制       | 通过文件权限         | 通过进程权限（UID/GID）       |
| 清理           | 需手动 `unlink()`    | 自动随进程结束而销毁          |
| 跨平台         | 所有 Unix 系统支持   | **仅 Linux 支持**             |
| 名称长度       | 受文件系统路径限制   | 最多约 107 字节               |

**总结：`serun.sun_path[0] = 0` 是 Linux 特有的技巧，用于创建不在文件系统中留下实体的「抽象套接字」，避免了文件系统污染和清理问题，特别适合临时或私有进程间通信。**

查看创建的 socket 状态：

``` shell
netstat -an | grep server-socket
```

## epoll

Socket 存在的问题：

涉及 IO 的 accept/read/write 都是阻塞 IO 的，如果有成千上万个 Client 需要通信

- accept 成功后，为每个 Client 开启一个线程进行读取，线程太多不可行

- accept 成功后，开启一个子线程，然后在这个子线程中使用非阻塞的 read() 循环读取（while 1）多个客户端的消息(如下代码)，但是如果没有数据就会太浪费 CPU

   ``` cpp
   // 设置成非阻塞模式
   flags = fcntl(sockfd, F_GETFL, 0); //获取文件的flags值
   fcntl(sockfd, F_SETFL, flags | O_NONBLOCK); 
   
   // 设置成阻塞模式
   flags = fcntl(sockfd,F_GETFL,0);
   fcntl(sockfd,F_SETFL,flags&~O_NONBLOCK); 
   
   // 循环调用 read 读取各个客户端的数据
   while(1) {
   	read(fd1...);//客户1
   	read(fd2...);//客户2
   	read(fd3...);//客户3
   }
   ```

如此引出 I/O 多路复用技术（I/O multiplexing），复用是指在同一个进程（线程）中，处理多路 I/O，多路指多个文件描述符。



使用流程

- epoll_create：创建一个epoll的句柄，size用来告诉内核这个监听的数目一共有多大。这个参数不同于select()中的第一个参数，给出最大监听的fd+1的值。需要注意的是，当创建好epoll句柄后，它就是会占用一个fd值，在linux下如果查看/proc/进程id/fd/，是能够看到这个fd的，所以在使用完epoll后，必须调用close()关闭，否则可能导致fd被耗尽。

   ``` cpp
   int epoll_create(int size);
   ```

- epoll_ctl：epoll的事件注册函数，注册要监听的事件类型，第一个参数是epoll_create()的返回值，第二个参数表示动作，用三个宏来表示：

   - EPOLL_CTL_ADD：注册新的fd到epfd中；
   - EPOLL_CTL_MOD：修改已经注册的fd的监听事件；
   - EPOLL_CTL_DEL：从epfd中删除一个fd；

   ``` cpp
   int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
   ```

   第三个参数是需要监听的fd，第四个参数是告诉内核需要监听什么事，struct epoll_event结构如下：

   ``` cpp
   struct epoll_event {
     __uint32_t events;  /* Epoll events */
     epoll_data_t data;  /* User data variable */
   };
   ```

   events 类型为 EPOLLIN 表示对应的文件描述符可以读，EPOLLOUT 表示对应的文件描述符可以写；

- epoll_wait：等待事件的产生

## SocketPair

普通 socket（伪代码）：

``` cpp
// 客户端
socket();
connect();
    
// 服务端
socket();
bind();
listen();
accept()
```

使用 socketpair

``` cpp
int fd[2];
socketpair(AF_UNIX, SOCK_STREAM, 0, fd);
setsockopt()
```

IPCThreadState —— 每个 binder 线程都有一个这个对象

## Native 之间 binder 通信

**Server 端**

- 继承 BBinder
- 实现 onTransact
- 获取客户端 callback（也是一个 BBinder 对象）
- addService
- joinThreadPool
- callback -> transact()

``` c++
// server.cpp
#include <binder/IServiceManager.h>
#include <binder/IBinder.h>
#include <binder/Parcel.h>
#include <binder/ProcessState.h>
#include <binder/IPCThreadState.h>

using namespace android;
#ifdef LOG_TAG
#undef LOG_TAG
#endif

#define LOG_TAG "sampleService"
#define SAMPLE_SERIVCE_DES "my_hello"
#define SAMPLE_CB_SERIVCE_DES "android.os.SampleCallback"
#define SRV_CODE 1
#define CB_CODE 1

class SampleService: public BBinder {
public:
  SampleService() {
    ALOGE("Server ------------------------------ %d",__LINE__);
    mydescriptor = String16(SAMPLE_SERIVCE_DES);
  }

  virtual ~SampleService() {
  }

  virtual const String16& getInterfaceDescriptor() const {
    return mydescriptor;
  }

protected:

  void callFunction(int val) {
    ALOGE("Server ------------------------------ %d",__LINE__);
    ALOGI( "Service: %s(), %d, val = %d",__FUNCTION__,__LINE__,val);
  }

  virtual status_t onTransact(uint32_t code, const Parcel& data, Parcel* reply, uint32_t flags = 0) {
    ALOGD( "Service onTransact,line = %d, code = %d",__LINE__, code);
    switch (code) {
    case SRV_CODE:
      //读取Client传过来的IBinder对象
      callback = data.readStrongBinder();

      if(callback != NULL)
       {
         Parcel _data, _reply;
	 _data.writeInt32(1);
	 _data.writeInt32(2);
	 _data.writeInt32(3);

	 //2.String8类型
	 _data.writeString8(String8("who..."));
	 _data.writeString8(String8("are..."));
	 _data.writeString8(String8("you..."));
	 //回调客户端
         int ret = callback->transact(CB_CODE, _data, &_reply, 0);
       }
      //调用server端的
      callFunction(6666);
      break;
    default:
      return BBinder::onTransact(code, data, reply, flags);
    }
    return 0;
  }

private:
  String16 mydescriptor;
  sp<IBinder> callback;
};

int main() {
  sp<IServiceManager> sm = defaultServiceManager();
  SampleService* samServ = new SampleService();
  status_t ret = sm->addService(String16(SAMPLE_SERIVCE_DES), samServ);

  ALOGD("Service addservice");
  //ProcessState::self()->startThreadPool();
  printf("server before joinThreadPool \n");
  IPCThreadState::self()->joinThreadPool( true);
  printf("server before joinThreadPool \n");
  return 0;
}

```



**客户端**

- 继承 BBinder
- 实现 onTransact
- 获取服务端 Binder
- joinThreadPool
- transact()

``` c++
// client.cpp
#include <binder/IServiceManager.h>
#include <binder/IBinder.h>
#include <binder/Parcel.h>
#include <binder/ProcessState.h>
#include <binder/IPCThreadState.h>
#include <private/binder/binder_module.h>
#include <binder/IInterface.h>
#include <binder/Parcel.h>
#include <binder/Binder.h>

using namespace android;
#ifdef LOG_TAG
#undef LOG_TAG
#endif

#define LOG_TAG "binderCallbackClient"
#define SAMPLE_SERIVCE_DES "my_hello"
#define SAMPLE_CB_SERIVCE_DES "android.os.SampleCallback"
#define SRV_CODE 1
#define CB_CODE 1
class SampeCallback : public BBinder
{
public:
  SampeCallback()
  {
    ALOGE("Client ------------------------------ %d",__LINE__);
    mydescriptor = String16(SAMPLE_CB_SERIVCE_DES);
  }
  virtual ~SampeCallback() {
  }
  virtual const String16& getInterfaceDescriptor() const{
    return mydescriptor;
  }
protected:

  void callbackFunction(int val) {
    ALOGE(" -----------callback Client ok------------------- %d val = %d",__LINE__,val);
  }

  virtual status_t onTransact( uint32_t code, const Parcel& data,Parcel* reply,uint32_t flags = 0){
    ALOGD( "Client onTransact, line = %d, code = %d",__LINE__,code);
    int val_1,val_2,val_3;
    String8 str_1,str_2,str_3;
    switch (code){
    case CB_CODE:
      //1.读取int32类型数据
      val_1 = data.readInt32();
      val_2 = data.readInt32();
      val_3 = data.readInt32();

      ALOGE("Client ------------------------------ %d, read int32 = %d",__LINE__,val_1);
      ALOGE("Client ------------------------------ %d, read int32 = %d",__LINE__,val_2);
      ALOGE("Client ------------------------------ %d, read int32 = %d",__LINE__,val_3);

      //2.读取String8类型字符串;str_1.string()-->String8转换char类型数组
      str_1 = data.readString8();
      str_2 = data.readString8();
      str_3 = data.readString8();
      ALOGE("Client ------------------------------ %d, read String = %s",__LINE__,str_1.string());
      ALOGE("Client ------------------------------ %d, read String = %s",__LINE__,str_2.string());
      ALOGE("Client ------------------------------ %d, read String = %s",__LINE__,str_3.string());

      callbackFunction(1234567);
      break;

    default:
      return BBinder::onTransact(code, data, reply, flags);
    }
    return 0;
  }
private:
  String16 mydescriptor;
};

int main()
{
  sp<IServiceManager> sm = defaultServiceManager();
  sp<IBinder> ibinder = sm->getService(String16(SAMPLE_SERIVCE_DES));
  if (ibinder == NULL){
    ALOGW( "Client can't find Service" );
           return -1;
     }
     Parcel _data,_reply;
     SampeCallback *callback = new SampeCallback();
     //写入客户端的callback
     _data.writeStrongBinder(sp<IBinder>(callback));
     _data.writeInterfaceToken(String16(SAMPLE_CB_SERIVCE_DES));
     int ret = ibinder->transact(SRV_CODE, _data, &_reply, 0);
    printf("Client before joinThreadPool \n");
    //ProcessState::self()->startThreadPool();
    IPCThreadState::self()->joinThreadPool();
    printf("Client ------------------------------ main end");
// while(1);
    return 0;
}

```



## C++ 与 Java 之间的 binder 通信

服务端

- 和上面的服务端基本一样

``` cpp
#include <binder/IServiceManager.h>
#include <binder/IBinder.h>
#include <binder/Parcel.h>
#include <binder/ProcessState.h>
#include <binder/IPCThreadState.h>
using namespace android;
#ifdef LOG_TAG
#undef LOG_TAG
#endif

#define LOG_TAG "sampleService"
#define SAMPLE_SERIVCE_DES "sample.hello"
#define FUNC_CALLFUNCTION 1

class SampleService: public BBinder {
public:
  SampleService() {
    mydescriptor = String16(SAMPLE_SERIVCE_DES);
  }
     
  virtual ~SampleService() {
  }

  virtual const String16& getInterfaceDescriptor() const {
    return mydescriptor;
  }
     
protected:     
  void callFunction() {
    ALOGE( "Service callFunction-----------");
  }
     
  virtual status_t onTransact(uint32_t code, const Parcel& data,
			      Parcel* reply, uint32_t flags = 0) {
    ALOGD( "Service onTransact, code = %d" , code);
    switch (code) {
    case FUNC_CALLFUNCTION:
      callFunction();
      break;
    default:
      return BBinder::onTransact(code, data, reply, flags);
    }
    return 0;
  }

private:
  String16 mydescriptor;
};

int main() {
  sp < IServiceManager > sm = defaultServiceManager();
  SampleService* samServ = new SampleService();
  status_t ret = sm->addService(String16(SAMPLE_SERIVCE_DES), samServ);
  ALOGD("Service main addservice ");
  ProcessState::self()->startThreadPool();
  IPCThreadState::self()->joinThreadPool( true);
  return 0;
}
```

配置 Android.mk

``` makefile
LOCAL_PATH:= $(call my-dir)
include $(CLEAR_VARS)

LOCAL_SRC_FILES:= server_binder.cpp
LOCAL_SHARED_LIBRARIES := liblog \
    libcutils \
    libbinder \
    libutils \
    libhardware
LOCAL_MODULE:= binder_for_java
include $(BUILD_EXECUTABLE)
```



客户端

- java 实现的客户端，也基本上一样，只不过是写法不一样

``` java
package com.test.frameworkBinder;

import android.os.IBinder;
import android.os.RemoteException;
import android.os.ServiceManager;
import android.os.Parcel;
import android.util.Log;
public class ClientDemo {
  private static final java.lang.String DESCRIPTOR = "sample.hello";
  private static final int FUNC_CALLFUNCTION = 1;
  public static void main(String[] args) throws RemoteException {
    testService();
  }
  public static void testService(){
    Log.i("ClentDemo", "Client main ");
    Parcel _data = Parcel.obtain();
    Parcel _reply = Parcel.obtain();
    IBinder b = ServiceManager.getService(DESCRIPTOR);
    try {
      _data.writeInterfaceToken(DESCRIPTOR);
      b.transact(FUNC_CALLFUNCTION, _data, _reply, 0);
      _reply.readException();
      _reply.readInt();
    } catch (RemoteException e) {
      e.printStackTrace();
    } finally {
      _reply.recycle();
      _data.recycle();
    }
  }
}

```

配置 Android.mk

``` makefile
LOCAL_PATH:= $(call my-dir)
include $(CLEAR_VARS)

LOCAL_SRC_FILES := $(call all-subdir-java-files)
LOCAL_MODULE := ClientDemo 
LOCAL_MODULE_TAGS := optional
LOCAL_DEX_PREOPT := false 
include $(BUILD_JAVA_LIBRARY)
```



## Binder 系统中的对象

详解 BinderProxy/BpBinder/BBinder/JavaBBinder/Binder 之间的关系

### BinderProxy 和 BpBinder 的关系

通过 asInterface(BpBinder) 把 BpBinder 转换为 BinderProxy，实际上是 `javaObjectForIBinder()` 函数，BinderProxy 中有个 mNativeData，其中的 mObject 指向 BpBinder，AIDL 生成的 Proxy.mRemote 就是指向 BpBinder

**mRemote 来源：**

> 驱动层把 Server 端的 Binder 对象发来之后，客户端要通过 Parcel `readStrongBinder()` 读取， `readStrongBinder() -> unflatten_binder() -> getStrongProxyForHandle() -> javaObjectForIBinder()`，把 BpBinder 转换为了 BinderProxy，然后 `mRemote.transact() -> BinderProxy.transact() -> transactNative() -> BpBinder.transact() -> android_os_Proxy_transact() -> IPCThreadState.transact()`

### JavaBBinder 和 Binder 之间的关系

#### Android 9 以前版本

Binder 就是 Java 层创建的一个继承了 Stub 的 Service 对象：

``` java
public class MyService extends IMyService.Stub { }
```

调用其父类 Binder 的构造函数:

``` java
public Binder() {
    init(); // 调用 native init()
}
```

init() 会自动把 **this 对象** 作为第一个参数传给 JNI 层，this 即 Binder 对象，JNI 函数在哪里？

``` cpp
// android_util_Binder.cpp
static void android_os_Binder_init(JNIEnv* env, jobject obj)
{
    JavaBBinderHolder* jbh = new JavaBBinderHolder();
    env->SetLongField(obj, gBinderOffsets.mObject, (jlong)jbh);
}

 class JavaBBinderHolder : public RefBase
  {
  public:
      sp<JavaBBinder> get(JNIEnv* env, jobject obj)
      {
          AutoMutex _l(mLock);
          sp<JavaBBinder> b = mBinder.promote();
          if (b == NULL) {
              b = new JavaBBinder(env, obj);
              mBinder = b;
              ...
          }
  
          return b;
      }
```

这里 `android_os_Binder_init()` 的 obj 参数就是传入的 Binder 对象了，即 MyService 对象，然后把常见的 jbh 的指针存入 obj.mObject 变量中，即存入 Java Binder 的 mObject 变量中，这样以后 java 层访问 mObject，就能拿到对应的 native 对象；

#### Android 9 及之后的版本

从 Android 9 开始，Binder 的构造方法中没有了 `init()`，取而代之的是 `getNativeBBinderHolder()` 这个 native 方法，

``` java
// Binder.java
public Binder(@Nullable String descriptor) {
     mObject = getNativeBBinderHolder();
// android_util_Binder.cpp
static jlong android_os_Binder_getNativeBBinderHolder(JNIEnv* env, jobject clazz)
{
    JavaBBinderHolder* jbh = new JavaBBinderHolder();
    return (jlong) jbh;
}
```

这里 native 层没有了把 jbh 指针传入 `Binder.mObject` 的操作了，而是直接返回 jbh 的指针给到 `Binder.mBoject` 变量，所以 Holder 指针还是最终存入了 `mObject`，区别在于写入操作从 native 层移动到了 Java 层；

#### 总结

- Android 9 以前：构造 Binder 的时候，通过 `init()` 调用到 native 层的 `android_os_Binder_init(JNIEnv* env, jobject obj)`，在其中传入 Java Binder 对象 obj 构造 JavaBBinderHolder 对象（当 jbh 的 get() 被调用时，就会创建 JavaBBinder 对象），并把 jbh 的指针传给 Java 层的 Binder.mObject 变量，这样 Java Binder 就可以通过 jbh 指针获取到 JavaBBinder，而 JavaBBinder 也持有了 Java 层的 Binder obj
- Android 9 及之后：构造 Binder 的时候，通过  `getNativeBBinderHolder()` 获取 jbh 的指针
- **JavaBBinder 包含 Java Binder 对象（把 obj 传入 JavaBBinder）** → Native 层可以随时调用 Java Binder 方法
- **Java Binder 保存 JavaBBinder 指针（把持有 JavaBBinder 的 jbh 指针传给 Binder.mObject）** → Java 层可以通过 JNI 调用 native 逻辑



![img](../../images/2025/IPC.png)

## Binder bug 分析

使用 `adb logcat -b all` 抓取其中的 kernel 日志，<font color=red>**kernel 在日志中的表现是进程号和线程号都是 0；**</font>

在 binder 通信中，驱动层的 `binder_transaction()` 中的 `binder_alloc_new_buf()` 会在 **服务端（Server）进程** 的地址空间中为服务端申请内存，用于存放 IPC 的数据，而在 IPC 结束时释放内存，问题发生的原因是客户端调用的跨进程通信方法为 `oneway` 方法，然后客户端短时间内频繁调用多次，而内存还没来得及释放，因为前面的还在 async_todo 队列没有处理，导致内存被耗尽；

## Binder 传输大文件的方法

- 共享内存(适用于 Bitmap/大图像)
- 文件描述符(适用于任何大文件)
- 分块传输
- ContentProvider

### 使用共享内存（Ashmem）

```java
// Android 原生支持 Bitmap 通过共享内存传输
public void sendLargeBitmap(Bitmap bitmap) {
    // Bitmap 默认使用 Ashmem 时，Binder 只传递文件描述符
    bitmap.setHasAlpha(true);
    
    // 配置为使用 Ashmem
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inPreferredConfig = Bitmap.Config.ARGB_8888;
    options.inPurgeable = true;  // 可清除，使用共享内存
    
    // 或者直接创建 Ashmem Bitmap
    Bitmap ashmemBitmap = Bitmap.createBitmap(
        width, height, Bitmap.Config.ARGB_8888, 
        true,  // isMutable
        false  // 不使用共享内存？实际会自动使用
    );
    
    Parcel parcel = Parcel.obtain();
    bitmap.writeToParcel(parcel, 0);  // 自动使用 Ashmem 优化
    parcel.setDataPosition(0);
    
    // 传输 Parcel（实际只传 fd）
    service.receiveBitmapParcel(parcel);
}
```

验证是否使用共享内存

``` java
Bitmap bitmap = ...;
if (bitmap.isMutable() && NativeAllocationRegistry.isNativeAllocation(bitmap)) {
    Log.d("Bitmap", "使用共享内存分配");
}
```

### 文件描述符

``` java
// AIDL 接口定义
interface IFileService {
    // 传递文件描述符，而不是文件数据
    oneway void sendLargeFile(in ParcelFileDescriptor pfd, long fileSize);
}

// 客户端实现
public void sendLargeFile(File largeFile) {
    try (ParcelFileDescriptor pfd = ParcelFileDescriptor.open(
            largeFile, ParcelFileDescriptor.MODE_READ_ONLY)) {
        
        // 只传递 fd，不传递文件内容
        service.sendLargeFile(pfd, largeFile.length());
    }
}

// 服务端接收
@Override
public void sendLargeFile(ParcelFileDescriptor pfd, long fileSize) {
    try (FileInputStream fis = new FileInputStream(pfd.getFileDescriptor())) {
        // 从文件描述符读取数据
        byte[] buffer = new byte[8192];
        int read;
        while ((read = fis.read(buffer)) != -1) {
            // 处理数据...
        }
    }
}
```

### 分块传输

``` java
// AIDL 定义分块接口
interface IChunkTransfer {
    void startTransfer(String fileName, long totalSize);
    oneway void sendChunk(in byte[] chunk, int chunkId);
    void endTransfer(String fileName, boolean success);
}

// 客户端分块发送
public void sendFileInChunks(File file, int chunkSize) {
    String fileName = file.getName();
    long totalSize = file.length();
    
    service.startTransfer(fileName, totalSize);
    
    try (FileInputStream fis = new FileInputStream(file)) {
        byte[] buffer = new byte[chunkSize];  // 例如 64KB
        int chunkId = 0;
        int read;
        
        while ((read = fis.read(buffer)) != -1) {
            if (read < buffer.length) {
                // 最后一块可能不满
                byte[] lastChunk = Arrays.copyOf(buffer, read);
                service.sendChunk(lastChunk, chunkId++);
            } else {
                service.sendChunk(buffer, chunkId++);
            }
        }
        
        service.endTransfer(fileName, true);
    }
}
```

### **ContentProvider + Uri**

``` java
// 1. 将文件保存到 ContentProvider
public Uri saveBitmapToProvider(Context context, Bitmap bitmap) {
    File cacheDir = context.getExternalCacheDir();
    File tempFile = new File(cacheDir, "temp_" + System.currentTimeMillis() + ".jpg");
    
    try (FileOutputStream fos = new FileOutputStream(tempFile)) {
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, fos);
        
        // 生成可共享的 Uri
        return FileProvider.getUriForFile(
            context,
            context.getPackageName() + ".fileprovider",
            tempFile
        );
    }
}

// 2. 只传递 Uri
service.processImageUri(uri.toString());

// 3. 服务端读取 Uri
@Override
public void processImageUri(String uriString) {
    Uri uri = Uri.parse(uriString);
    try (InputStream is = getContentResolver().openInputStream(uri)) {
        Bitmap bitmap = BitmapFactory.decodeStream(is);
        // 处理 bitmap...
    }
}
```

# 
