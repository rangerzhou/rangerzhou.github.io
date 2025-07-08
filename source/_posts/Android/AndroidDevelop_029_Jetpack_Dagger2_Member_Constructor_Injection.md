---
title: Android - Jetpack 套件之 Dagger2 成员注入和构造函数注入
date: 2023-06-25 13:11:23
tags: Jetpack, Dagger2
categories: Android
copyright: true
password:
---

> Android Jetpack 套件之 Dagger2 成员注入和构造函数注入。

<!--more-->

## 1. 什么是成员注入 (Member Injection)？

**成员注入**是指依赖注入框架（如 Dagger 2）在对象**已经实例化之后**，通过反射（或编译时生成的代码）将依赖项设置到该对象的**成员变量（字段）**中。

它与**构造函数注入（Constructor Injection）**是相对的概念。

## 2. 成员注入 vs. 构造函数注入

- **构造函数注入 (Constructor Injection):**

  - **方式：** 依赖项作为类的构造函数参数被提供。

  - 特点：

    - **依赖显式：** 类的构造函数明确声明了它所需要的所有依赖。
    - **更强类型安全：** 如果缺少依赖，编译时就会报错。
    - **强制依赖：** 类在构造时就保证拥有所有依赖，不存在空指针的风险。
    - **推荐方式：** 这是依赖注入的最佳实践和首选方式，因为它最“干净”和可测试。

  - 示例：

    Java

    ```java
    class Car {
        private Engine engine;
    
        @Inject // Dagger 会找到这个构造函数
        public Car(Engine engine) {
            this.engine = engine;
        }
    }
    ```

- **成员注入 (Member Injection) / 字段注入 (Field Injection):**

  - **方式：** 依赖项被注入到类的公共或私有**字段（成员变量）**中。

  - 特点：

    - **依赖隐式：** 类的构造函数不声明这些依赖，这些字段可能会在对象实例化后才被填充。
    - **潜在空指针风险：** 如果在注入完成前访问这些字段，可能会是 `null`（尽管 Dagger 编译时会检查）。
    - **通常用于无法进行构造函数注入的场景。**

  - 示例：

    Java

    ```java
    class MyActivity extends AppCompatActivity {
        @Inject // Dagger 会将 MyDependency 注入到这个字段
        MyDependency myDependency;
    
        // MyActivity 必须有（隐式或显式）一个无参构造函数，因为系统通过反射创建它
        public MyActivity() {
            // MyDependency 在这里还是 null
        }
    
        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            // 必须调用 Dagger 的注入方法来填充 myDependency
            // AndroidInjection.inject(this);
            // 在调用 inject() 之后，myDependency 才会被填充
        }
    }
    ```

## 3. 为什么成员注入在 Android 中是必要的？

这是理解成员注入在 Android 开发中重要性的核心原因：

- **Android 框架组件由系统实例化：**
  - `Activity`、`Fragment`、`Service`、`BroadcastReceiver` 和 `ContentProvider` 这些 Android 框架组件不是由开发者通过 `new` 关键字直接创建的。它们由 Android 操作系统在底层（通过 `ActivityManagerService`、`ActivityThread` 等）使用**反射机制**来实例化。
  - 当系统使用反射创建这些组件时，它**只能调用这些类的无参构造函数**（或者 Android 内部特定的、带有隐藏参数的构造函数），而不能提供你通过 `@Inject` 标记的自定义参数。
- **无法使用构造函数注入：**
  - 由于系统不通过你的构造函数来创建这些组件，你就无法在这些组件的构造函数上使用 `@Inject` 来声明它们的依赖。如果你尝试这样做，应用会崩溃。
- **成员注入作为替代方案：**
  - 因此，为了让 Dagger 能够为这些系统实例化的组件提供依赖，唯一的办法就是在它们被系统创建之后，再通过**成员注入**的方式将依赖填充到其字段中。

## 4. Dagger 如何处理成员注入？

Dagger 2 在编译时会为每个包含 `@Inject` 字段的类生成一个 `MembersInjector` 接口的实现。这个生成的类负责将依赖项设置到相应的字段中。

- 当你调用 `component.inject(this)`（或者 `AndroidInjection.inject(this)`）时，Dagger 2 的运行时代码会找到对应的 `MembersInjector`，并调用其方法，将依赖实例赋值给目标对象的 `@Inject` 字段。

## 5. `AndroidInjection.inject(this)` 的作用

- `AndroidInjection.inject(this)`（或 `DaggerAppCompatActivity` 等基类内部的调用）就是触发这个成员注入过程的**入口点**。
- 它会获取应用程序的 `AndroidInjector`（一个特殊的 Subcomponent），然后告诉它：“请为我（当前的 Activity/Fragment 实例）注入所有标记 `@Inject` 的字段。”
- 这样，在 `onCreate()` 方法执行到 `AndroidInjection.inject(this)` 之后，你所有通过 `@Inject` 标记的依赖字段都将被 Dagger 填充好，可以安全使用了。

## 6. 总结

**成员注入**是依赖注入框架在对象实例化后填充其字段依赖的方式。在 Android 开发中，由于 Activity、Fragment 等组件是由系统反射创建的，无法进行构造函数注入，因此**成员注入**成为了为这些组件提供依赖的**必要手段**。Dagger 2 通过编译时生成 `MembersInjector` 代码，配合运行时调用 `AndroidInjection.inject(this)`，实现了高效且安全的成员注入。
