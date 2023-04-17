---
title: Android - Jetpack套件之 Lifecycle 原理
date: 2023-03-28 21:46:09
tags: Jetpack, Lifecycle
categories: Android
copyright: true
password:
---



> Android Jetpack 套件之 Lifecycle 原理；

<!--more-->

Lifecycle 的使用很简单，接下来让我们研究一下 Lifecycle 的源码和原理；

## Lifecycle 原理

Lifrcycle 使用方式如下：

``` java
getLifecycle().addObserver(myObserver);
```

先来看看 getLifecycle() 是什么；

### getLifecycle()

之所以在 Activity/Fragment 中可以直接调用 getLifecycle() 方法，是因为 Activity/Fragment 间接实现了 LifecycleOwner 接口；

```java
// ComponentActivity.java
    private final LifecycleRegistry mLifecycleRegistry = new LifecycleRegistry(this);
    public Lifecycle getLifecycle() {
        return mLifecycleRegistry;
    }

    public Lifecycle getLifecycle() {
        return this.mLifecycleRegistry;
    }
```

返回了一个 LifecycleRegistry 对象，

``` java
// LifecycleRegistry.java
public class LifecycleRegistry extends Lifecycle {
    private FastSafeIterableMap<LifecycleObserver, ObserverWithState> mObserverMap;
    private Lifecycle.State mState;
    private final WeakReference<LifecycleOwner> mLifecycleOwner;
// Lifecycle.java
public abstract class Lifecycle {
```

几个重要的成员变量：

- mObserverMap：持有所有的观察者对象 LifecycleObserver，以及该观察者对应的封装对象 ObserverWithState；
- mState：State 是一个枚举类，用于表示当前生命周期状态；
- mLifecycleOwner：通过弱引用持有与其关联的所有者对象 LifecycleOwner；

LifecycleRegistry 继承自 Lifecycle 这个抽象类，且是 Lifecycle 的唯一子类，那么自然而然，addObserver 就是调用了 LifecycleRegistry.addObserver()；

### 添加观察者-addObserver()

``` java
// Lifecycle.java
    private State mState;
    @MainThread
    public abstract void addObserver(@NonNull LifecycleObserver observer);

// LifecycleRegistry.java
    private State mState;
    private FastSafeIterableMap<LifecycleObserver, ObserverWithState> mObserverMap =
            new FastSafeIterableMap<>();
    @Override
    public void addObserver(@NonNull LifecycleObserver observer) {
        enforceMainThreadIfNeeded("addObserver");
        State initialState = mState == DESTROYED ? DESTROYED : INITIALIZED;
        ObserverWithState statefulObserver = new ObserverWithState(observer, initialState);
        ObserverWithState previous = mObserverMap.putIfAbsent(observer, statefulObserver);
```

- 初始化时，根据 LifecycleRegistry.mState 是否处于 DESTROYED 状态，获取到默认的初始状态为 DESTROYED 或者 INITIALIZED；
- 再把观察者和对应的初始状态包装成 ObserverWithState 对象；
- 最后把 ObserverWithState 存入 mObserverMap 中，如果已经添加过，则返回非空，<font color=red>**即把所有的观察者存入了 mObserverMap 中**</font>；

 #### ObserverWithState()

``` java
// LifecycleRegistry.java
    static class ObserverWithState {
        State mState;
        LifecycleEventObserver mLifecycleObserver;

        ObserverWithState(LifecycleObserver observer, State initialState) {
            mLifecycleObserver = Lifecycling.lifecycleEventObserver(observer);
            mState = initialState;
        }

        void dispatchEvent(LifecycleOwner owner, Event event) {
            State newState = event.getTargetState();
            mState = min(mState, newState);
            mLifecycleObserver.onStateChanged(owner, event);
            mState = newState;
        }
    }
```

如名称所指，LifecycleWithState 包含了 mState 和 mLifecycleObserver 这 2 个成员变量，构造函数里通过 Lifecycling.lifecycleEventObserver(observer) 返回 LifecycleEventObserver 对象 mLifecycleObserver；

#### lifecycleEventObserver()

``` java
// Lifecycling.java
    static LifecycleEventObserver lifecycleEventObserver(Object object) {
        boolean isLifecycleEventObserver = object instanceof LifecycleEventObserver;
        boolean isFullLifecycleObserver = object instanceof FullLifecycleObserver;
        if (isLifecycleEventObserver && isFullLifecycleObserver) {
            return new FullLifecycleObserverAdapter((FullLifecycleObserver) object,
                    (LifecycleEventObserver) object);
        }
        if (isFullLifecycleObserver) {
            return new FullLifecycleObserverAdapter((FullLifecycleObserver) object, null);
        }

        if (isLifecycleEventObserver) {
            return (LifecycleEventObserver) object; // 直接返回 LifecycleEventObserver 对象，不往下 new 了
        }
        ...
        return new ReflectiveGenericLifecycleObserver(object);
    }
```

