---
title: Android - Binder机制(5)-AIDL/Proxy/Binder/Stub 关系梳理
date: 2025-01-20 22:24:55
tags:
categories: Android
copyright: true
password:
---



> Binder 中 **AIDL + Proxy + Binder + Stub** 的关系完整梳理。

<!--more-->

# 1. **几个核心概念**

在 Android 的 Binder IPC 里，AIDL 生成的代码里会包含三个关键部分：

- **Interface**（接口）
  - 你在 `.aidl` 文件里写的就是接口定义。
  - 生成的 `IXXX.java` 里定义了这个接口和它的 `Stub`、`Proxy`。
- **Stub**（服务端骨架类）
  - **继承自 `Binder`**，并且实现了 AIDL 接口。
  - 服务端要实现 Stub 的方法，然后把它注册给系统（比如 `ServiceManager.addService`）。
  - 它的作用：当 Binder 驱动把 IPC 数据传过来时，Stub 会负责 **解包 Parcel 并调用到真正的服务方法**。
- **Proxy**（客户端代理类）
  - 运行在客户端进程里，看起来就像一个本地对象，其实内部是 **通过 Binder 调用远程服务**。
  - 当你调用 Proxy 的方法时，它会把参数打包进 `Parcel`，通过 Binder 驱动发给服务端 Stub。

# 2. **AIDL 编译生成的代码结构**

比如你写了一个 `IMyAidlInterface.aidl`：

``` java
interface IMyAidlInterface {
    int add(int a, int b);
}
```

编译后生成的 `IMyAidlInterface.java` 核心结构大致是：

``` java
public interface IMyAidlInterface extends IInterface {
    int add(int a, int b) throws RemoteException;

    abstract class Stub extends Binder implements IMyAidlInterface {
        // 用来区分调用的方法
        static final int TRANSACTION_add = IBinder.FIRST_CALL_TRANSACTION;

        public Stub() {
            this.attachInterface(this, DESCRIPTOR);
        }

        // 把 IBinder 转换为接口
        public static IMyAidlInterface asInterface(IBinder obj) {
            if (obj == null) return null;
            IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
            if (iin != null && iin instanceof IMyAidlInterface) {
                return (IMyAidlInterface) iin;
            }
            return new Proxy(obj);  // 返回代理对象
        }

        // 收到远程调用时，onTransact 被调用
        @Override
        public boolean onTransact(int code, Parcel data, Parcel reply, int flags) {
            switch (code) {
                case TRANSACTION_add: {
                    int a = data.readInt();
                    int b = data.readInt();
                    int result = this.add(a, b); // 调用服务端实现
                    reply.writeInt(result);
                    return true;
                }
            }
            return super.onTransact(code, data, reply, flags);
        }
    }

    class Proxy implements IMyAidlInterface {
        private IBinder mRemote;

        Proxy(IBinder remote) {
            mRemote = remote;
        }

        @Override
        public int add(int a, int b) throws RemoteException {
            Parcel data = Parcel.obtain();
            Parcel reply = Parcel.obtain();
            data.writeInt(a);
            data.writeInt(b);
            mRemote.transact(Stub.TRANSACTION_add, data, reply, 0);
            int result = reply.readInt();
            return result;
        }
    }
}
```

可以看到：

- **Stub**：服务端用，接收 `Parcel` 并转发给真实实现。
- **Proxy**：客户端用，把调用打包成 `Parcel` 发给 Stub。



# 3. **Client/Server 如何实现**

- **服务端（Server）**
   继承 `Stub` 并实现方法：

  ``` java
  public class MyService extends IMyAidlInterface.Stub {
      @Override
      public int add(int a, int b) {
          return a + b;
      }
  }
  ```

  然后把这个服务注册出去（比如 `onBind` 里返回它）。

- **客户端（Client）**
   通过 `ServiceConnection` 获取到 `IBinder`，然后用 `Stub.asInterface(binder)` 拿到 **Proxy**：

  ``` java
  IMyAidlInterface service = IMyAidlInterface.Stub.asInterface(binder);
  int result = service.add(3, 5); // 实际是远程调用
  ```

# 4. **Stub 的作用总结**

你可以把 **Stub 理解为“服务端骨架”**：

