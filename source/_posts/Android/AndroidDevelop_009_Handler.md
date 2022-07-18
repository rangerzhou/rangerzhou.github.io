---
title: Android - Handler原理分析
date: 2021-10-27 23:18:46
tags:
categories: Android
copyright: true
password:
---



> Handler 消息机制是 Android 系统的消息传递机制，用于同进程的线程间通信，由 Message、MessageQueue、Hander、Looper 共同组成。

<!--more-->

# 代码路径

| frameworks/base/core/java/android/os/Message.java      |
| ------------------------------------------------------ |
| frameworks/base/core/java/android/os/MessageQueue.java |
| frameworks/base/core/java/android/os/Handler.java      |
| frameworks/base/core/java/android/os/Looper.java       |
| java/lang/ThreadLocal.java                             |

# Handler 机制

Handler 机制主要涉及如下几个类：

- Message：消息实体；
- MessageQueue：消息队列，用于存储消息和管理消息；
- Handler：消息的真正处理者，具备发送消息、接收消息、处理消息、移除消息等功能；
- Looper：轮询消息队列，取出消息交给 Handler 处理，一个线程只有一个 Looper；
- ThreadLocal：线程本地存储区（Thread Local Storage，简称 TLS），每个线程都有自己私有的TLS，不同线程之间彼此无法访问对方的 TLS 区域，ThreadLocal 的作用是提供线程内的局部变量 TLS；

## 1. Message

``` java
// Message.java
public final class Message implements Parcelable {
    public int what; // 消息类别，唯一标识
    public int arg1; // 参数 1
    public int arg2; // 参数 2
    public Object obj; // 消息内容
    public long when; // 消息触发时间戳
    /*package*/ Handler target; // 消息响应方
    /*package*/ Runnable callback; // Message 的回调方法
    /*package*/ Message next; // 指向当前 Message 后面的节点
    private static final int MAX_POOL_SIZE = 50;
```

每个创建的消息都包含上述一个或者多个内容，消息池默认大小 *MAX_POOL_SIZE = 50*；

### 获取 Message 的方式

有三种方式获取 Message：

``` java
Message msg = handler.obtainMessage();
Message msg = Message.obtain();
Message msg = new Message();
```

首先来看 Handler.obtainMessage()：

``` java
// Handler.java
    public final Message obtainMessage()
    {
        return Message.obtain(this); // 传递当前 handler
    }
```

可知最终也是调用到 Message.obtain()；

``` java
// Message.java
    public static Message obtain(Handler h) {
        Message m = obtain();
        m.target = h; // 将当前 handler 赋给 message.target

        return m;
    }
    public static Message obtain() {
        synchronized (sPoolSync) { // sPoolSync 是一个 Object 对象，用来同步保证线程安全
            // sPoll 是在 Looper.loop() -> loopOnce() 中 dispatchMessage() 后 Message.recycleUnchecked() 回收的 Message
            if (sPool != null) {
                Message m = sPool;
                sPool = m.next;
                m.next = null;
                m.flags = 0; // clear in-use flag
                sPoolSize--;
                return m;
            }
        }
        return new Message();
    }
```

如果消息池中有 Message 则直接取出返回，否则 new 一个 Message；

**日常使用时优先使用 `Message.obtain()` 或者 `Handler.obtainMessage()` 获取消息，可以检查是否有可以复用的 Message，避免频繁创建、销毁 Message 对象，可优化内存和性能；**

## 2. MessageQuene

MessageQueue 是用来存放 Message 的地方，虽然名为消息队列，但是实际上是使用 <font color=red>**单链表**</font> 数据结构来维护消息的；

从前述 Message 对象看到，每个 Message 都持有一个 next 属性，而 next 属性也是一个 Message 对象，所以 MessageQueue 是一个**单链表**，同时 Message 对象还有一个 when 属性，在 MessageQueue 中会根据 when 值**从小到大**进行插入，when 值最小的在表头，所以 MessageQueue 中的消息是**有优先级的**；

### MessageQueue 构造函数

``` java
// MessageQueue.java
    MessageQueue(boolean quitAllowed) {
        mQuitAllowed = quitAllowed; // 消息队列是否可以销毁，主线程的队列不可以销毁需要传入 false
        mPtr = nativeInit();
    }
```

mQuitAllowed 决定消息队列是否可以销毁，主线程的队列是不可以销毁的，需要传入 false；

MessageQueue 主要有两个操作，插入消息（MessageQueue.enqueueMessage）和读取消息(MessageQueue.next)；

### enqueueMessage() 插入消息