这里注意 new 的对象是 ReflectiveGenericLifecycleObserver，在后面会用到；

如果传入的观察者即是 LifecycleEventObserver 对象，又是 FullLifecycleObserver 对象（DefaultLifecycleObserver 继承了 FullLifecycleObserver  接口），即观察者同时实现了这两个接口，那么就返回一个 FullLifecycleObserverAdapter 对象，

``` java
// FullLifecycleObserverAdapter.java
class FullLifecycleObserverAdapter implements LifecycleEventObserver {

    private final FullLifecycleObserver mFullLifecycleObserver;
    private final LifecycleEventObserver mLifecycleEventObserver;

    FullLifecycleObserverAdapter(FullLifecycleObserver fullLifecycleObserver,
            LifecycleEventObserver lifecycleEventObserver) {
        mFullLifecycleObserver = fullLifecycleObserver;
        mLifecycleEventObserver = lifecycleEventObserver;
    }

    @Override
    public void onStateChanged(@NonNull LifecycleOwner source, @NonNull Lifecycle.Event event) {
        switch (event) {
            case ON_CREATE:
                mFullLifecycleObserver.onCreate(source);
                break;
            case ON_START:
                mFullLifecycleObserver.onStart(source);
                break;
            case ON_RESUME:
                mFullLifecycleObserver.onResume(source);
                break;
            case ON_PAUSE:
                mFullLifecycleObserver.onPause(source);
                break;
            case ON_STOP:
                mFullLifecycleObserver.onStop(source);
                break;
            case ON_DESTROY:
                mFullLifecycleObserver.onDestroy(source);
                break;
            case ON_ANY:
                throw new IllegalArgumentException("ON_ANY must not been send by anybody");
        }
        if (mLifecycleEventObserver != null) {
            mLifecycleEventObserver.onStateChanged(source, event);
        }
    }
}
```

- FullLifecycleObserverAdapter 中同时包含了 FullLifecycleObserver 和 LifecycleEventObserver 成员变量，而且在 onStateChanged() 中先调用了 FullLifecycleObserver 里面的生命周期方法，后调用 LifecycleEventObserver 的生命周期方法，所以这里就知道了如果观察者同时实现 LifecycleEventObserver 和 DefaultLifecycleObserver 接口的话，那么优先执行 DefaultLifecycleObserver 的生命周期方法，和 【使用篇】里的优先级描述对应起来了；
- 如果观察者是 LifecycleEventObserver 或者 FullLifecycleObserver 对象（DefaultLifecycleObserver 对象），那么直接返回传入的 object(观察者)给到 mLifecycleObserver，
- 如果都不是，即早期直接实现 LifecycleObserver 接口并通过注解方式实现生命周期函数的观察者，则 new 一个 ReflectiveGenericLifecycleObserver 对象；

接下来继续回到 addObserver() 中：

``` java
// LifecycleRegistry.java
    public void addObserver(@NonNull LifecycleObserver observer) {
        this.enforceMainThreadIfNeeded("addObserver");
        Lifecycle.State initialState = this.mState == State.DESTROYED ? State.DESTROYED : State.INITIALIZED;
        ObserverWithState statefulObserver = new ObserverWithState(observer, initialState);
        ObserverWithState previous = (ObserverWithState)this.mObserverMap.putIfAbsent(observer, statefulObserver);
        if (previous == null) { // 不等于 null 说明之前的 mObserverMap 中没有包含当前观察者
            LifecycleOwner lifecycleOwner = (LifecycleOwner)this.mLifecycleOwner.get();
            if (lifecycleOwner != null) {
                boolean isReentrance = this.mAddingObserverCounter != 0 || this.mHandlingEvent;
                // 计算当前被添加进来的观察者应该同步到哪种最终状态（LifecycleRegistry 对象当前的状态）
                Lifecycle.State targetState = this.calculateTargetState(observer);
                ++this.mAddingObserverCounter;

                while(statefulObserver.mState.compareTo(targetState) < 0 && this.mObserverMap.contains(observer)) {
                    this.pushParentState(statefulObserver.mState);
                    Lifecycle.Event event = Event.upFrom(statefulObserver.mState); // 将状态转化为事件
                    ...
                    statefulObserver.dispatchEvent(lifecycleOwner, event); // 分发一次事件以更新 ObserverWithState 中的状态
                    this.popParentState();
                    // 再次计算当前观察者应该同步到哪种最终状态,因为这个过程中可能 LifecycleRegistry 的状态会改变
                    // 如果 LifecycleRegistry 的状态改变了或者第一次循环完事后,当前观察者的状态还未和 LifecycleRegistry 的状态同步,那么还需要继续的循环执行
                    targetState = this.calculateTargetState(observer);
                }

                if (!isReentrance) {
                    this.sync();
                }

                --this.mAddingObserverCounter;
            }
        }
    }
```