1. 它继承自 `Binder`，所以能直接和 Binder 驱动通信。
2. 它把 AIDL 定义的接口方法 **映射到 Binder 的事务号（Transaction Code）**。
3. 收到客户端请求时，它的 `onTransact()` 方法会 **解包参数 → 调用服务端实现 → 打包结果返回**。

换句话说：

- **Proxy**：打包请求，发给 Binder 驱动。
- **Binder 驱动**：跨进程传输数据。
- **Stub**：解包请求，调用真正的实现。

## 4.1 简单记忆：

- **Client 调 Proxy**

  ``` java
  service.add(3, 5); // 实际执行 Proxy.add()
  ```

- **Proxy 调 Binder**

  ``` java
  mRemote.transact(Stub.TRANSACTION_add, data, reply, 0);
  ```

- **Binder 调 Stub**

  ``` java
  Stub.onTransact(int code, Parcel data, Parcel reply, int flags)
  ```

- **Stub 调实现类方法**

  ``` java
  int result = this.add(a, b); // 调到 MyService.add()
  ```

## 4.2 时序图

``` mermaid
sequenceDiagram
    participant Client
    participant Proxy
    participant Binder_Driver
    participant Stub
    participant Service_Impl

    Client->>Proxy: 调用 add(3, 5)
    Proxy->>Binder_Driver: transact(TRANSACTION_add, data, reply)
    Binder_Driver->>Stub: onTransact(TRANSACTION_add, data, reply)
    Stub->>Service_Impl: add(3, 5)
    Service_Impl-->>Stub: return 8
    Stub-->>Binder_Driver: reply.writeInt(8)
    Binder_Driver-->>Proxy: 返回 reply
    Proxy-->>Client: 返回结果 8

```

解读

1. **Client 调用接口**（其实就是 Proxy 的方法）。
2. **Proxy 封装参数，用 Binder IPC 发给 Binder 驱动**。
3. **Binder 驱动跨进程，把数据交给服务端 Stub.onTransact()**。
4. **Stub 解析数据后调用 Service_Impl（你写的实现类方法）**。
5. **结果逐层返回，最后 Proxy 返回给 Client**。



## 4.3 调用链代码对照表

| 步骤                   | 调用方                         | 代码位置                                                     | 关键逻辑                                                   |
| ---------------------- | ------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------- |
| ① Client 调 Proxy      | **Client 进程**                | `IMyAidlInterface service = IMyAidlInterface.Stub.asInterface(binder); int result = service.add(3, 5);` | 这里表面上调的是 `service.add()`，其实是 **Proxy.add()**。 |
| ② Proxy 调 Binder      | **Proxy 类（AIDL 自动生成）**  | `public int add(int a, int b) { Parcel _data = Parcel.obtain(); Parcel _reply = Parcel.obtain(); mRemote.transact(TRANSACTION_add, _data, _reply, 0); ... }` | Proxy 封装参数，用 `Binder.transact()` 发给 Binder 驱动。  |
| ③ Binder 驱动调用 Stub | **Binder 内核 → Server 进程**  | `onTransact(int code, Parcel data, Parcel reply, int flags)` （Stub 自动生成） | Binder 驱动把数据交给服务端 `Stub.onTransact()`。          |
| ④ Stub 调实现类方法    | **Stub 抽象类 → Service_Impl** | `case TRANSACTION_add: int _arg0 = data.readInt(); int _arg1 = data.readInt(); int _result = this.add(_arg0, _arg1); reply.writeInt(_result); return true;` | Stub 解包数据 → 调用 `add()` → 把结果写回 reply。          |
| ⑤ 实现类方法执行       | **你写的 Service 实现类**      | `public class MyService extends IMyAidlInterface.Stub { @Override public int add(int a, int b) { return a + b; } }` | 真正业务逻辑执行，返回结果。                               |
| ⑥ 结果回传 Proxy       | **Stub → Binder 驱动 → Proxy** | Stub 把结果写进 `reply` → Binder 驱动跨进程回传 → Proxy 读出返回值。 |                                                            |
| ⑦ Proxy 返回 Client    | **Proxy → Client**             | `_reply.readInt();`                                          | Proxy 返回结果给调用者，Client 得到最终返回值。            |

