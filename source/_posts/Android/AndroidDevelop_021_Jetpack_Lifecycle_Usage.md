---
title: Android - Jetpack套件之 Lifecycle 使用
date: 2023-03-20 22:03:22
tags: Jetpack, Lifecycle
categories: Android
copyright: true
password:
---

> Android Jetpack 套件之 Lifecycle 使用；

<!--more-->

## Jetpack 和 Lifecycle

Jetpack 是一个由多个库组成的套件，可帮助开发者遵循最佳做法，减少样板代码并编写可在各种 Android 版本和设备中一致运行的代码，让开发者集中精力编写重要的代码。

Jetpack 组件包括 4 个方面：架构（Architecture）、基础（Architecture）、行为（Behavior）、界面（UI）：

![Jetpack 架构](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2023/Jetpack.png "Jetpack 架构")

而 Lifecycle 是用于帮助开发者管理Activity和Fragment 的生命周期，它是LiveData和ViewModel的基础，属于 Android 架构组件；

## Lifecycle 使用方式

``` java
getLifecycle().addObserver(Observer);
```

### 被观察者(LifecycleOwner)

被观察者需要实现 LifecycleOwner 接口，比如对于 Activity，Activity —> AppCompatActivity —> FragmentActivity —> ComponentActivity ---> LifecycleOwner，最终实现 LifecycleOwner 接口;

### 观察者(Observer)

其中 Observer 有 3 种：LifecycleEventObserver、DefaultLifecycleObserver、LifecycleObserver；

### LifecycleEventObserver 接口

``` java
        getLifecycle().addObserver(new LifecycleEventObserver() {
            @Override
            public void onStateChanged(@NonNull LifecycleOwner source, @NonNull Lifecycle.Event event) {
                switch (event){
                    case ON_CREATE:
                        Log.d(TAG, "ON_CREATE");
                        break;
                    case ON_RESUME:
                        Log.d(TAG, "ON_RESUME");
                        break;
                    //...
                    case ON_ANY:
                        Log.d(TAG, "ON_ANY");
                        break;
                }
            }
        });
```



### DefaultLifecycleObserver 接口

``` java
        getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override
            public void onCreate(@NonNull LifecycleOwner owner) {
                Log.d(TAG, "ON_CREATE");
            }

            @Override
            public void onResume(@NonNull LifecycleOwner owner) {
                Log.d(TAG, "ON_RESUME");
            }

        });
```



### LifecycleObserver 接口

通过 OnLifecycleEvent 注解的方式实现

``` java
        getLifecycle().addObserver(new LifecycleObserver() {
            @OnLifecycleEvent(Lifecycle.Event.ON_CREATE)
            void onCreate(LifecycleOwner owner) {
                Log.d(TAG, "ON_CREATE");
            }

            @OnLifecycleEvent(Lifecycle.Event.ON_RESUME)
            void onResume(LifecycleOwner owner) {
                Log.d(TAG, "ON_RESUME");
            }

            @OnLifecycleEvent(Lifecycle.Event.ON_ANY)
            void onAny(LifecycleOwner owner) {
                Log.d(TAG, "ON_ANY");
            }
        });
```

<font color=red>**~~使用注解的方式已经废弃~~**</font>

### 优先级

那么这三种方式的优先级是什么呢，我们来看看 LifecycleEventObserver 接口和 DefaultLifecycleObserver 接口的注释：

``` java
/**
 * Class that can receive any lifecycle change and dispatch it to the receiver.
 * <p>
 * If a class implements both this interface and
 * {@link androidx.lifecycle.DefaultLifecycleObserver}, then
 * methods of {@code DefaultLifecycleObserver} will be called first, and then followed by the call
 * of {@link LifecycleEventObserver#onStateChanged(LifecycleOwner, Lifecycle.Event)}
 * <p>
 * If a class implements this interface and in the same time uses {@link OnLifecycleEvent}, then
 * annotations will be ignored.
 */
public interface LifecycleEventObserver extends LifecycleObserver {}

/**
 * Callback interface for listening to {@link LifecycleOwner} state changes.
 * If a class implements both this interface and {@link LifecycleEventObserver}, then
 * methods of {@code DefaultLifecycleObserver} will be called first, and then followed by the call
 * of {@link LifecycleEventObserver#onStateChanged(LifecycleOwner, Lifecycle.Event)}
 * <p>
 * If a class implements this interface and in the same time uses {@link OnLifecycleEvent}, then
 * annotations will be ignored.
 */
@SuppressWarnings("unused")
public interface DefaultLifecycleObserver extends FullLifecycleObserver {}
```

可以看出，如果一个观察者同时实现了 LifecycleEventObserver 和 DefaultLifecycleObserver，那么 DefaultLifecycleObserver 要先于 LifecycleEventObserver 执行，如果同时也添加了 OnLifecycleEvent 注解，那么注解部分会被忽略掉；



[Reference](https://www.jianshu.com/p/4ad7aa0fc356)