- calculateTargetState：计算 LifecycleRegistry 对象当前的状态；
- while 循环：将观察者和宿主的状态进行对齐，
  - compareTo：将观察者和宿主状态进行比较，如果小于 0，说明两者状态还没有对齐；
  - 如果当前观察者的状态还没有对齐，且 mObserverMap 中包含这个观察者，那么就执行一次事件分发，分发对应的生命周期事件；
  - 如果 LifecycleRegistry 的状态改变了或者第一次循环完事后,当前观察者的状态还未和 LifecycleRegistry 的状态同步，那么还需要继续的循环执行；
- sync：该方法的作用是将 mObserverMap 中所有的观察者的状态都同步为当前 LifecycleRegistry 的状态；

**通过 while 循环，可以知道在 Activity/Fragment 的任意生命周期方法中添加观察者都能接收到完整的生命周期事件；**

到这里，addObserver() 就结束了，接下来分析如何实现 Activity/Fragment 的生命周期事件监听；

### 监听 Activity/Fragment 生命周期事件

前面讲过 Activity/Fragment 间接实现了 LifecycleOwner 接口，具体路径如下：

Activity -> AppCompatActivity -> FragmentActivity -> androidx.activity.ComponentActivity -> androidx.core.app.ComponentActivity，两个 ComponentActivity 都实现了 LifecycleOwner 接口，在它们的 onCreate() 方法中，

``` java
// androidx.activity.ComponentActivity.java
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        this.mSavedStateRegistryController.performRestore(savedInstanceState);
        this.mContextAwareHelper.dispatchOnContextAvailable(this);
        super.onCreate(savedInstanceState);
        ReportFragment.injectIfNeededIn(this);
        if (this.mContentLayoutId != 0) {
            this.setContentView(this.mContentLayoutId);
        }

    }
// androidx.core.app.ComponentActivity.java
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ReportFragment.injectIfNeededIn(this);
    }
```

都有 `ReportFragment.injectIfNeededIn(this)` 这行代码；

#### injectIfNeededIn()

``` java
// ReportFragment.java
    public static void injectIfNeededIn(Activity activity) {
        if (VERSION.SDK_INT >= 29) {
            ReportFragment.LifecycleCallbacks.registerIn(activity);
        }

        FragmentManager manager = activity.getFragmentManager();
        if (manager.findFragmentByTag("androidx.lifecycle.LifecycleDispatcher.report_fragment_tag") == null) {
            manager.beginTransaction().add(new ReportFragment(), "androidx.lifecycle.LifecycleDispatcher.report_fragment_tag").commit();
            manager.executePendingTransactions();
        }

    }
```

做了两件事：

- 判断当前 Activity 是否包含一个 ReportFragment，如果没有，就为其添加一个没有 UI 的 ReportFragment；
- 如果 SDK 大于 29，为 Activity 注册生命周期回调 LifecycleCallbacks；

#### API 29 以后 - Activity 生命周期回调

LifecycleCallbacks() 生命周期回调

``` java
// ReportFragment.java
    static class LifecycleCallbacks implements Application.ActivityLifecycleCallbacks {
        public void onActivityCreated(@NonNull Activity activity, @Nullable Bundle bundle) {
        }

        public void onActivityPostCreated(@NonNull Activity activity, @Nullable Bundle savedInstanceState) {
            ReportFragment.dispatch(activity, Event.ON_CREATE);
        }
        public void onActivityPrePaused(@NonNull Activity activity) {
            ReportFragment.dispatch(activity, Event.ON_PAUSE);
        }

        public void onActivityPaused(@NonNull Activity activity) {
        }
    }
```

LifecycleCallbacks 实现了 Application.ActivityLifecycleCallbacks() 接口，

``` java
// Application.java
    public interface ActivityLifecycleCallbacks {
        /**
         * Called when the Activity calls {@link Activity#onCreate super.onCreate()}.
         */
        void onActivityCreated(@NonNull Activity activity, @Nullable Bundle savedInstanceState);
        /**
         * Called as the last step of the Activity being created. This is always called after
         * {@link Activity#onCreate}.
         */
        default void onActivityPostCreated(@NonNull Activity activity,
                @Nullable Bundle savedInstanceState) {
```