``` java
// MessageQueue.java
    boolean enqueueMessage(Message msg, long when) {
        ...
        // 内置锁（由系统控制 lock 和 unlock），对所有调用同一个 MQ 对象的线程来说都是互斥的
        // 1线程->1Looper->1MQ，所以主线程就只有一个 MQ 对象，那么所有子线程向主线程发送消息的时候，
        // 主线程一次只处理一个消息，其他消息都需要等待，如此消息队列就不会混乱
        synchronized (this) {
            ...
            msg.markInUse();
            msg.when = when;
            Message p = mMessages; // 当前链表头结点
            boolean needWake;
            if (p == null || when == 0 || when < p.when) { // 插入队列头部
                // New head, wake up the event queue if blocked.
                msg.next = p;
                mMessages = msg;
                needWake = mBlocked;
            } else { // 根据 when 值插入到适当位置
                // Inserted within the middle of the queue.  Usually we don't have to wake
                // up the event queue unless there is a barrier at the head of the queue
                // and the message is the earliest asynchronous message in the queue.
                needWake = mBlocked && p.target == null && msg.isAsynchronous();
                Message prev;
                for (;;) {
                    prev = p;
                    p = p.next;
                    if (p == null || when < p.when) {
                        break;
                    }
                    if (needWake && p.isAsynchronous()) {
                        needWake = false;
                    }
                }
                msg.next = p; // invariant: p == prev.next
                prev.next = msg;
            }

            // We can assume mPtr != 0 because mQuitting is false.
            if (needWake) {
                nativeWake(mPtr);
            }
        }
        return true;
    }
```

MessageQueue 中有一个 `Message mMessages` 属性，代表消息队列头节点，向消息队列中插入消息时，如果 `p==null（消息队列为空）|| when == 0 || when < p.when(当前要插入消息的 when 小于消息队列头节点的 when)`，则把当前消息插入到消息队列头节点，并且赋给 mMessages；

否则和消息队列中现有 Message 的 when 值进行比较，插入到适当位置；

### next() 取消息

``` java
// MessageQueue.java
    Message next() {
        // Return here if the message loop has already quit and been disposed.
        // This can happen if the application tries to restart a looper after quit
        // which is not supported.
        final long ptr = mPtr;
        if (ptr == 0) {
            return null;
        }

        int pendingIdleHandlerCount = -1; // -1 only during first iteration
        // -1：一直阻塞不会超时；0：不会阻塞，立即返回；>0：最长阻塞时间（毫秒）
        int nextPollTimeoutMillis = 0;
        for (;;) {
            if (nextPollTimeoutMillis != 0) {
                Binder.flushPendingCommands();
            }

            nativePollOnce(ptr, nextPollTimeoutMillis); // 阻塞多久
            // 此处加锁的目的是为了 next() 函数和 enqueueMessage() 函数互斥，如此插入消息和读取消息就会互斥，
            // 才能保证多线程访问的时候 MQ 的有序进行
            synchronized (this) {
                // Try to retrieve the next message.  Return if found.
                final long now = SystemClock.uptimeMillis(); // 获取系统开机到现在的时间
                Message prevMsg = null;
                Message msg = mMessages; // 当前链表的头结点
                if (msg != null && msg.target == null) {
                    // 如果 target == null，那么就是同步屏障，循环遍历，一直往后找到第一个异步的消息
                    // Stalled by a barrier.  Find the next asynchronous message in the queue.
                    do {
                        prevMsg = msg;
                        msg = msg.next;
                    } while (msg != null && !msg.isAsynchronous());
                }
                if (msg != null) {
                    // 如果有消息需要处理，先判断时间有没有到，如果没到设置需要阻塞的时间，比如 postDelay 场景
                    if (now < msg.when) {
                        // Next message is not ready.  Set a timeout to wake up when it is ready.
                        nextPollTimeoutMillis = (int) Math.min(msg.when - now, Integer.MAX_VALUE);
                    } else {
                        // Got a message.
                        mBlocked = false;
                        // 链表操作，获取 msg 并删除该节点
                        if (prevMsg != null) {
                            prevMsg.next = msg.next;
                        } else {
                            mMessages = msg.next;
                        }
                        msg.next = null;
                        if (DEBUG) Log.v(TAG, "Returning message: " + msg);
                        msg.markInUse();
                        return msg; // 返回拿到的消息
                    }
                } else {
                    // No more messages.
                    nextPollTimeoutMillis = -1; // 如果没有消息需要处理，就一直阻塞
                }

                // Process the quit message now that all pending messages have been handled.
                if (mQuitting) {
                    dispose();
                    return null;
                }
```

首先判断 MessageQueue 的头结点 mMessages.target 是否等于 null，如果是 null，代表有同步屏障，则从消息队列中找到第一个异步消息，否则找出消息队列头结点消息；

如果有消息需要处理(msg != null)，首先判断消息执行时间是否到了，如果没到就阻塞差值时间，如果到了就取出消息并从消息队列中删除此节点，返回拿到的消息；

