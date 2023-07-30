---
title: Android - Jetpack 套件之 LiveData 使用和原理
date: 2023-06-16 22:55:28
tags: Jetpack, Dagger2
categories: Android
copyright: true
password:
---

> Android Jetpack 套件之 Dagger2 使用和原理解析；

<!--more-->

**IOC - Inversion of Control**

控制反转，反转的是对象的创建方式，IOC 框架有两种实现方式：

- 基于反射的实现方式，比如 Spring IOC（动态的进行依赖关系的建立），在运行过程中动态的建立依赖关系；
- 静态方式，程序在编译期自动生成代码用于建立依赖关系；

依赖注入是 IOC 的一种实现方式；

手动依赖注入方式

- 构造函数注入
- Setter 注入（setXXX 方法）

**什么是 Dagger？**

Dagger 是提供给 Android 快速实现依赖注入的框架；

**Dagger 使用**

使用对象的构造方法创建对象

- 定义对象

  ``` java
  public class User {
      @Inject
      public User() {
          
      }
  }
  ```

  @Inject 注解用于告知 Dagger 可以通过构造方法创建并获取对象实例；

- 编写 Component 接口用于执行注入

  ``` java
  @Component
  public interface AppComponent ｛
      public void inject(MainActivity mainActivity);
  ｝
  ```

  inject 方法参数表示把对象注入到 MainActivity 中；

- 定义依赖对象

  ``` java
  public class MainActivity extends AppCompatActivity {
      @Inject
      User user;
      ...
  }
  ```

  @Inject 表示这个对象需要注入；

- 执行依赖对象注入

  ``` java
  public class MainActivity extends AppCompatActivity {
      @Inject
      User user;
      
      @Override
      protected void onCreate(Bundle savedInstanceState) {
          super.onCreate(savedInstanceState);
          setContentView(R.layout.activity_main);
          DaggerAppComponent.create().inject(this); // 执行注入
      }
  }
  ```

使用 Module 的 provideXXX() 获取对象



作用域：用来管理 Component 来获取对象实例的生命周期的；





**多个 component 上面的 scope 不能相同**

没有 scope 的组件不能去依赖有 scope 的组件

Lazy 和 Provider 区别：Lazy 是单例（使用 DoubleCheck），Provider 不是单例；

## SubComponent 使用

父 Component 装载 父Module，父Module 创建子Componet（在父Module中指定subcomponents为子Component），子Componet 装载子Module，子Module 创建XXX对象，然后父Component 提供获取子Component 的方法，子Component 提供 inject 方法；

需要注意的是，子Componet 没有单独的 Dagger子Component，而是存在于 Dagger父Component中，所以注入的时候使用 `Dagger父Componet.子Compoent().create().inject(this)` 的方式，

组件依赖和子组件主要解决了不同作用域时组件之间复用问题：

- 在一个组件指定作用域后，就已经确定了该组件创建对象的生命周期，但是有些对象实例的生命周期更短，这个时候就需要定义新的组件；
- 新组件需要使用原组建的部分资源；
- 两种方式实现：
  - 为 @Component 添加 dependencies 参数，指定该组件依赖于新的组件；
  - 直接使用 @Subcomponent 注解创建新的组件，并装载到父组件中；

## @Binds 使用

``` java
public abstract class TestModule {
    // 表示告诉 Dagger 此方法刻意返回 AInterface 对象，但是具体的创建是由其实现类 AInterfaceImpl01 完成的
    @Binds
    abstract AInterface bindAinterface(AInterfaceImpl01 impl);
    // 定义如何创建 AInterfaceImpl01 对象
    @Provides
    static AinterfaceImpl01 provideAInterfaceImpl01() {
        return new AInterfaceImpl01();
    }
}
```

注入接口

``` java
// 这里可以直接定义一个依赖接口，如果不使用 @Binds，则只能定义一个依赖对象
@Inject AInterface aInterface;
```