从注释中看到 onActivityCreated 和 onActivityPostCreated 都是在 Activity#onCreate 执行时被调用，然后调用到 ReportFragment.dispatch() 函数；

#### API 29以前 - Report 生命周期

因为添加了一个没有 UI 的 ReportFragment，所以当 Activity 的生命周期发生变化时 ReportFragment 的生命周期也会被调用：

``` java
// ReportFragment.java
    public void onActivityCreated(Bundle savedInstanceState) {
        super.onActivityCreated(savedInstanceState);
        this.dispatchCreate(this.mProcessListener);
        this.dispatch(Event.ON_CREATE);
    }

    public void onStart() {
        super.onStart();
        this.dispatchStart(this.mProcessListener);
        this.dispatch(Event.ON_START);
    }
```

所以 API 29 之前和之后，最终都会调用到 ReportFragment.dispatch()，ReportFragment 的作用就是获取生命周期而已，因为 Fragment 生命周期是依附 Activity 的，好处就是把这部分逻辑抽离出来，实现 Activity 的无侵入；

### 生命周期事件分发 - dispatch()

``` java
// ReportFragment.java
    static void dispatch(@NonNull Activity activity, @NonNull Lifecycle.Event event) {
        if (activity instanceof LifecycleRegistryOwner) { // 已废弃，无需查看
            ((LifecycleRegistryOwner)activity).getLifecycle().handleLifecycleEvent(event);
        } else {
            if (activity instanceof LifecycleOwner) {
                Lifecycle lifecycle = ((LifecycleOwner)activity).getLifecycle();
                if (lifecycle instanceof LifecycleRegistry) {
                    ((LifecycleRegistry)lifecycle).handleLifecycleEvent(event); //
                }
            }

        }
    }
```

最终使用 LifecycleRegistry 的 handleLifecycleEvent 方法处理事件，

``` java
// LifecycleRegistry.java
    public void handleLifecycleEvent(@NonNull Lifecycle.Event event) {
        this.enforceMainThreadIfNeeded("handleLifecycleEvent");
        this.moveToState(event.getTargetState()); // 获取 event 发生之后的将要处于的状态并移到这个状态
    }
    private void moveToState(Lifecycle.State next) {
        if (this.mState != next) { // 如果和当前状态不一致才处理
            this.mState = next;
            if (!this.mHandlingEvent && this.mAddingObserverCounter == 0) {
                this.mHandlingEvent = true;
                this.sync(); // 把生命周期状态同步给所有观察者
                this.mHandlingEvent = false;
            } else {
                this.mNewEventOccurred = true;
            }
        }
    }
    private void sync() {
        LifecycleOwner lifecycleOwner = (LifecycleOwner)this.mLifecycleOwner.get();
        if (lifecycleOwner == null) {
            throw new IllegalStateException("LifecycleOwner of this LifecycleRegistry is alreadygarbage collected. It is too late to change lifecycle state.");
        } else {
            while(!this.isSynced()) { // isSynced() 意思是所有观察者都同步完了
                this.mNewEventOccurred = false;
                if (this.mState.compareTo(((ObserverWithState)this.mObserverMap.eldest().getValue()).mState) < 0) {
                    this.backwardPass(lifecycleOwner); // 
                }

                Map.Entry<LifecycleObserver, ObserverWithState> newest = this.mObserverMap.newest();
                if (!this.mNewEventOccurred && newest != null && this.mState.compareTo(((ObserverWithState)newest.getValue()).mState) > 0) {
                    this.forwardPass(lifecycleOwner);
                }
            }

            this.mNewEventOccurred = false;
        }
    }

// 最老的和最新的观察者的状态一致，都是ower的当前状态，说明已经同步完了
    private boolean isSynced() {
        if (this.mObserverMap.size() == 0) {
            return true;
        } else {
            Lifecycle.State eldestObserverState = ((ObserverWithState)this.mObserverMap.eldest().getValue()).mState;
            Lifecycle.State newestObserverState = ((ObserverWithState)this.mObserverMap.newest().getValue()).mState;
            return eldestObserverState == newestObserverState && this.mState == newestObserverState;
        }
    }

        @NonNull
        public State getTargetState() {
            switch (this) {
                case ON_CREATE:
                case ON_STOP:
                    return Lifecycle.State.CREATED;
                case ON_START:
                case ON_PAUSE:
                    return Lifecycle.State.STARTED;
                case ON_RESUME:
                    return Lifecycle.State.RESUMED;
                case ON_DESTROY:
                    return Lifecycle.State.DESTROYED;
                case ON_ANY:
                default:
                    throw new IllegalArgumentException(this + " has no target state");
            }
        }
```

