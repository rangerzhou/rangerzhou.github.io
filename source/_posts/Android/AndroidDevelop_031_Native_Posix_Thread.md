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

``` c
// thread_posix.c
#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>
#include <utils/Log.h>
 void *thread_posix_function(void *arg) {
  (void*)arg;
  int i;
  for ( i=0; i<30; i++) {
    printf("hello thread i = %d\n",i);
    ALOGD("hello thread i = %d\n",i);
    sleep(1);
  }
  return NULL;
}
int main(void) {
  pthread_t mythread; // 线程 ID
  
  if ( pthread_create( &mythread, NULL, thread_posix_function, NULL) ) {
    ALOGD("error creating thread.");
    abort();
  }
  if ( pthread_join ( mythread, NULL ) ) {
    ALOGD("error joining thread.");
    abort();
  }
  ALOGD("hello thread has run end exit\n");
  exit(0);
}
```

pthread_create 函数原型：

``` c
/*
__newthread:函数成功返回将ID存储在此变量中。
__attr:定制线程属性。
__start_routine:函数指针。
__arg:传递给函数的参数。
*/
int pthread_create (pthread_t *__restrict__newthread,
               const pthread_attr_t *__restrict__attr,
               void *(*__start_routine) (void *),
               void *__restrict__arg);
```

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

# 2 Native 层封装的 Threads 类

源码路径

| Class       | Path                                        | Note |
| ----------- | ------------------------------------------- | ---- |
| Thread.h    | system/core/libutils/include/utils/Thread.h |      |
| Threads.cpp | system/core/libutils/Threads.h              |      |

