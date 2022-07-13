---
title: Android - Handler原理分析
date: 2021-10-27 23:18:46
tags:
categories: Android
copyright: true
password: zr.
---



> Handler 原理分析

<!--more-->

# 相关代码路径

| Layer        | Path |
| ------------ | ---- |
| framework 层 |      |



## 1. Message

``` java
// Message.java
public final class Message implements Parcelable {
    public int what; // 唯一标识
    public int arg1;
    public int arg2;
    public Object obj; // 数据
    public long when; // 时间戳
    /*package*/ Handler target; // message 的发送者，也是最终处理者
    /*package*/ Message next;
```



## 2. MessageQuene

``` java

public final class MessageQueue {
    MessageQueue(boolean quitAllowed) {
        mQuitAllowed = quitAllowed; // 消息队列是否可以销毁，主线程的队列不可以销毁需要传入 false
        mPtr = nativeInit();
    }
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
            // 此处加锁的目的是为了 next() 函数和 enqueueMessage() 函数互斥，如此放消息和取消息就会互斥，
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
                    nextPollTimeoutMillis = -1;
                }

                // Process the quit message now that all pending messages have been handled.
                if (mQuitting) {
                    dispose();
                    return null;
                }
```



## 3. Handler



## 4. Looper