使用 getTargetState() 获取生命周期事件 event 发生后将要处于的生命周期状态 state，通过 moveToState 移动到新状态，再使用 sync() 把生命周期状态同步给所有观察者，sync() 中有一个 while 循环，判断条件是 isSynced()，意思是最老的和最新的观察者的状态一致，都是ower的当前状态，说明已经同步完了，然后比较宿主状态和最老/最新观察者的状态：

- mState 比最老观察者状态小，调用 backwardPass(lifecycleOwner)：从新到老分发，循环使用 downFrom() 和 observer.dispatchEvent()，连续分发事件；

  ``` java
  // LifecycleRegistry.java
      private void backwardPass(LifecycleOwner lifecycleOwner) {
          Iterator<Map.Entry<LifecycleObserver, ObserverWithState>> descendingIterator = this.mObserverMap.descendingIterator();
  
          while(descendingIterator.hasNext() && !this.mNewEventOccurred) {
              Map.Entry<LifecycleObserver, ObserverWithState> entry = (Map.Entry)descendingIterator.next();
              ObserverWithState observer = (ObserverWithState)entry.getValue();
  
              while(observer.mState.compareTo(this.mState) > 0 && !this.mNewEventOccurred && this.mObserverMap.contains((LifecycleObserver)entry.getKey())) {
                  Lifecycle.Event event = Event.downFrom(observer.mState); // 状态转事件
                  ...
                  this.pushParentState(event.getTargetState());
                  observer.dispatchEvent(lifecycleOwner, event);
                  this.popParentState();
              ...
  ```

  

- mState 比最新观察者状态大，调用 forwardPass(lifecycleOwner)：从老到新分发，循环使用 upFrom() 和 observer.dispatchEvent()，连续分发事件。

  ``` java
  // LifecycleRegistry.java
      private void forwardPass(LifecycleOwner lifecycleOwner) {
          Iterator<Map.Entry<LifecycleObserver, ObserverWithState>> ascendingIterator = this.mObserverMap.iteratorWithAdditions();
  
          while(ascendingIterator.hasNext() && !this.mNewEventOccurred) {
              Map.Entry<LifecycleObserver, ObserverWithState> entry = (Map.Entry)ascendingIterator.next();
              ObserverWithState observer = (ObserverWithState)entry.getValue();
  
              while(observer.mState.compareTo(this.mState) < 0 && !this.mNewEventOccurred && this.mObserverMap.contains((LifecycleObserver)entry.getKey())) {
                  this.pushParentState(observer.mState);
                  Lifecycle.Event event = Event.upFrom(observer.mState); // 状态转事件
                  ...
                  observer.dispatchEvent(lifecycleOwner, event);
                  this.popParentState();
              ...
  ```

最后都会调用到 ObserverWithState 的 dispatchEvent() 方法；

### 生命周期事件回调 - ObserverWithState .dispatchEvent()

``` java
// LifecycleRegistry.java
    static class ObserverWithState {
        Lifecycle.State mState;
        LifecycleEventObserver mLifecycleObserver;

        ObserverWithState(LifecycleObserver observer, Lifecycle.State initialState) {
            this.mLifecycleObserver = Lifecycling.lifecycleEventObserver(observer);
            this.mState = initialState;
        }

        void dispatchEvent(LifecycleOwner owner, Lifecycle.Event event) {
            Lifecycle.State newState = event.getTargetState();
            this.mState = LifecycleRegistry.min(this.mState, newState);
            this.mLifecycleObserver.onStateChanged(owner, event);
            this.mState = newState;
        }
    }
```

最终调用到最开始添加的观察者重写的的 onStateChanged；







### 旧版本相关分析

#### ReflectiveGenericLifecycleObserver

``` java
// ReflectiveGenericLifecycleObserver.java
    private final Object mWrapped;
    private final androidx.lifecycle.ClassesInfoCache.CallbackInfo mInfo;
    ReflectiveGenericLifecycleObserver(Object wrapped) {
        mWrapped = wrapped; // wrapped 是观察者对象
        mInfo = ClassesInfoCache.sInstance.getInfo(mWrapped.getClass());
    }
    @Override
    public void onStateChanged(@NonNull LifecycleOwner source, @NonNull Event event) {
        mInfo.invokeCallbacks(source, event, mWrapped); // 最终会调用到这里
    }

```

这里的 wrapped 就是观察者对应的对象，注意这里的 onStateChanged() 方法，最终会通过这里调用观察者中对应 event 的方法，继续看 getInfo()；

