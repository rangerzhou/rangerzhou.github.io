---
title: Android - JNI 分析
date: 2021-11-11 19:22:21
tags:
categories: Android
copyright: true
password: zr.

---



> JNI 学习研究
>

<!--more-->



``` cpp
extern "C" 
JNIEXPORT jstring JNICALL
Java_com_aptiv_myjnidemo_MainActivity_getName(JNIEnv *env, jobject thiz) {
    // TODO: implement getName()
    jfieldID jfieldId = env->GetFieldID(thiz,"name","L")
}
```



- extern "C"：采用 C 的编译方式，因为 JNI 通过函数名找函数入口，C++ 编译生成的函数名和源文件中的函数名不同，因为 C++ 要处理函数重载，会在函数名称中加上参数信息，成为 name mangling，解决方法是定义函数时在前面加上extern "C"修饰，告诉编译器这段代码采用 C 的编译方式。
- JNIEXPORT：标记该方法允许外部调用，和平台有关，Linux 可以不加，Windows 必须加；
- jstring：因为 Java 和 C/C++ 表示数据类型的不同方式（比如 java 中的 String，C 中是 char *，C++ 是 string），所以这个 jstring 是用来转换 java 和 native 的数据类型的；
- JNICALL：是一个标记，代表是 JNI；
- Java_com_aptiv_myjnidemo_MainActivity_getName：JNI 技术是属于 Java 的 JDK 的，所以加上 java，后面则是包名 _ 类名 _方法名，把包名和方法名中的`.`换成`_`，如果包名或方法名包含下划线，则替换成`_1`，整体格式就是 `Java_包名_类名_方法名`；
- JNIEnv *env：JNI 环境，包含了 JNI 的函数；
- jobject：调用此方法的对象，比如在 MainActivity 中调用，那么这个 jobject 就是 MainActivity 对象，如果是 static 变量，就会变成 jclass xxx，即调用此方法的类； 





JNI 线程

JNIEnv *env：不能跨越线程，否则崩溃，可以跨越函数；

``` cpp
// 解决方式: 使用全局 JavaVM 附加当前异步线程得到全新 env
JNIEnv * jniEnv = nullptr; // 全新的 JNIEnv，在子线程中的
// 附加当前子线程后，会得到一个全新的 env，此 env 相当于是子线程专用的 env
jinit attachResult = ::javaVm->AttachCurrentThread(&jniEnv, nullptr);
if (attachResult != JNI_OK) { // JNI_OK = 0
    RETURN 0; // 附加失败，返回
}
::javaVm->DetachCurrentThread();// 必须解除附加，否则报错
```



jobject thiz：不能跨越线程，不能跨越函数，否则崩溃；【提升为全局引用可解决】

``` cpp
// 解决方式
JNIEXPORT void JNICALL Java_xxx_xxx_methodName(JNIEnv *env, jobject jobj){
    // MyContext 类中包含 jniEnv 和 instance 变量
    MyContext * myContext = new  MyContext; 
	myContext -> jniEnv = env;
    // jobj 默认是局部引用，提升为全局引用即可跨线程
	myContext -> instance = env -> NewGlobalRef(jobj);
    // 开启一个线程
    pthread_t pid;
    pthread_create(&pid, nullptr, myThreadTaskAction, myContext);
    pthread_join(pid, nullptr);
}

void *myThreadTaskAction(void *pVoid) {
    
}

```



JavaVM：可以跨越线程、跨越函数；
