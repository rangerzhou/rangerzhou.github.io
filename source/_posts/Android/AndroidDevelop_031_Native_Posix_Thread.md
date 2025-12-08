---
title: Android - Native 层多线程方案
date: 2023-02-19 22:15:39
tags:
categories: Android
copyright: true
password:
---

> Android native 层多线程方案介绍。

<!--more-->

# 1 Posix 方案

一个**最简单的 POSIX 线程创建与等待示例**：

- `main()` 创建一个子线程。
- 子线程运行 `thread_posix_function()`，循环打印 30 次日志，每次 sleep 1 秒。
- 主线程 `pthread_join()` 等待子线程结束。
- 打印一句结束日志后退出程序。

``` c
#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
// #include <utils/Log.h>
 void *thread_posix_function(void *arg) {
  (void*)arg;
  int i;
  for ( i=0; i<30; i++) {
    printf("hello thread i = %d\n",i);
    // ALOGD("hello thread i = %d\n",i);
    sleep(1);
  }
  return NULL;
}
int main(void) {
  pthread_t mythread;
  
  if ( pthread_create( &mythread, NULL, thread_posix_function, NULL) ) {
    // ALOGD("error creating thread.");
    printf("error creating thread.");
    abort();
  }
  if ( pthread_join ( mythread, NULL ) ) {
    // ALOGD("error joining thread.");
    printf("error joining thread.");
    abort();
  }
  // ALOGD("hello thread has run end exit\n");
  printf("hello thread has run end exit\n");
  exit(0);
}
```

执行 `gcc thread_posix.c -o linux_thread -pthread` 即可生成可执行文件 linux_thread，注释掉的 ALOGD 是要在 AOSP 环境下编译，可以写入 makefile 中编译：

``` makefile
include $(CLEAR_VARS)
 
LOCAL_SRC_FILES := thread_posix.c 
	
LOCAL_MODULE := linux_thread
LOCAL_SHARED_LIBRARIES :=liblog  
	
LOCAL_PRELINK_MODULE := false
 
include $(BUILD_EXECUTABLE)
```

然后执行 `make linux_thread` 即可；

pthread_create 函数原型：

``` c
/*
__newthread:函数成功返回将ID存储在此变量中。
__attr:定制线程属性。
__start_routine:函数指针，线程执行函数
__arg:传递给函数的参数。
*/
int pthread_create (pthread_t *__restrict__newthread,
               const pthread_attr_t *__restrict__attr,
               void *(*__start_routine) (void *),
               void *__restrict__arg);
```

`pthread_join()` 的作用：

- 阻塞主线程
- 等待指定线程（`mythread`）执行结束
- 线程执行完毕才继续往下走

等同于“主线程等待子线程退出”。

如果失败则打印日志并 abort。

在 Android 中把 `thread_posix.c` 编译为二进制可执行文件，需要配置 makefile：

``` makefile
include $(CLEAR_VARS)
LOCAL_SRC_FILES := thread_posix.c 
LOCAL_MODULE := linux_thread
LOCAL_SHARED_LIBRARIES :=liblog  
LOCAL_PRELINK_MODULE := false
include $(BUILD_EXECUTABLE)
```

直接通过 `make linux_thread` 即可编译为 linux_thread 这个可执行文件，然后直接运行即可；

# 2 Android Native 层封装的 Threads 类

Android native的Thread类是Android提供的一个基础类，源码路径：

| Class       | Path                                        | Note |
| ----------- | ------------------------------------------- | ---- |
| Thread.h    | system/core/libutils/include/utils/Thread.h |      |
| Threads.cpp | system/core/libutils/Threads.h              |      |

该类提供的基础功能涵盖了线程的生命周期：创建、运行、销毁。

定义头文件 `MyThread.h`：

``` cpp
#ifndef _MYTHREAD_H
#define _MYTHREAD_H

#include <utils/threads.h>

namespace android {

class MyThread: public Thread {
public:
    MyThread();
        virtual void        onFirstRef();
        virtual status_t    readyToRun();

    //如果返回true,循环调用此函数,返回false下一次不会再调用此函数
    virtual bool threadLoop();
    virtual void requestExit();
private:
 int hasRunCount = 0;
};

}
#endif
```

实现类 `MyThread.cpp`：

``` cpp
#define LOG_TAG "MyThread"

#include <utils/Log.h>
#include "MyThread.h"

namespace android {

    MyThread::MyThread() :
            Thread(false) {
        ALOGD("MyThread");
    }

    bool MyThread::threadLoop() {
        ALOGD("threadLoop hasRunCount = %d",hasRunCount);
        hasRunCount++;
        if (hasRunCount == 10) {
            return false;
        }
        return true;
    }

    void MyThread::onFirstRef() {
        ALOGD("onFirstRef");
    }

    status_t MyThread::readyToRun() {
        ALOGD("readyToRun");
        return 0;
    }

    void MyThread::requestExit() {
        ALOGD("requestExit");
    }
}

```

使用：
``` cpp
#define LOG_TAG "Main"

#include <utils/Log.h>
#include <utils/threads.h>
#include "MyThread.h"

using namespace android;

int main()
{
    sp<MyThread>  thread = new MyThread;
    thread->run("MyThread", PRIORITY_URGENT_DISPLAY);
    while(1) {
       if (!thread->isRunning()) {
        break;
        }
    }
    ALOGD("main end");
    return 0;
}

```

- `onFirstRef()`：当用 `sp<MyThread>` 保存对象时触发 ，只执行一次
- `thread->run()`：执行线程创建并启动运行

- `readyToRun()`：在新线程启动之前执行，属于一次性初始化步骤

- `_threadLoop()` 函数：循环多次执行，该函数主要通过调用 `threadLoop()` 函数，因此基类必要要实现 `threadLoop()` 函数，作为线程执行函数，它是有返回值的方法，而且 `_threadLoop` 会根据返回值确定是否继续循环执行的方法
  - 返回 true：继续循环
  - 返回 false：退出线程

- 线程销毁，子类最好通过实现 `requestExit()` 函数，首先调用 Thread 类的 `requestExit()` 函数，将线程状态 `mExitPending` 置为 true，然后中断 `threadLoop`