``` java
// ClassesInfoCache.java
    CallbackInfo getInfo(Class<?> klass) {
        CallbackInfo existing = mCallbackMap.get(klass);
        if (existing != null) {
            return existing;
        }
        existing = createInfo(klass, null);
        return existing;
    }

private CallbackInfo createInfo(Class<?> klass, @Nullable Method[] declaredMethods) {
        ...
        Method[] methods = declaredMethods != null ? declaredMethods : getDeclaredMethods(klass);
        boolean hasLifecycleMethods = false;
        for (Method method : methods) {
            OnLifecycleEvent annotation = method.getAnnotation(OnLifecycleEvent.class);
            if (annotation == null) {
                continue;
            }
            hasLifecycleMethods = true;
            Class<?>[] params = method.getParameterTypes();
            int callType = CALL_TYPE_NO_ARG;
            if (params.length > 0) {
                callType = CALL_TYPE_PROVIDER;
                if (!params[0].isAssignableFrom(LifecycleOwner.class)) {
                    throw new IllegalArgumentException(
                            "invalid parameter type. Must be one and instanceof LifecycleOwner");
                }
            }
            Lifecycle.Event event = annotation.value();

            if (params.length > 1) {
                callType = CALL_TYPE_PROVIDER_WITH_EVENT;
                if (!params[1].isAssignableFrom(Lifecycle.Event.class)) {
                    throw new IllegalArgumentException(
                            "invalid parameter type. second arg must be an event");
                }
                if (event != Lifecycle.Event.ON_ANY) {
                    throw new IllegalArgumentException(
                            "Second arg is supported only for ON_ANY value");
                }
            }
            if (params.length > 2) {
                throw new IllegalArgumentException("cannot have more than 2 params");
            }
            MethodReference methodReference = new MethodReference(callType, method);
            verifyAndPutHandler(handlerToEvent, methodReference, event, klass);
        }
        CallbackInfo info = new CallbackInfo(handlerToEvent);
        mCallbackMap.put(klass, info);
        mHasLifecycleMethods.put(klass, hasLifecycleMethods);
        return info;
    }
```



可见 methods 数组以反射的方法保存了观察者对象对应的类里所有的方法，随后遍历这个方法数组，如果其中的方法没用注解则跳过，有注解的往下执行，callType 其实就是方法的参数个数，event 则是注解的值，然后<font color=red>**把参数个数和方法包装成 MethodReference 对象;**</font>

``` java
// ClassesInfoCache.java
        MethodReference(int callType, Method method) {
            mCallType = callType;
            mMethod = method;
            mMethod.setAccessible(true);
        }
```

通过 setAccessible() 把方法设置为可访问，

``` java
// ClassesInfoCache.java
    private void verifyAndPutHandler(Map<MethodReference, Lifecycle.Event> handlers,
            MethodReference newHandler, Lifecycle.Event newEvent, Class<?> klass) {
        Lifecycle.Event event = handlers.get(newHandler);
        if (event != null && newEvent != event) {
            Method method = newHandler.mMethod;
            ...
        }
        if (event == null) {
            handlers.put(newHandler, newEvent);
        }
    }
```

通过 verifyAndPutHandler()，把包装好的 MethodReference 作为 key，方法注解对应的事件作为 value 加入到 handlerToEvent 这个 Map 中，再传给 CallbackInfo 对象，并最终返回此 info 给到 ReflectiveGenericLifecycleObserver 中的 mInfo 对象，<font color=red>**所以 mInfo 保存了所有带注解的方法，包括注解对应的事件；**</font>



```
public class MainActivity extends AppCompatActivity {
public class AppCompatActivity extends FragmentActivity
public class FragmentActivity extends ComponentActivity

public class ComponentActivity extends androidx.core.app.ComponentActivity implements
        ContextAware,
        LifecycleOwner,
        ViewModelStoreOwner,
        HasDefaultViewModelProviderFactory,
        SavedStateRegistryOwner,
        OnBackPressedDispatcherOwner,
        ActivityResultRegistryOwner,
        ActivityResultCaller {
```

通过层层继承，找到 ComponentActivity.onCreate()：

``` java
// ComponentActivity.java
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        // Restore the Saved State first so that it is available to
        // OnContextAvailableListener instances
        mSavedStateRegistryController.performRestore(savedInstanceState);
        mContextAwareHelper.dispatchOnContextAvailable(this);
        super.onCreate(savedInstanceState);
        ReportFragment.injectIfNeededIn(this);
        if (mContentLayoutId != 0) {
            setContentView(mContentLayoutId);
        }
    }
```

这里调用了`ReportFragment.injectIfNeededIn(this);`

