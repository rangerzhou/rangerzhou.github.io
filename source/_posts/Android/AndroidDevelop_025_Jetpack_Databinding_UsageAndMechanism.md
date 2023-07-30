---
title: Android - Jetpack 套件之 LiveData 使用和原理
date: 2023-05-26 23:11:38
tags: Jetpack, Livedata
categories: Android
copyright: true
password:
---

> Android Jetpack 套件之 LiveData 使用和原理解析；

<!--more-->

# 1 概述

[`LiveData`](https://developer.android.google.cn/reference/androidx/lifecycle/LiveData?hl=zh-cn) 是一种可观察的数据存储器类。与常规的可观察类不同，LiveData 具有生命周期感知能力，意指它遵循其他应用组件（如 activity、fragment 或 service）的生命周期。这种感知能力可确保 LiveData 仅更新处于活跃生命周期状态的应用组件观察者。

如果观察者（由 [`Observer`](https://developer.android.google.cn/reference/androidx/lifecycle/Observer?hl=zh-cn) 类表示）的生命周期处于 [`STARTED`](https://developer.android.google.cn/reference/androidx/lifecycle/Lifecycle.State?hl=zh-cn#STARTED) 或 [`RESUMED`](https://developer.android.google.cn/reference/androidx/lifecycle/Lifecycle.State?hl=zh-cn#RESUMED) 状态，则 LiveData 会认为该观察者处于活跃状态。LiveData 只会将更新通知给活跃的观察者。为观察 [`LiveData`](https://developer.android.google.cn/reference/androidx/lifecycle/LiveData?hl=zh-cn) 对象而注册的非活跃观察者不会收到更改通知。

# 2 LiveData 使用

[画图占位]()



https://developer.android.google.cn/topic/libraries/architecture/livedata?hl=zh-cn#java

## 2.1 创建 LiveData 对象

创建 Livedata 实例以存储数据，通常在 ViewModel 中完成；

``` java
public class MyViewModel extends ViewModel {
    MutableLiveData<String> currentName;
    public MutableLiveData<String> getCurrentName(){
        if (currentName == null) {
            currentName = new MutableLiveData<>();
        }
        return currentName;
    }
    ...
}
```

确保用于更新界面的 `LiveData` 对象存储在 `ViewModel` 对象中，而不是将其存储在 activity 或 fragment 中，原因如下：

- 避免 Activity 和 Fragment 过于庞大。现在，这些界面控制器负责显示数据，但不负责存储数据状态。
- 将 `LiveData` 实例与特定的 Activity 或 Fragment 实例分离开，并使 `LiveData` 对象在配置更改后继续存在。

## 2.2 观察 LiveData 对象

创建 Observer 对象，此对象中定义了 `onChanged()` 方法，用于响应 Livedata 对象存储的数据更改；

``` java
    MyViewModel viewModel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        viewModel = new ViewModelProvider(this).get(MyViewModel.class);
        // 创建 Observer 对象
        Observer<String> observer = new Observer<String>() {
            @Override
            public void onChanged(String name) {
                Log.d(TAG, "receive new name");
            }
        };
```

使用 `observe()` 方法将 Observer 对象附加到 Livedata 对象；

``` java
viewModel.getCurrentName().observe(this, observer);
```

## 2.3 更新 LiveData 对象

``` java
findViewById(R.id.btn).setOnClickListener(v -> {
    viewModel.getCurrentName().setValue("NewName");
});
```

通过 `setValue()/postValue()` 更新 LiveData 对象数据，数据更新后， 如果 LifecycleOwner 对象（Activity/Fragment）是活跃的，则其对应 Observer 中的 `onChanged()` 方法就会被调用了；

活跃的是指 Lifecycle.State.STARTED/Lifecycle.State.RESUMED 两种状态，STARTED 对应 LifecycleOwner 刚执行完 onStart 或者执行 onPause 之前，RESUMED 对应执行完 onResume 之后；

# 3 LiveData 原理

[画图占位]()

## 3.1 创建 LiveData 对象

LiveData 是一个抽象类，没有 public 可用的方法来更新存储的数据，**一般使用 MutableLiveData 创建 LiveData 对象**，MutableLiveData 类将公开 `setValue(T)` 和 `postValue(T)` 方法用来更新存储在 LiveData 对象中的数据，在主线程发消息使用 `setValue()`，在子线程发消息使用 `postValue()`；

``` java
// MutableLiveData.java
    public MutableLiveData() {
        super();
    }
// LiveData.java
    public LiveData() {
        mData = NOT_SET;
        mVersion = START_VERSION;
    }
```

创建 LiveData 时 <font color=red>**mVersion 初始化为 START_VERSION(-1)**</font>；

## 3.2 附加 Observer 对象到 LiveData

使用 `LiveData.observer()` 方法把 Observer 对象附加到 LiveData 对象上，**即把 Observer 包装为 LifecycleBoundObserver 后作为 LifecycleOwner 的观察者**：

``` java

    public void observe(@NonNull LifecycleOwner owner, @NonNull Observer<? super T> observer) {
        assertMainThread("observe");
        if (owner.getLifecycle().getCurrentState() == DESTROYED) {
            // ignore
            return;
        }
        LifecycleBoundObserver wrapper = new LifecycleBoundObserver(owner, observer);

        ...
    }
```

如果 LifecycleOwner 的状态是 DESTROYED，则直接 return；

### 3.2.1 包装 Observer 对象

传入的 Observer 对象为什么可以监听到 LifecycleOwner 生命周期呢，因为在 observe() 中把 Observer 包装为了 LifecycleBoundObserver 对象：

``` java
// LiveData.java
    class LifecycleBoundObserver extends ObserverWrapper implements LifecycleEventObserver {
        LifecycleBoundObserver(@NonNull LifecycleOwner owner, Observer<? super T> observer) {
            super(observer);
            mOwner = owner;
        }
// LiveData.java
    private abstract class ObserverWrapper {
        final Observer<? super T> mObserver;
        boolean mActive;
        int mLastVersion = START_VERSION;
        ObserverWrapper(Observer<? super T> observer) {
            mObserver = observer;
        }
```

LifecycleBoundObserver 实现了 LifecycleEventObserver 接口，通过 Lifecycle 的使用学习得知，实现了 LifecycleEventObserver 接口的对象就可以监听 LifecycleOwner 的生命周期了；

**ObserverWrapper 里面的 mObserver 就是 LiveData 调用 observe() 时传入的 Observer 对象；**

### 3.2.2 Observer 对象绑定 LifecycleOwner 对象

``` java
// LiveData.java
    private SafeIterableMap<Observer<? super T>, ObserverWrapper> mObservers =
            new SafeIterableMap<>();
    public void observe(@NonNull LifecycleOwner owner, @NonNull Observer<? super T> observer) {
        ...
        ObserverWrapper existing = mObservers.putIfAbsent(observer, wrapper);
        owner.getLifecycle().addObserver(wrapper);
    }


```

然后把包装后的观察者放入 mObservers 这个 map 中，<font color=red>**mObservers 包含了这个 LiveData 所有的观察者**</font>，然后也可以看到使用 `addObserver()` 把观察者和被观察者绑定在了一起；

## 3.3 更新 LiveData 对象中的数据

### 3.3.1 setValue() 和 postValue() 区别

更新数据有两种方式：setValue() 和 postValue()，看一下 postValue() diamante：

``` java
// MutableLiveData.java
    public void postValue(T value) {
        super.postValue(value);
    }
// LiveData.java
    final Object mDataLock = new Object();
    volatile Object mPendingData = NOT_SET;
    /**
     * If you called this method multiple times before a main thread executed a posted task, only
     * the last value would be dispatched.
     */
    protected void postValue(T value) {
        boolean postTask;
        synchronized (mDataLock) {
            postTask = mPendingData == NOT_SET; // 
            mPendingData = value;
        }
        if (!postTask) {
            return;
        }
        ArchTaskExecutor.getInstance().postToMainThread(mPostValueRunnable);
    }

```

- 因为每次 mPostValueRunnable 执行时会把 mPendingData 重置为 NOT_SET，所以第一次 postValue() 时 postTask 为 true，接着通过 runable 的方式在主线程中更新数据；
- 如果在 mPostValueRunnable() 中拿到 mDataLock 对象锁之前，下一次 postValue() 提前拿到了 mDataLock 对象锁，那么此时 mPendingData 值是上一次 post 的值，不等于 NOT_SET，所以 postTask 为 false，并把最新 post 的值给了 mPendingData，然后释放锁，在 if 代码块直接 return 了；
- 这个时候上一次的 mPostValueRunnable 开始执行，但是此时 mPendingData 已经变为了最新的值，所以后面调用 setValue() 时传入的是后面 postValue() 的值；
- <font color=red>**mPendingData 是 volatile 的**</font>，所以 mPendingData 会被更新为最新的值；

``` java
// LiveData.java
    private final Runnable mPostValueRunnable = new Runnable() {
        @SuppressWarnings("unchecked")
        @Override
        public void run() {
            Object newValue;
            synchronized (mDataLock) {
                newValue = mPendingData;
                mPendingData = NOT_SET;
            }
            setValue((T) newValue); // 最终还是调用 setValue
        }
    };
```

综上所述，postValue() 和 setValue() 区别：

- postValue() 可以在任何线程调用，多次调用 postValue()，只会收到最后一次更新（如注释：<font color=red>**If you called this method multiple times before a main thread executed a posted task, only the last value would be dispatched**</font>），最终还是回到主线程调用 setValue()；
- setValue() 只能在主线程调用，多次调用 setValue() 则每次调用都会收到；

接下来看 `setValue()` 流程；

### 3.3.2 setValue()

``` java
// MutableLiveData.java
    public void setValue(T value) {
        super.setValue(value);
    }
// LiveData.java
    static final int START_VERSION = -1;
    private volatile Object mData;
    private int mVersion;
    protected void setValue(T value) {
        assertMainThread("setValue");
        mVersion++; // 版本控制
        mData = value;
        dispatchingValue(null);
    }
```

这个 mVersion 是用于版本控制的，在创建 LiveData 时初始化为 <font color=red>**START_VERSION(-1)**</font>，set 的数据存入了 mData 这个 Object 对象中，而且使用了 volatile 修饰，表示这个变量将来会被多线程访问，因为一个 LiveData 可以被多个观察者绑定，**volatile 是为了保证变量的线程安全（代码的线程安全使用锁机制）**，然后 `mVersion++`；

### 3.3.3 dispatchingValue()

``` java
// LiveData.java
    private boolean mDispatchingValue;
    void dispatchingValue(@Nullable ObserverWrapper initiator) {
        if (mDispatchingValue) {
            mDispatchInvalidated = true;
            return;
        }
        mDispatchingValue = true;
        do {
            mDispatchInvalidated = false;
            if (initiator != null) {
                considerNotify(initiator);
                initiator = null;
            } else {
                for (Iterator<Map.Entry<Observer<? super T>, ObserverWrapper>> iterator =
                        mObservers.iteratorWithAdditions(); iterator.hasNext(); ) {
                    considerNotify(iterator.next().getValue()); // 获取的是 LifecycleBoundObserver
                    if (mDispatchInvalidated) {
                        break;
                    }
                }
            }
        } while (mDispatchInvalidated);
        mDispatchingValue = false;
    }
```

mDispatchingValue 没有赋初始值，第一个 if 判断进不去，随后把 mDispatchingValue 置为 true；

然后进入 do/while 代码块：

- 如果传入的观察者为 null，则遍历观察者集合进行分发数据，
- 如果传入的观察者不为 null，则向此观察者分发消息；

此时传入的观察者为 null，进入 else 代码块，从 mObservers 取出对应的 <font color=red>**LifecycleBoundObserver**</font> 包装类对象（继承自 ObserverWrapper）传入 considerNotify()；

### 3.3.4 considerNotify()

``` java
// LiveData.java
    private void considerNotify(ObserverWrapper observer) {
        if (!observer.mActive) { // 检查 Observer 状态
            return;
        }
        if (!observer.shouldBeActive()) {
            observer.activeStateChanged(false);
            return;
        }
        if (observer.mLastVersion >= mVersion) {
            return;
        }
        observer.mLastVersion = mVersion;
        observer.mObserver.onChanged((T) mData);
    }

    class LifecycleBoundObserver extends ObserverWrapper implements LifecycleEventObserver {
        boolean shouldBeActive() {
            return mOwner.getLifecycle().getCurrentState().isAtLeast(STARTED);
        }
```

- `observer.mActive` 是在 LifecycleBoundObserver 的父类 ObserverWrapper 中定义的，检查的是**观察者的状态**，只有在观察者的状态为 STARTED/RESUMED 时才为 true；

- `shouldBeActive` 判断的是**被观察者 LifecycleOwner 的状态，也是 STARTED/RESUMED 时为 true**；

- `mLastVersion` 也是定义在 ObserverWrapper 中，和 mVersion 一样初始值为 START_VERSION(-1)，但是 mVersion 在 setVaule 时做了 ++ 操作，所以此处 `observer.mLastVersion >= mVersion` 肯定为 false；
- 所以当 UI 是显示状态时，上面三个if 条件都进不去，接下来把 mVersion 的值赋给 observer.mLastVersion，再回调 `observer.mObserver.onChanged()`方法，[3.2.1章节](# 3.2.1 包装 Observer 对象)中已经说明这个 mObserver 就是 `LiveData.observer()` 时传入的 Observer，所以调用的就是 [2.2 章节](# 2.2 观察 LiveData 对象)定义的 `onChanged()` 方法；

### 3.3.5 LifecycleOwner 活跃时如何接收到最新数据？

从 [3.2.1 章节](# 3.2.1 包装 Observer 对象)可知，观察者被包装为可以观察 LifecycleOwner 生命周期的 LifecycleBoundObserver，所以当 LifecycleOwner 生命周期发生变化时，LifecycleBoundObserver.onStateChanged() 就会被调用，

``` java
// LiveData.java
    class LifecycleBoundObserver extends ObserverWrapper implements LifecycleEventObserver {
        public void onStateChanged(@NonNull LifecycleOwner source,
                @NonNull Lifecycle.Event event) {
            Lifecycle.State currentState = mOwner.getLifecycle().getCurrentState();
            if (currentState == DESTROYED) {
                removeObserver(mObserver); 
                return;
            }
            Lifecycle.State prevState = null;
            while (prevState != currentState) {
                prevState = currentState;
                activeStateChanged(shouldBeActive());
                currentState = mOwner.getLifecycle().getCurrentState();
            }
        }
```

可以看到如果 LifecycleOwner 状态是 DESTROYED，那么会移除观察者 mObserver，所有不会发生内存泄漏；

然后调用 activeStateChanged()：

``` java

    private abstract class ObserverWrapper {
        void activeStateChanged(boolean newActive) {
            if (newActive == mActive) {
                return;
            }
            // immediately set active state, so we'd never dispatch anything to inactive
            // owner
            mActive = newActive;
            changeActiveCounter(mActive ? 1 : -1);
            if (mActive) {
                dispatchingValue(this);
            }
        }
```

又回到了 dispatchingValue()，只不过这次传入的参数不是 null 了，而是 ObserverWrapper 对象，即传入了观察者对象，

``` java
// LiveData.java
    void dispatchingValue(@Nullable ObserverWrapper initiator) {
        if (mDispatchingValue) {
            mDispatchInvalidated = true;
            return;
        }
        mDispatchingValue = true;
        do {
            mDispatchInvalidated = false;
            if (initiator != null) { // 参数不为 null
                considerNotify(initiator);
                initiator = null;
            } else {
                ...
            }
        } while (mDispatchInvalidated);
        mDispatchingValue = false;
    }
```

因为传入的观察者不为 null，即所以直接调用 `considerNotify()` 向该观察者分发消息，接下来的步骤和 [3.3.4 章节](# 3.3.4 considerNotify()) 一样了；

### 3.3.6 observeForever() 和 observe() 区别

- observe()：会在 Lifecycle 大于等于 STARTED 的时候才为激活状态(可以观察到数据变化给回调)，在 Lifecycle 为 DESTROYED 的时候会自动调用 removeObserver() 移除观察者，可以有效的防止内存泄漏，程序异常；
- observeForever()：无论页面处于什么状态，observeForever() 都能收到通知，因此在用完之后，一定要记得调用 removeObserver() 方法来移除观察者，否则会造成了内存泄漏；

# 4 LiveData 粘性事件

何为粘性事件呢，说白了就是先发送数据，后订阅，也可以接收到数据；

## 4.1 粘性事件发生的原因

但是有时候这样会给我们带来麻烦，有时候并不想接收订阅前的数据，在调用 LiveData.observe() 方法的时候，方法内部 `new LifecycleBoundObserver()` 的时候 ObserverWrapper.mLastVersion 值为 START_VERSION(-1)，所以当 Activity 生命周期由非活跃变为活跃时 LiveData 触发事件分发，执行 [3.3.5章节](# 3.3.5 LifecycleOwner 活跃时如何接收到最新数据？) 流程，再执行到 [3.3.4 章节](# 3.3.4 considerNotify()) 时，

``` java
// LiveData.java
    private void considerNotify(ObserverWrapper observer) {
        if (observer.mLastVersion >= mVersion) {
            return;
        }
```

这里的 if 条件不成立，所以事件不会被拦截，就发生了黏性事件；

## 4.2 粘性事件解决方案

自定义 LiveData 类，重写 observe 方法，利用反射 hook mLastVersion 和 mVersion，在 observe 的时候让 mLastVersion 和 mVersion 的值相等，就可以拦截了，示例代码如下：

``` java
public class NonStickyMutableLiveData<T> extends MutableLiveData {

    private boolean stickFlag = false;

    @Override
    public void observe(LifecycleOwner owner, Observer observer) {
        super.observe(owner, observer);
        if (!stickFlag) {
            hook(observer);
            stickFlag = true;
        }
    }

    // 在这里去改变 onChange 的流程
    private void hook(Observer<? super T> observer) {
        try {
            // 1.得到 mLastVersion
            // 获取到 LiveData 的类中的 mObservers 对象
            // SafeIterableMap<Observer<? super T>, ObserverWrapper> mObservers
            Class<LiveData> liveDataClass = LiveData.class;
            Field mObserversField = liveDataClass.getDeclaredField("mObservers");
            mObserversField.setAccessible(true);


            // 获取到这个成员变量的对象
            Object mObserversObject = mObserversField.get(this);
            // 得到 map 对应的 class 对象
            Class<?> mObserversClass = mObserversObject.getClass();
            // 获取到 mObservers 对象的 get 方法 entry
            Method get = mObserversClass.getDeclaredMethod("get", Object.class);
            get.setAccessible(true);
            // 执行 get 方法 mObservers.get(observer)
            Object invokeEntry = get.invoke(mObserversObject, observer);
            // 定义一个空的对象
            Object observerWraper = null;
            if (invokeEntry != null && invokeEntry instanceof Map.Entry) {
                observerWraper = ((Map.Entry) invokeEntry).getValue(); // ObserverWrapper
            }
            if (observerWraper == null) {
                throw new NullPointerException("observerWraper is null");
            }
            // 得到 ObserverWrapper 的类对象编译擦除问题会引起多态冲突所以用 getSuperclass
            // TODO:getClass()返回对应的当前正在运行时的类所对应的对
            Class<?> superclass = observerWraper.getClass().getSuperclass(); // mLastVersion
            Field mLastVersion = superclass.getDeclaredField("mLastVersion");
            mLastVersion.setAccessible(true);
            // 2.得到 mVersion
            Field mVersion = liveDataClass.getDeclaredField("mVersion");
            mVersion.setAccessible(true);
            // 3.把 mVersion 的数据填入到 mLastVersion 中
            Object mVersionValue = mVersion.get(this);
            mLastVersion.set(observerWraper, mVersionValue);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

```

