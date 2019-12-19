---
title: Android JNI原理-loadLibrary动态库加载过程
copyright: true
date: 2019-10-25 16:38:46
tags:
categories: Android
password:
---

> **JNI** （**Java Native Interface, Java 本地接口**）是一种[编程框架](https://zh.wikipedia.org/w/index.php?title=%E7%BC%96%E7%A8%8B%E6%A1%86%E6%9E%B6&action=edit&redlink=1)，使得 [Java虚拟机](https://zh.wikipedia.org/wiki/Java%E8%99%9A%E6%8B%9F%E6%9C%BA)中的 [Java](https://zh.wikipedia.org/wiki/Java) 程序可以调用本地应用或库，也可以被其他程序调用。 本地程序一般是用其它语言（[C](https://zh.wikipedia.org/wiki/C%E8%AF%AD%E8%A8%80)、[C++](https://zh.wikipedia.org/wiki/C%2B%2B)或[汇编语言](https://zh.wikipedia.org/wiki/%E6%B1%87%E7%BC%96%E8%AF%AD%E8%A8%80)等）编写的，并且被编译为基于本机硬件和操作系统的程序。JNI 用于打通 Java 层与 Native(C/C++) 层，并非 Android 系统独有，而是 Java 所有。Java语言是跨平台的语言，而这跨平台的背后都是依靠Java虚拟机，虚拟机采用C/C++编写，适配各个系统，通过JNI为上层Java提供各种服务，保证跨平台性。本文基于 android-10.0.0_r6 源码。

<!--more-->

### 1. JNI loadLibrary 动态库加载过程

在 Android 上层 Java 代码中，只需要一行代码即可加载动态库：

``` java
System.load("/data/local/tmp/lib***.so");
System.loadLibrary("xxx");
```

load 和 loadLibrary 区别如下：

- load 指定动态库的完整路径，不会自动加载依赖库；
- loadLibrary 只从指定的 lib 目录查找，并加上 lib 前缀和 .so 后缀；

JAVA 层和 Native 层方法是怎样注册并映射的？以 Bluetooth 为例，在 [AdapterApp.java](http://androidxref.com/9.0.0_r3/xref/packages/apps/Bluetooth/src/com/android/bluetooth/btservice/AdapterApp.java) 中调用 `System.loadLibrary("bluetooth_jni");` ，加载 libbluetooth_jni.so 动态库到内存。

 [/packages/apps/Bluetooth/src/com/android/bluetooth/btservice/AdapterApp.java](https://android.googlesource.com/platform/packages/apps/Bluetooth/+/refs/tags/android-10.0.0_r6/src/com/android/bluetooth/btservice/AdapterApp.java)

``` java
public class AdapterApp extends Application {
    ... ...
    static {
        if (DBG) {
            Log.d(TAG, "Loading JNI Library");
        }
        System.loadLibrary("bluetooth_jni");
    }
```

#### 1.1 loadLibrary

##### 1.1.1 System.loadLibrary

[libcore/ojluni/src/main/java/java/lang/System.java](https://android.googlesource.com/platform/libcore/+/refs/tags/android-10.0.0_r6/ojluni/src/main/java/java/lang/System.java) 

``` java
public final class System {
    ... ...
    @CallerSensitive
    public static void loadLibrary(String libname) {
        Runtime.getRuntime().loadLibrary0(Reflection.getCallerClass(), libname);
    }
```

##### 1.1.2 Runtime.loadLibrary0

[libcore/ojluni/src/main/java/java/lang/Runtime.java](https://android.googlesource.com/platform/libcore/+/refs/tags/android-10.0.0_r6/ojluni/src/main/java/java/lang/Runtime.java) 

``` java
    void loadLibrary0(Class<?> fromClass, String libname) {
        // getClassLoader 返回 调用者(getCallerClass) fromClass 定义的 ClassLoader
        ClassLoader classLoader = ClassLoader.getClassLoader(fromClass);
        loadLibrary0(classLoader, fromClass, libname);
    }
    ... ...
    private synchronized void loadLibrary0(ClassLoader loader, Class<?> callerClass, String libname) {
        if (libname.indexOf((int)File.separatorChar) != -1) {
            // 目录分隔符不应该出现在 library 名称中
            throw new UnsatisfiedLinkError(
    "Directory separator should not appear in library name: " + libname);
        }
        String libraryName = libname;
        // 如果 loader 不为 null，就调用 findLibrary
        if (loader != null && !(loader instanceof BootClassLoader)) {
            // 根据动态库名获取动态库的文件路径，见 1.2
            String filename = loader.findLibrary(libraryName);
            if (filename == null) {
                throw new UnsatisfiedLinkError(loader + " couldn't find \"" +
                                               System.mapLibraryName(libraryName) + "\"");
            }
            // 在 nativeLoad 中加载库，如果加载成功则 return，否则抛出异常
            String error = nativeLoad(filename, loader);
            if (error != null) {
                // 加载错误
                throw new UnsatisfiedLinkError(error);
            }
            return;
        }

        // 当 loader 为 null 时执行如下操作
        // We know some apps use mLibPaths directly, potentially assuming it's not null.
        // Initialize it here to make sure apps see a non-null value.
        getLibPaths();// 获取 mLibPaths 值: /system/lib64/
        // mapLibraryName 功能是将动态库 xxx 的名字转换为 libxxx.so，见 1.1.4
        String filename = System.mapLibraryName(libraryName);
        // 真正加载库的函数 nativeLoad
        String error = nativeLoad(filename, loader, callerClass);
        if (error != null) {
            throw new UnsatisfiedLinkError(error);
        }
    }
    private volatile String[] mLibPaths = null;
    private String[] getLibPaths() {
        if (mLibPaths == null) {
            synchronized(this) {
                if (mLibPaths == null) {
                    mLibPaths = initLibPaths();
                }
            }
        }
        return mLibPaths;
    }

    private static String[] initLibPaths() {
        // java.library.path = /system/lib64
        String javaLibraryPath = System.getProperty("java.library.path");
        if (javaLibraryPath == null) {
            return EmptyArray.STRING;
        }
        String[] paths = javaLibraryPath.split(":");
        // Add a '/' to the end of each directory so we don't have to do it every time.
        for (int i = 0; i < paths.length; ++i) {
            if (!paths[i].endsWith("/")) {
                paths[i] += "/";
            }
        }
        return paths;
    }
```

**loadLibrary0** 主要目的是找到动态库所在路径，然后调用 **nativeLoad ** 来加载动态库，先判断 loader 是否为 null，当 loader 不为 null 时通过 loader.findLibrary() 查找动态库所在绝对路径，当 loader 为 null 时从默认目录 mLibPaths 下(比如 /vendor/lib, system/lib, system/lib64)查找是否存在该动态库，如果都没有找到就抛出异常。

##### 1.1.3 findLibrary

[libcore/dalvik/src/main/java/dalvik/system/BaseDexClassLoader.java](https://android.googlesource.com/platform/libcore/+/refs/tags/android-10.0.0_r6/dalvik/src/main/java/dalvik/system/BaseDexClassLoader.java)

**BaseDexClassLoader.findLibrary**

``` java
public class BaseDexClassLoader extends ClassLoader {
    @UnsupportedAppUsage
    private final DexPathList pathList;
    ... ...
    public BaseDexClassLoader(String dexPath,
            String librarySearchPath, ClassLoader parent, ClassLoader[] sharedLibraryLoaders,
            boolean isTrusted) {
        super(parent);
        ... ...
        // 初始化 DexPathList
        this.pathList = new DexPathList(this, dexPath, librarySearchPath, null, isTrusted);
        ... ...
    }
    ... ...
    @Override
    public String findLibrary(String name) {
        return pathList.findLibrary(name);
    }
```

[libcore/dalvik/src/main/java/dalvik/system/DexPathList.java](https://android.googlesource.com/platform/libcore/+/refs/tags/android-10.0.0_r6/dalvik/src/main/java/dalvik/system/DexPathList.java)

**初始化 DexPathList **

``` java
public final class DexPathList {
    ... ...
    DexPathList(ClassLoader definingContext, String dexPath,
            String librarySearchPath, File optimizedDirectory, boolean isTrusted) {
        ... ...
        this.definingContext = definingContext;
        ArrayList<IOException> suppressedExceptions = new ArrayList<IOException>();
        // save dexPath for BaseDexClassLoader
        this.dexElements = makeDexElements(splitDexPath(dexPath), optimizedDirectory,
                                           suppressedExceptions, definingContext, isTrusted);
        // app 目录的 native 库
        this.nativeLibraryDirectories = splitPaths(librarySearchPath, false);
        // 系统目录的 native 库
        this.systemNativeLibraryDirectories =
                splitPaths(System.getProperty("java.library.path"), true);
        // 记录所有的 native 动态库
        this.nativeLibraryPathElements = makePathElements(getAllNativeLibraryDirectories());
        ... ...
    }
```

DexPathList 构造函数主要是收集变量 dexElements(记录所有的 dexFile 文件) 和 nativeLibraryPathElements(记录所有的 native 动态库，包含 app 目录和 系统 目录的动态库) 的信息。

**DexPathList.findLibrary**

``` java
public final class DexPathList {
    ... ...
    public String findLibrary(String libraryName) {
        // 见 1.1.4 mapLibraryName
        String fileName = System.mapLibraryName(libraryName);
        for (NativeLibraryElement element : nativeLibraryPathElements) {
            // 见 1.1.5 findNativeLibrary
            String path = element.findNativeLibrary(fileName);
            if (path != null) {
                return path;
            }
        }
        return null;
    }
```

遍历 nativeLibraryPathElements ，从所有的动态库查询是否存在匹配的动态库，nativeLibraryPathElements 取值：

- /data/app/packagename-xyz/lib/arm64:/data/app/packagename-xyz==/base.apk!/lib/arm64-v8a
- /vendor/lib64
- /system/lib64

##### 1.1.4 mapLibraryName

[libcore/ojluni/src/main/native/System.c](https://android.googlesource.com/platform/libcore/+/refs/tags/android-10.0.0_r6/ojluni/src/main/native/System.c)

``` c
static void cpchars(jchar *dst, char *src, int n)
{
    int i;
    for (i = 0; i < n; i++) {
        dst[i] = src[i];
    }
}

JNIEXPORT jstring JNICALL
System_mapLibraryName(JNIEnv *env, jclass ign, jstring libname)
{
    int len;
    // 在libcore/ojluni/src/main/native/jvm_md.h中定义：
    // #define JNI_LIB_PREFIX "lib"
    // #define JNI_LIB_SUFFIX ".so"
    int prefix_len = (int) strlen(JNI_LIB_PREFIX);
    int suffix_len = (int) strlen(JNI_LIB_SUFFIX);
    jchar chars[256];
    if (libname == NULL) {
        JNU_ThrowNullPointerException(env, 0);
        return NULL;
    }
    len = (*env)->GetStringLength(env, libname);
    if (len > 240) {
        JNU_ThrowIllegalArgumentException(env, "name too long");
        return NULL;
    }
    cpchars(chars, JNI_LIB_PREFIX, prefix_len);// chars = "lib"
    (*env)->GetStringRegion(env, libname, 0, len, chars + prefix_len);// chars = "lib"<libname>
    len += prefix_len;
    cpchars(chars + len, JNI_LIB_SUFFIX, suffix_len);// chars = "lib"<libname>".so"
    len += suffix_len;
    return (*env)->NewString(env, chars, len);
}
```

可见 mapLibraryName 的作用就是给 libname 加上 "lib" 前缀和 ".so" 后缀。

##### 1.1.5 findNativeLibrary

[libcore/dalvik/src/main/java/dalvik/system/DexPathList.java](https://android.googlesource.com/platform/libcore/+/refs/tags/android-10.0.0_r6/dalvik/src/main/java/dalvik/system/DexPathList.java)

``` java
public final class DexPathList {
... ...
    /*package*/ static class NativeLibraryElement {
        ... ...
        public String findNativeLibrary(String name) {
            maybeInit();

            if (zipDir == null) {
                String entryPath = new File(path, name).getPath();
                if (IoUtils.canOpenReadOnly(entryPath)) {
                    return entryPath;
                }
            } else if (urlHandler != null) {
                // Having a urlHandler means the element has a zip file.
                // In this case Android supports loading the library iff
                // it is stored in the zip uncompressed.
                String entryName = zipDir + '/' + name;
                if (urlHandler.isEntryStored(entryName)) {
                  return path.getPath() + zipSeparator + entryName;
                }
            }

            return null;
        }
```

在Element 中查找对应的动态库。

#### 1.2 nativeLoad

[libcore/ojluni/src/main/java/java/lang/Runtime.java](https://android.googlesource.com/platform/libcore/+/refs/tags/android-10.0.0_r6/ojluni/src/main/java/java/lang/Runtime.java) 

找到 so 后就开始加载 so 了，通过 nativeLoad 方法实现：

``` java
    private static String nativeLoad(String filename, ClassLoader loader) {
        return nativeLoad(filename, loader, null);
    }
    // 调用 native 方法
    private static native String nativeLoad(String filename, ClassLoader loader, Class<?> caller);
```

java 层的 nativeLoad 对应 c 层的 Runtime_nativeLoad 方法：

[libcore/ojluni/src/main/native/System.c](https://android.googlesource.com/platform/libcore/+/refs/tags/android-10.0.0_r6/ojluni/src/main/native/System.c)

``` c
#define NATIVE_METHOD(className, functionName, signature) \
{ #functionName, signature, (void*)(className ## _ ## functionName) }
```

[libcore/ojluni/src/main/native/Runtime.c](https://android.googlesource.com/platform/libcore/+/refs/tags/android-10.0.0_r6/ojluni/src/main/native/Runtime.c)

``` c

JNIEXPORT jstring JNICALL
Runtime_nativeLoad(JNIEnv* env, jclass ignored, jstring javaFilename,
                   jobject javaLoader, jclass caller)
{
    return JVM_NativeLoad(env, javaFilename, javaLoader, caller);
}
static JNINativeMethod gMethods[] = {
  FAST_NATIVE_METHOD(Runtime, freeMemory, "()J"),
  FAST_NATIVE_METHOD(Runtime, totalMemory, "()J"),
  FAST_NATIVE_METHOD(Runtime, maxMemory, "()J"),
  NATIVE_METHOD(Runtime, nativeGc, "()V"),
  NATIVE_METHOD(Runtime, nativeExit, "(I)V"),
  NATIVE_METHOD(Runtime, nativeLoad,
                "(Ljava/lang/String;Ljava/lang/ClassLoader;Ljava/lang/Class;)"
                    "Ljava/lang/String;"),
  // 根据 System.c 中NATIVE_METHOD 的宏定义，相当于如下写法：
  // {"nativeLoad", "(Ljava/lang/String;Ljava/lang/ClassLoader;)"
  //                  "Ljava/lang/String;", (void*)Runtime_nativeLoad}
};

void register_java_lang_Runtime(JNIEnv* env) {
  jniRegisterNativeMethods(env, "java/lang/Runtime", gMethods, NELEM(gMethods));
}
```

可以看到 Runtime_nativeLoad 调用了 JVM_NativeLoad 方法，

[art/openjdkjvm/OpenjdkJvm.cc](https://android.googlesource.com/platform/art/+/refs/tags/android-10.0.0_r6/openjdkjvm/OpenjdkJvm.cc)

``` c
JNIEXPORT jstring JVM_NativeLoad(JNIEnv* env,
                                 jstring javaFilename,
                                 jobject javaLoader,
                                 jclass caller) {
  ScopedUtfChars filename(env, javaFilename);
  if (filename.c_str() == nullptr) {
    return nullptr;
  }
  std::string error_msg;
  {
    art::JavaVMExt* vm = art::Runtime::Current()->GetJavaVM();
    // 真正加载 so 的地方
    bool success = vm->LoadNativeLibrary(env,
                                         filename.c_str(),
                                         javaLoader,
                                         caller,
                                         &error_msg);
    if (success) {
      return nullptr;
    }
  }
  // Don't let a pending exception from JNI_OnLoad cause a CheckJNI issue with NewStringUTF.
  env->ExceptionClear();
  return env->NewStringUTF(error_msg.c_str());
}
```

真正加载 so 的方法是 LoadNativeLibrary 。

#### 1.3 LoadNativeLibrary

[art/runtime/jni/java_vm_ext.cc](https://android.googlesource.com/platform/art/+/refs/tags/android-10.0.0_r6/runtime/jni/java_vm_ext.cc)

``` c
bool JavaVMExt::LoadNativeLibrary(JNIEnv* env,
                                  const std::string& path,
                                  jobject class_loader,
                                  jclass caller_class,
                                  std::string* error_msg) {
  error_msg->clear();
  // See if we've already loaded this library.  If we have, and the class loader
  // matches, return successfully without doing anything.
  // 判断是否已经加载过这个库，如果加载过直接返回
  SharedLibrary* library;
  Thread* self = Thread::Current();
  {
    // TODO: move the locking (and more of this logic) into Libraries.
    MutexLock mu(self, *Locks::jni_libraries_lock_);
    library = libraries_->Get(path);
  }
  ... ...
  // Open the shared library.  Because we're using a full path, the system
  // doesn't have to search through LD_LIBRARY_PATH.  (It may do so to
  // resolve this library's dependencies though.)
  // Failures here are expected when java.library.path has several entries
  // and we have to hunt for the lib.
  // Below we dlopen but there is no paired dlclose, this would be necessary if we supported
  // class unloading. Libraries will only be unloaded when the reference count (incremented by
  // dlopen) becomes zero from dlclose.
  // Retrieve the library path from the classloader, if necessary.
  ScopedLocalRef<jstring> library_path(env, GetLibrarySearchPath(env, class_loader));
  Locks::mutator_lock_->AssertNotHeld(self);
  const char* path_str = path.empty() ? nullptr : path.c_str();
  bool needs_native_bridge = false;
  char* nativeloader_error_msg = nullptr;
  // 通过 OpenNativeLibrary 加载，旧版本中通过 dlopen
  void* handle = android::OpenNativeLibrary(
      env,
      runtime_->GetTargetSdkVersion(),
      path_str,
      class_loader,
      (caller_location.empty() ? nullptr : caller_location.c_str()),
      library_path.get(),
      &needs_native_bridge,
      &nativeloader_error_msg);
  VLOG(jni) << "[Call to dlopen(\"" << path << "\", RTLD_NOW) returned " << handle << "]";
  if (handle == nullptr) {
    // 加载失败
    *error_msg = nativeloader_error_msg;
    android::NativeLoaderFreeErrorMessage(nativeloader_error_msg);
    VLOG(jni) << "dlopen(\"" << path << "\", RTLD_NOW) failed: " << *error_msg;
    return false;
  }
  if (env->ExceptionCheck() == JNI_TRUE) {
    LOG(ERROR) << "Unexpected exception:";
    env->ExceptionDescribe();
    env->ExceptionClear();
  }
  ... ...
  // Create a new entry.
  // TODO: move the locking (and more of this logic) into Libraries.
  bool created_library = false;
  {
    // Create SharedLibrary ahead of taking the libraries lock to maintain lock ordering.
    std::unique_ptr<SharedLibrary> new_library(
        new SharedLibrary(env,
                          self,
                          path,
                          handle,
                          needs_native_bridge,
                          class_loader,
                          class_loader_allocator));
    MutexLock mu(self, *Locks::jni_libraries_lock_);
    library = libraries_->Get(path);
    if (library == nullptr) {  // We won race to get libraries_lock.
      library = new_library.release();
      libraries_->Put(path, library);
      created_library = true;
    }
  }
  ... ...
  bool was_successful = false;
  void* sym = library->FindSymbol("JNI_OnLoad", nullptr);
  if (sym == nullptr) {
    VLOG(jni) << "[No JNI_OnLoad found in \"" << path << "\"]";
    was_successful = true;
  } else {
    // Call JNI_OnLoad.  We have to override the current class
    // loader, which will always be "null" since the stuff at the
    // top of the stack is around Runtime.loadLibrary().  (See
    // the comments in the JNI FindClass function.)
    ScopedLocalRef<jobject> old_class_loader(env, env->NewLocalRef(self->GetClassLoaderOverride()));
    self->SetClassLoaderOverride(class_loader);
    VLOG(jni) << "[Calling JNI_OnLoad in \"" << path << "\"]";
    using JNI_OnLoadFn = int(*)(JavaVM*, void*);
    JNI_OnLoadFn jni_on_load = reinterpret_cast<JNI_OnLoadFn>(sym);
    int version = (*jni_on_load)(this, nullptr);
    if (IsSdkVersionSetAndAtMost(runtime_->GetTargetSdkVersion(), SdkVersion::kL)) {
      // Make sure that sigchain owns SIGSEGV.
      EnsureFrontOfChain(SIGSEGV);
    }
    self->SetClassLoaderOverride(old_class_loader.get());
    if (version == JNI_ERR) {
      StringAppendF(error_msg, "JNI_ERR returned from JNI_OnLoad in \"%s\"", path.c_str());
    } else if (JavaVMExt::IsBadJniVersion(version)) {
      StringAppendF(error_msg, "Bad JNI version returned from JNI_OnLoad in \"%s\": %d",
                    path.c_str(), version);
      // It's unwise to call dlclose() here, but we can mark it
      // as bad and ensure that future load attempts will fail.
      // We don't know how far JNI_OnLoad got, so there could
      // be some partially-initialized stuff accessible through
      // newly-registered native method calls.  We could try to
      // unregister them, but that doesn't seem worthwhile.
    } else {
      was_successful = true;
    }
    VLOG(jni) << "[Returned " << (was_successful ? "successfully" : "failure")
              << " from JNI_OnLoad in \"" << path << "\"]";
  }
  library->SetResult(was_successful);
  return was_successful;
}
```

最终会通过 OpenNativeLibrary 加载 so 库，随后会判断 JNI_OnLoad 方法是否存在，存在则调用其方法，所以做 JNI 开发时要实现 JNI_OnLoad 方法来做一些初始化的操作。

主要工作：

- 检查动态库是否已加载，如果已加载则直接返回；
- 通过 OpenNativeLibrary 打开 so 库；
- 创建 SharedLibrary 共享库，并添加到 libraries_ 列表；
- 调用 JNI_OnLoad 方法；

**OpenNativeLibrary**

[system/core/libnativeloader/native_loader.cpp](https://android.googlesource.com/platform/system/core/+/refs/tags/android-10.0.0_r6/libnativeloader/native_loader.cpp)

``` cpp
void* OpenNativeLibrary(JNIEnv* env, int32_t target_sdk_version, const char* path,
                        jobject class_loader, const char* caller_location, jstring library_path,
                        bool* needs_native_bridge, char** error_msg) {
#if defined(__ANDROID__)
  UNUSED(target_sdk_version);
  if (class_loader == nullptr) {
    *needs_native_bridge = false;
    if (caller_location != nullptr) {
      android_namespace_t* boot_namespace = FindExportedNamespace(caller_location);
      if (boot_namespace != nullptr) {
        const android_dlextinfo dlextinfo = {
            .flags = ANDROID_DLEXT_USE_NAMESPACE,
            .library_namespace = boot_namespace,
        };
        void* handle = android_dlopen_ext(path, RTLD_NOW, &dlextinfo);
        if (handle == nullptr) {
          *error_msg = strdup(dlerror());
        }
        return handle;
      }
    }
    void* handle = dlopen(path, RTLD_NOW);
    if (handle == nullptr) {
      *error_msg = strdup(dlerror());
    }
    return handle;
  }
  std::lock_guard<std::mutex> guard(g_namespaces_mutex);
  NativeLoaderNamespace* ns;
  if ((ns = g_namespaces->FindNamespaceByClassLoader(env, class_loader)) == nullptr) {
    // This is the case where the classloader was not created by ApplicationLoaders
    // In this case we create an isolated not-shared namespace for it.
    std::string create_error_msg;
    if ((ns = g_namespaces->Create(env, target_sdk_version, class_loader, false /* is_shared */,
                                   nullptr, library_path, nullptr, &create_error_msg)) == nullptr) {
      *error_msg = strdup(create_error_msg.c_str());
      return nullptr;
    }
  }
  return OpenNativeLibraryInNamespace(ns, path, needs_native_bridge, error_msg);
#else
  UNUSED(env, target_sdk_version, class_loader, caller_location);
  // Do some best effort to emulate library-path support. It will not
  // work for dependencies.
  //
  // Note: null has a special meaning and must be preserved.
  std::string c_library_path;  // Empty string by default.
  if (library_path != nullptr && path != nullptr && path[0] != '/') {
    ScopedUtfChars library_path_utf_chars(env, library_path);
    c_library_path = library_path_utf_chars.c_str();
  }
  std::vector<std::string> library_paths = base::Split(c_library_path, ":");
  for (const std::string& lib_path : library_paths) {
    *needs_native_bridge = false;
    const char* path_arg;
    std::string complete_path;
    if (path == nullptr) {
      // Preserve null.
      path_arg = nullptr;
    } else {
      complete_path = lib_path;
      if (!complete_path.empty()) {
        complete_path.append("/");
      }
      complete_path.append(path);
      path_arg = complete_path.c_str();
    }
    void* handle = dlopen(path_arg, RTLD_NOW);
    if (handle != nullptr) {
      return handle;
    }
    if (NativeBridgeIsSupported(path_arg)) {
      *needs_native_bridge = true;
      handle = NativeBridgeLoadLibrary(path_arg, RTLD_NOW);
      if (handle != nullptr) {
        return handle;
      }
      *error_msg = strdup(NativeBridgeGetError());
    } else {
      *error_msg = strdup(dlerror());
    }
  }
  return nullptr;
#endif
}
```

Android 7.0 开始，禁止加载非NDK库，也就是说系统禁止了应用去链接系统的私有库，它通过名字空间的方式来实现其方法。所以就看到了，我们加载 so 的时候是用 OpenNativeLibrary 方法，而不是以往的 dlopen 方法。





参考：

http://gityuan.com/2016/05/28/android-jni/

http://gityuan.com/2017/03/26/load_library/

https://blog.csdn.net/QQxiaoqiang1573/article/details/101781380