``` java
    public static void injectIfNeededIn(Activity activity) {
        if (Build.VERSION.SDK_INT >= 29) {
            // On API 29+, we can register for the correct Lifecycle callbacks directly
            LifecycleCallbacks.registerIn(activity);
        }
        // Prior to API 29 and to maintain compatibility with older versions of
        // ProcessLifecycleOwner (which may not be updated when lifecycle-runtime is updated and
        // need to support activities that don't extend from FragmentActivity from support lib),
        // use a framework fragment to get the correct timing of Lifecycle events
        android.app.FragmentManager manager = activity.getFragmentManager();
        if (manager.findFragmentByTag(REPORT_FRAGMENT_TAG) == null) {
            manager.beginTransaction().add(new ReportFragment(), REPORT_FRAGMENT_TAG).commit();
            // Hopefully, we are the first to make a transaction.
            manager.executePendingTransactions();
        }
```

<font color=red>**获取 FragmentManager，在 Activity 上添加了一个 ReportFragment，但是这个 Fragment 并没有 UI，那么以后 Activity 的生命周期发生变化时，这个 Fragment 对应的生命周期方法也会被调用;**</font>

``` java
// ReportFragment.java
    @Override
    public void onActivityCreated(Bundle savedInstanceState) {
        super.onActivityCreated(savedInstanceState);
        dispatchCreate(mProcessListener);
        dispatch(Lifecycle.Event.ON_CREATE);
    }

    @Override
    public void onStart() {
        super.onStart();
        dispatchStart(mProcessListener);
        dispatch(Lifecycle.Event.ON_START);
    }

    @Override
    public void onResume() {
        super.onResume();
        dispatchResume(mProcessListener);
        dispatch(Lifecycle.Event.ON_RESUME);
    }

    @Override
    public void onPause() {
        super.onPause();
        dispatch(Lifecycle.Event.ON_PAUSE);
    }

    @Override
    public void onStop() {
        super.onStop();
        dispatch(Lifecycle.Event.ON_STOP);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        dispatch(Lifecycle.Event.ON_DESTROY);
        // just want to be sure that we won't leak reference to an activity
        mProcessListener = null;
    }
```

在 ReportFragment 生命周期方法中可以看到都调用了 dispatch() 方法，

``` java
// ReportFragment.java
    private void dispatch(@NonNull Lifecycle.Event event) {
        if (Build.VERSION.SDK_INT < 29) {
            // Only dispatch events from ReportFragment on API levels prior
            // to API 29. On API 29+, this is handled by the ActivityLifecycleCallbacks
            // added in ReportFragment.injectIfNeededIn
            dispatch(getActivity(), event);
        }
    }

    @SuppressWarnings("deprecation")
    static void dispatch(@NonNull Activity activity, @NonNull Lifecycle.Event event) {
        if (activity instanceof LifecycleRegistryOwner) {
            ((LifecycleRegistryOwner) activity).getLifecycle().handleLifecycleEvent(event);
            return;
        }

        if (activity instanceof LifecycleOwner) {
            Lifecycle lifecycle = ((LifecycleOwner) activity).getLifecycle();
            if (lifecycle instanceof LifecycleRegistry) {
                ((LifecycleRegistry) lifecycle).handleLifecycleEvent(event);
            }
        }
    }
```

即一旦 Activity 生命周期发生变化，就通过 dispatch() 分发事件，然后再调用到 handleLifecycleEvent() 方法，

``` java
// LifecycleRegistry.java
    public void handleLifecycleEvent(@NonNull Lifecycle.Event event) {
        enforceMainThreadIfNeeded("handleLifecycleEvent");
        moveToState(event.getTargetState());
    }
```

调用 moveToState()

``` java
// LifecycleRegistry.java
    private void moveToState(State next) {
        if (mState == next) {
            return;
        }
        mState = next;
        if (mHandlingEvent || mAddingObserverCounter != 0) {
            mNewEventOccurred = true;
            // we will figure out what to do on upper level.
            return;
        }
        mHandlingEvent = true;
        sync();
        mHandlingEvent = false;
    }
```



``` java
// LifecycleRegistry.java
    private void sync() {
        LifecycleOwner lifecycleOwner = mLifecycleOwner.get();
        ...
        while (!isSynced()) {
            ...
            if (mState.compareTo(mObserverMap.eldest().getValue().mState) < 0) {
                backwardPass(lifecycleOwner);
            }
            Map.Entry<LifecycleObserver, ObserverWithState> newest = mObserverMap.newest();
            if (!mNewEventOccurred && newest != null
                    && mState.compareTo(newest.getValue().mState) > 0) {
                forwardPass(lifecycleOwner);
            }
        }
        mNewEventOccurred = false;
    }
```