如果没有消息要处理(msg == null)，则 `nextPollTimeoutMillis = -1`，通过 nativePollOnce() 一直阻塞；

可以看到 `enqueueMessage()` 和 `next()` 函数执行时都有对 MessageQueue 加锁 `synchronized (this)`，这样就保证了插入消息和读取消息互斥；

## 3. Handler

### Handler 创建

``` java
// Handler.java
    public Handler(@NonNull Looper looper) { // 指定 Looper
        this(looper, null, false);
    }
    public Handler(@NonNull Looper looper, @Nullable Callback callback) { // 指定 Looper 和 Callback
        this(looper, callback, false);
    }
    public Handler(@NonNull Looper looper, @Nullable Callback callback, boolean async) {
        mLooper = looper;
        mQueue = looper.mQueue;
        mCallback = callback;
        mAsynchronous = async;
    }
```

参数可指定 Looper、Callback 回调方法以及是否异步，之前的无参构造函数从 Android 11 开始被废弃，使用 `new Handler(Looper.myLooper())` 代替原来的无参构造方法；

### 发送消息

发送消息的函数有如下几种：

- sendMessage()
- sendMessageAtFrontOfQueue()
- sendMessageAtTime()
- sendMessageDelayed()
- sendEmptyMessage()
- sendEmptyMessageAtTime()
- sendEmptyMessageDelayed()
- postXXX()

但是殊途同归，最终都是调用到 `Handler.enqueueMessage(queue, msg, uptimeMillis)`，然后再调用到 `MessageQueue.enqueueMessage(msg, uptimeMillis)`；

### 分发消息

``` java
// Handler.java
    public void dispatchMessage(@NonNull Message msg) {
        if (msg.callback != null) { // Message 存在回调方法，则执行 message.callback.run()
            handleCallback(msg);
        } else {
            if (mCallback != null) { // Handler 存在 CallBack 变量，则执行 mCallback.handleMessage(msg) 
                if (mCallback.handleMessage(msg)) {
                    return;
                }
            }
            handleMessage(msg); // 否则执行 Handler 自身的回调方法
        }
    }
    public void handleMessage(@NonNull Message msg) { // 默认空实现，Handler 子类需要重写以接收消息
    }
```

一般使用子类重写 handleMessage 这种方法用的比较多；

## 4. Looper

### prepare()

``` java
// Looper.java
public final class Looper {
    static final ThreadLocal<Looper> sThreadLocal = new ThreadLocal<Looper>(); // TLS 变量
    private static Looper sMainLooper; // 主线程 Looper
    final MessageQueue mQueue;

    public static void prepare() {
        prepare(true); // 无参方法，子线程中调用，传入参数 true，即 Looper 可退出
    }
    private static void prepare(boolean quitAllowed) { // 主线程中调用传入 false 参数
        if (sThreadLocal.get() != null) {
            throw new RuntimeException("Only one Looper may be created per thread");
        }
        sThreadLocal.set(new Looper(quitAllowed));
    }
```

每个线程只能有一个 Looper，Looper 中有一个 ThreadLocal 对象 sThreadLocal，这个 sThreadLocal 是一个 TLS 变量，线程间互不影响；

这里 sThreadLocal 把一个 Looper 对象 set 进去了，所以说每个线程都有自己的一个 Looper，且仅有一个；

在 ActivityThread.main() 中调用了 `Looper.prepareMainLooper()`，在其中通过 `prepare(false)` **设置了主线程的 Looper**，在 Looper 的构造中又**初始化了 MessageQueue**；

### loop()

``` java
// Looper.java
    public static void loop() {
        final Looper me = myLooper(); // 获取当前线程 Looper 对象
        ...
        me.mInLoop = true;
        ...
        for (;;) {
            if (!loopOnce(me, ident, thresholdOverride)) {
                return;
            }
        }
    }
```

loop() 中有一个死循环 `for(;;)`，在其中调用了 `loopOnce()`；

``` java
// Looper.java
    private static boolean loopOnce(final Looper me,
            final long ident, final int thresholdOverride) {
        // 从 MessageQueue 中取消息
        Message msg = me.mQueue.next(); // might block
        if (msg == null) { // msg 为 null，说明 Looper 退出
            // No message indicates that the message queue is quitting.
            return false;
        }

        // This must be in a local variable, in case a UI event sets the logger
        final Printer logging = me.mLogging; // 可利用这里通过 setMessageLogging() 指定输出，用于 debug
        if (logging != null) {
            logging.println(">>>>> Dispatching to " + msg.target + " "
                    + msg.callback + ": " + msg.what);
        }
        // Make sure the observer won't change while processing a transaction.
        final Observer observer = sObserver;
        ...
        try {
            msg.target.dispatchMessage(msg); // 调用 Handler.dispatchMessage 分发消息
            if (observer != null) {
                observer.messageDispatched(token, msg);
            }
            dispatchEnd = needEndTime ? SystemClock.uptimeMillis() : 0;
        } ...
        if (logging != null) {
            logging.println("<<<<< Finished to " + msg.target + " " + msg.callback);
        }
        msg.recycleUnchecked(); // 把分发后的 Message 回收到消息池

        return true;
    }
```