``` java
// LifecycleRegistry.java
    private void forwardPass(LifecycleOwner lifecycleOwner) {
        Iterator<Map.Entry<LifecycleObserver, ObserverWithState>> ascendingIterator =
                mObserverMap.iteratorWithAdditions();
        while (ascendingIterator.hasNext() && !mNewEventOccurred) {
            Map.Entry<LifecycleObserver, ObserverWithState> entry = ascendingIterator.next();
            ObserverWithState observer = entry.getValue();
            while ((observer.mState.compareTo(mState) < 0 && !mNewEventOccurred
                    && mObserverMap.contains(entry.getKey()))) {
                pushParentState(observer.mState);
                final Event event = Event.upFrom(observer.mState);
                if (event == null) {
                    throw new IllegalStateException("no event up from " + observer.mState);
                }
                observer.dispatchEvent(lifecycleOwner, event);
                popParentState();
            }
        }
    }
```

从 mObserverMap 中拿到 ObserverWithState 对象，

``` java
// LifecycleRegistry.java
    static class ObserverWithState {
        State mState;
        LifecycleEventObserver mLifecycleObserver;
        void dispatchEvent(LifecycleOwner owner, Event event) {
            State newState = event.getTargetState();
            mState = min(mState, newState);
            mLifecycleObserver.onStateChanged(owner, event);
            mState = newState;
        }
```

这里的 mLifecycleObserver 就是前面说到的 ReflectiveGenericLifecycleObserver 对象，所以调用到 ReflectiveGenericLifecycleObserver.onStateChanged()；

<font color=red>**注意：如前面所述，如果我们的观察者实现了 LifecycleEventObserver 对象，那么这里就直接调用我们实现了 LifecycleEventObserver 的观察者中的 onStateChanged() 方法即可，更简单了，连旧版本的反射调用都省了；**</font>

``` java
// ReflectiveGenericLifecycleObserver.java
    public void onStateChanged(@NonNull LifecycleOwner source, @NonNull Event event) {
        mInfo.invokeCallbacks(source, event, mWrapped);
    }
```

这个 mInfo 前面也提到过，保存了所有带注解的方法，包括注解对应的事件，把被观察者 source，事件，观察者都传入参数，

``` java
// ClassesInfoCache.java
        void invokeCallbacks(LifecycleOwner source, Lifecycle.Event event, Object target) {
            invokeMethodsForEvent(mEventToHandlers.get(event), source, event, target);
            invokeMethodsForEvent(mEventToHandlers.get(Lifecycle.Event.ON_ANY), source, event,
                    target);
        }

        private static void invokeMethodsForEvent(List<MethodReference> handlers,
                LifecycleOwner source, Lifecycle.Event event, Object mWrapped) {
            if (handlers != null) {
                for (int i = handlers.size() - 1; i >= 0; i--) {
                    handlers.get(i).invokeCallback(source, event, mWrapped);
                }
            }
        }
```

调用 MethodReference.invokeCallback

``` java
// ClassesInfoCache.java
    static final class MethodReference {
        void invokeCallback(LifecycleOwner source, Lifecycle.Event event, Object target) {
            //noinspection TryWithIdenticalCatches
            try {
                switch (mCallType) {
                    case CALL_TYPE_NO_ARG:
                        mMethod.invoke(target);
                        break;
                    case CALL_TYPE_PROVIDER:
                        mMethod.invoke(target, source);
                        break;
                    case CALL_TYPE_PROVIDER_WITH_EVENT:
                        mMethod.invoke(target, source, event);
                        break;
                }
            } catch (InvocationTargetException e) {
                throw new RuntimeException("Failed to call observer method", e.getCause());
            } catch (IllegalAccessException e) {
                throw new RuntimeException(e);
            }
        }
```

前面知道我们当前的参数个数是 1，即 CALL_TYPE_PROVIDER，`mMethod.invoke(target, source)` 中的 target 就是观察者，mMethod 就是前面 createInfo() 创建 MethodReference() 时传入的方法，source 则是方法的参数，这样就和观察者类中实现的带注解的方法对应起来了：

``` java

    @OnLifecycleEvent(Lifecycle.Event.ON_CREATE)
    void onCreateX(LifecycleOwner owner){
        Log.d("tag", "ON_CREATE-1");
    }
```





## 总结

- 1.mObserverMap 保存所有的观察者

- ~~旧版本：获取观察者中所有带注解的方法，并把信息存入 ReflectiveGenericLifecycleObserver.mInfo 中；~~

- Activity 上添加了一个没有 UI 的 ReportFragment，当Activity 的生命周期发生变化时就会调用 ReportFragment 对应的生命周期方法或者 Activity 生命周期回调，通过 dispatch() 分发事件，

- ~~旧版本：从 mObserverMap 中拿到观察者，通过 mInfo 反射调用观察者中对应事件的方法；~~

- 新版本：直接调用实现了 LifecycleEventObserver 的观察者中重写的 onStateChanged() 方法；