loop() 函数中运行了一个死循环，不断的从 MessageQueue 中读取下一条 Message，并把 Message 分发给对应的 Handler，分发后回收 Message，这样需要 Message 时就可以直接通过 Message.obtain() 或者 Handler.obtainMessage() 获取了，可以优化内存和性能；

如果 logging 不为 null，在分发消息的前后都使用 `logging.println()` 打印了log，mLogging 在 Looper 中没有初始化值，所以默认为空，在应用中可以通过 setMessageLogging() 指定输出用于调试，比如通过前后两条 log 的时间判断消息的执行时间，判断是否有卡顿；

``` java
// Looper.java
    public void setMessageLogging(@Nullable Printer printer) {
        mLogging = printer;
    }
```

## 5. ThreadLocal

ThreadLocal（Thread Local Storage，线程本地存储，简称 TLS）是一个在多线程中为每一个线程创建单独的变量副本的类；当使用 ThreadLocal 来维护变量时，ThreadLocal 会为每个线程创建单独的变量副本，每个线程的 TLS 变量之间互不影响，避免了多线程操作共享变量导致数据不一致的情况；

ThreadLocal 中有 set() 和 get() 两个函数，作用分别是将 value 值添加到当前线程的 TLS 区域，获取当前线程 TLS 区域的数据；

### ThreadLocal.set()

``` java
// ThreadLocal.java
// ThreadLocal.set()
    public void set(T value) {
        Thread t = Thread.currentThread(); // 获取当前线程
        ThreadLocal.ThreadLocalMap map = this.getMap(t); // 获取当前线程的 ThreadLocalMap 对象变量 threadLocals
        if (map != null) {
            map.set(this, value); // 更新 ThreadLocalMap 中的 Entry 数组中的 Entry 对象，或添加一个 Entry 到 ThreadLocalMap 中
        } else {
            this.createMap(t, value);
        }

    }
```

set() 对应 ThreadLocalMap 的 set()：

``` java
// ThreadLocal.java
// ThreadLocalMap.set()
        private void set(ThreadLocal<?> key, Object value) {
            ThreadLocal.ThreadLocalMap.Entry[] tab = this.table;
            int len = tab.length;
            int i = key.threadLocalHashCode & len - 1;

            for(ThreadLocal.ThreadLocalMap.Entry e = tab[i]; e != null; e = tab[i = nextIndex(i, len)]) {
                ThreadLocal<?> k = (ThreadLocal)e.get();
                if (k == key) {
                    e.value = value;
                    return;
                }

                if (k == null) {
                    this.replaceStaleEntry(key, value, i);
                    return;
                }
            }

            tab[i] = new ThreadLocal.ThreadLocalMap.Entry(key, value);
            int sz = ++this.size;
            if (!this.cleanSomeSlots(i, sz) && sz >= this.threshold) {
                this.rehash();
            }

        }
```

大致意思就是 ThreadLocalMap 中有一个 Entry 对象数组，每个 Entry 对象是以 ThreadLocal 变量和一个 Object 类型的 value 构造而成，当调用 set() 时，会先遍历这个数组，看有没有和当前要 set 的 key 相同的 Entry，如果有，则更新 Entry.value 为要 set 的 value，否则以 key 和 value 新建一个 Entry 对象，并添加到 ThreadLocalMap 的 Entry 数组中；

### ThreadLocal.get()

``` java
// ThreadLocal.java
// ThreadLocal.get()
    public T get() {
        Thread t = Thread.currentThread();
        ThreadLocal.ThreadLocalMap map = this.getMap(t);
        if (map != null) {
            ThreadLocal.ThreadLocalMap.Entry e = map.getEntry(this);
            if (e != null) {
                T result = e.value;
                return result;
            }
        }

        return this.setInitialValue();
    }
```

ThreadLocal.get() 则是获取 ThreadLocalMap.Entry 的 value 值；

每一个 Thread 中都有一个 ThreadLocalMap 变量，getMap() 就是获取线程中的 ThreadLocalMap 变量；

``` java
// Thread.java
ThreadLocalMap threadLocals;

// ThreadLocal.java
// getMap()
    ThreadLocal.ThreadLocalMap getMap(Thread t) {
        return t.threadLocals;
    }
```

## 6. 同步屏障



## 7. 总结



