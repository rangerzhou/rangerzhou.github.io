---
title: Android 7.0 PackageManagerService源码分析
date: 2017-06-26 13:56:01
tags:
categories: "Frameworks"
copyright: true
---

********************占位符*****************

## 一、PKMS的启动、main函数解析

此部分待补充

## 二、PKMS构造函数解析

此部分待补充

## 三、APK安装

<!--more-->

本部分开始分析APK的安装及相关处理流程，APK有多种安装方式，我们从adb install开始分析。

### 1. adb install 分析#

​	adb install 有多个参数，在此仅考虑最简单的`adb install ***.apk`，adb是命令，install是参数，处理install参数的代码:

/[system](http://androidxref.com/7.1.1_r6/xref/system/)/[core](http://androidxref.com/7.1.1_r6/xref/system/core/)/[adb](http://androidxref.com/7.1.1_r6/xref/system/core/adb/)/[commandline.cpp](http://androidxref.com/7.1.1_r6/xref/system/core/adb/commandline.cpp)

``` c++
... ...
static bool _use_legacy_install() {
    // 判断Feature是否可用
    FeatureSet features;
    std::string error;
    if (!adb_get_feature_set(&features, &error)) {
        fprintf(stderr, "error: %s\n", error.c_str());
        return true;
    }
    return !CanUseFeature(features, kFeatureCmd);
}

int adb_commandline(int argc, const char **argv) {
  ... ...
    else if (!strcmp(argv[0], "install")) {
        if (argc < 2) return usage();
        if (_use_legacy_install()) {
            // 如果不能使用Feature，则使用传统方式安装
            return install_app_legacy(transport_type, serial, argc, argv);
        }
        // 可以使用Feature时，使用如下方式安装
        return install_app(transport_type, serial, argc, argv);
    }
  ... ...
}
```

#### 1.1 install_app

``` c++
static int install_app(TransportType transport, const char* serial, int argc, const char** argv) {
    // The last argument must be the APK file
    const char* file = argv[argc - 1];// 利用参数创建出本地文件的名称

    // 判断adb命令中是否存在有效的apk文件名
    const char* dot = strrchr(file, '.');// 查找'.'在file中末次出现的位置，返回从'.'开始到结束的字符
    bool found_apk = false;
    struct stat sb;
    if (dot && !strcasecmp(dot, ".apk")) {// 如果dot不等于null并且等于".apk"
        if (stat(file, &sb) == -1 || !S_ISREG(sb.st_mode)) {
            fprintf(stderr, "Invalid APK file: %s\n", file);
            return EXIT_FAILURE;
        }
        found_apk = true;
    }

    if (!found_apk) {
        fprintf(stderr, "Missing APK file\n");
        return EXIT_FAILURE;
    }

    // adb_open将根据file创建出对应的文件
    int localFd = adb_open(file, O_RDONLY);
    if (localFd < 0) {
        fprintf(stderr, "Failed to open %s: %s\n", file, strerror(errno));
        return 1;
    }

    std::string error;
    std::string cmd = "exec:cmd package";

    // 添加cmd参数
    // don't copy the APK name, but, copy the rest of the arguments as-is
    while (argc-- > 1) {
        cmd += " " + escape_arg(std::string(*argv++));
    }

    // add size parameter [required for streaming installs]
    // do last to override any user specified value
    cmd += " " + android::base::StringPrintf("-S %" PRIu64, static_cast<uint64_t>(sb.st_size));

    // 连接源端，获取APK文件的描述符
    int remoteFd = adb_connect(cmd, &error);
    if (remoteFd < 0) {
        fprintf(stderr, "Connect error for write: %s\n", error.c_str());
        adb_close(localFd);
        return 1;
    }

    char buf[BUFSIZ];
    copy_to_file(localFd, remoteFd);// 将remoteFd中的数据写入到上面创建的localFd中
    read_status_line(remoteFd, buf, sizeof(buf));

    adb_close(localFd);
    adb_close(remoteFd);

    if (strncmp("Success", buf, 7)) {
        fprintf(stderr, "Failed to install %s: %s", file, buf);
        return 1;
    }
    fputs(buf, stderr);
    return 0;
}
```

从代码中了解`install_app`就是将源机器中的文件copy到了目的机器（手机）中，可能是因为这个支持Feature的流程PKMS能够监听到这个copy，接下来继续看传统的安装方式`install_app_legacy`。

#### 1.2 install_app_legacy

``` c++
static int install_app_legacy(TransportType transport, const char* serial, int argc, const char** argv) {
    // 要安装的APK还在源机器上，要先把APK复制到手机
    // 设置复制目标的目录，如果安装在手机内部存储，则目标目录为/data/local/tmp
    // 如果安装在SD卡上，则目标目录为/sdcard/tmp
    static const char *const DATA_DEST = "/data/local/tmp/%s";
    static const char *const SD_DEST = "/sdcard/tmp/%s";
    const char* where = DATA_DEST;// 默认安装到手机内部
    int i;
    struct stat sb;

    for (i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "-s")) {
            // 如果参数中带'-s'，则安装到SD卡
            where = SD_DEST;
        }
    }

    // Find last APK argument.
    // All other arguments passed through verbatim.
    //解析最后一个参数，判断adb命令中是否携带有效的apk文件名
    int last_apk = -1;
    for (i = argc - 1; i >= 0; i--) {
        const char* file = argv[i];
        const char* dot = strrchr(file, '.');
        if (dot && !strcasecmp(dot, ".apk")) {
            if (stat(file, &sb) == -1 || !S_ISREG(sb.st_mode)) {
                fprintf(stderr, "Invalid APK file: %s\n", file);
                return EXIT_FAILURE;
            }

            last_apk = i;
            break;
        }
    }

    if (last_apk == -1) {
        fprintf(stderr, "Missing APK file\n");
        return EXIT_FAILURE;
    }

    int result = -1;
    std::vector<const char*> apk_file = {argv[last_apk]};// 取出apk名
    std::string apk_dest = android::base::StringPrintf(
        where, adb_basename(argv[last_apk]).c_str());// 构造apk目的地址
    // do_sync_push将APK文件传输到手机目标路基，失败的话跳转到cleanup_apk
    if (!do_sync_push(apk_file, apk_dest.c_str())) goto cleanup_apk;
    argv[last_apk] = apk_dest.c_str(); /* destination name, not source location */
    result = pm_command(transport, serial, argc, argv);// 

cleanup_apk:
    // 删除传输失败的文件
    // PKMS在安装过程中会将APK复制一份到/data/app目录下，所以/data/local/tmp目录下的对应文件可以删除
    delete_file(transport, serial, apk_dest);
    return result;
}
```

从代码中看出`install_app_legacy`就是将源机器中的APK文件传输到目的手机的tmp目录下，然后调用pm_command进行处理。

#### 1.3 pm_command

``` c++
static int pm_command(TransportType transport, const char* serial, int argc, const char** argv) {
    std::string cmd = "pm";

    while (argc-- > 0) {
        // 根据参数argv构造pm命令
        cmd += " " + escape_arg(*argv++);
    }

    // 向adbd发送shell命令
    // 手机端的adbd在收到客户端发来的shell pm命令时会启动一个shell，然后在其中执行pm
    return send_shell_command(transport, serial, cmd, false);
}
... ...
int send_shell_command(TransportType transport_type, const char* serial, const std::string& command, bool disable_shell_protocol, StandardStreamsCallbackInterface* callback) {
    int fd;
    bool use_shell_protocol = false;

    while (true) {
        bool attempt_connection = true;

        // Use shell protocol if it's supported and the caller doesn't explicitly
        // disable it.
        // 如果支持shell协议，并且调用者没有明确禁用它，则使用shell协议
        if (!disable_shell_protocol) {
            FeatureSet features;
            std::string error;
            if (adb_get_feature_set(&features, &error)) {
                // 如果定义了Feature，则使用shell协议
                use_shell_protocol = CanUseFeature(features, kFeatureShell2);
            } else {
                // Device was unreachable.
                attempt_connection = false;
            }
        }

        if (attempt_connection) {
            std::string error;
            // command已是pm开头的命令
            std::string service_string = ShellServiceString(use_shell_protocol, "", command);

            // 向shell服务发送命令
            fd = adb_connect(service_string, &error);
            if (fd >= 0) {
                break;
            }
        }

        fprintf(stderr, "- waiting for device -\n");
        if (!wait_for_device("wait-for-device", transport_type, serial)) {
            return 1;
        }
    }

    int exit_code = read_and_dump(fd, use_shell_protocol, callback);

    if (adb_close(fd) < 0) {
        PLOG(ERROR) << "failure closing FD " << fd;
    }

    return exit_code;
}
```

从代码可知，pm_command就是向shell服务发送pm命令。

pm实际上是一个脚本，定义在[/frameworks/base/cmds/pm/](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/) 中：

``` shell
# Script to start "pm" on the device, which has a very rudimentary
# shell.
#
base=/system
export CLASSPATH=$base/framework/pm.jar
exec app_process $base/bin com.android.commands.pm.Pm "$@"
# $@ 表示传给脚本的所有参数的列表
```

在编译system.img时，[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[cmds](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/)/[Android.mk](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/Android.mk) 中会将该脚本复制到`system/bin`目录下。从脚本内容来看，首先export pm.jar到环境变量，然后通过app_process去执行pm.jar包中的main函数并将参数传给main函数，即/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[cmds](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/)/[src](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/)/[commands](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/)/[Pm.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/Pm.java) 中的main函数，根据不同参数处理不同事件。app_process是一个native进程，它通过创建虚拟机启动了Zygote，从而转变为一个Java进程，接下来我们看如何从执行pm脚本到启动Java进程。

app_process参数格式如下：

``` shell
app_process [vm-options] cmd-dir [options] start-class-name [main-options]
```

- vm-options：虚拟机选项参数
- cmd-dir：当前未使用的父目录（如上述/system/bin），文件操作的父路径将为此路径
- options：
  - --zygote：以zygote模式开始
  - --start-system-server：启动System Server
  - --application：以应用模式（独立，非zygote）开始
  - --nice-name：这个进程的名字（应该是启动后的正式名字吧？）
- start-class-name：包含main方法的主类
- main-options：对于非zygote开始的，options参数后面跟着主类名称，所有剩余的参数传递给这个类的main方法，对于zygote开始的，所有剩余参数都将传递给zygote

首先看/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[cmds](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/)/[app_process](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/app_process/)/[app_main.cpp](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/app_process/app_main.cpp) 的main函数：

``` java
int main(int argc, char* const argv[])
{
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) < 0) {
        // Older kernels don't understand PR_SET_NO_NEW_PRIVS and return
        // EINVAL. Don't die on such kernels.
        if (errno != EINVAL) {
            LOG_ALWAYS_FATAL("PR_SET_NO_NEW_PRIVS failed: %s", strerror(errno));
            return 12;
        }
    }
    AppRuntime runtime(argv[0], computeArgBlockSize(argc, argv));
    // Process command line arguments
    // ignore argv[0]（argv[0]应该就是指app_process吧）
    argc--;
    argv++;
    // Everything up to '--' or first non '-' arg goes to the vm.
    // 把'--'开头之前的参数，或者第一个非'-'开头的参数传递给虚拟机
    //
    // The first argument after the VM args is the "parent dir", which
    // is currently unused.
    // 虚拟机参数之后的第一个参数是当前未使用的“父目录”
    //
    // After the parent dir, we expect one or more the following internal
    // arguments :
    //
    // --zygote : Start in zygote mode
    // --start-system-server : Start the system server.
    // --application : Start in application (stand alone, non zygote) mode.
    // --nice-name : The nice name for this process.
    //
    // For non zygote starts, these arguments will be followed by
    // the main class name. All remaining arguments are passed to
    // the main method of this class.
    // 对于非zygote开始的，这些参数后面跟着主类名称，所有剩余的参数传递给这个类的main方法
    //
    // For zygote starts, all remaining arguments are passed to the zygote.
    // main function.
    // 对于zygote开始的，所有剩余参数都将传递给zygote
    //
    // Note that we must copy argument string values since we will rewrite the
    // entire argument block when we apply the nice name to argv0.
    // 请注意，我们必须复制参数字符串值，因为当我们将nice名称应用于argv0（app_process？）时，我们将重写
    // 整个参数块。
    int i;
    for (i = 0; i < argc; i++) {
        if (argv[i][0] != '-') {
            break;// 不是以'-'开头，跳出循环
        }
        if (argv[i][1] == '-' && argv[i][2] == 0) {
            ++i; // Skip --.
            break;
        }
        runtime.addOption(strdup(argv[i]));
    }
    // Parse runtime arguments.  Stop at first unrecognized option.
    bool zygote = false;
    bool startSystemServer = false;
    bool application = false;
    String8 niceName;
    String8 className;
    ++i;  // Skip unused "parent dir" argument.
    while (i < argc) {
        const char* arg = argv[i++];
        if (strcmp(arg, "--zygote") == 0) {
            zygote = true;
            niceName = ZYGOTE_NICE_NAME;
        } else if (strcmp(arg, "--start-system-server") == 0) {
            startSystemServer = true;
        } else if (strcmp(arg, "--application") == 0) {
            application = true;
        } else if (strncmp(arg, "--nice-name=", 12) == 0) {
            niceName.setTo(arg + 12);
        } else if (strncmp(arg, "--", 2) != 0) {
            // 如果arg的前2个字符不为"--"，进入该条件分支设置className
            className.setTo(arg);
            break;
        } else {
            --i;
            break;
        }
    }
    ... ...
    }
    ... ...
    if (zygote) {
        runtime.start("com.android.internal.os.ZygoteInit", args, zygote);
    } else if (className) {
        // 不是启动zygote，而是启动className对应的类RuntimeInit
        runtime.start("com.android.internal.os.RuntimeInit", args, zygote);
    } else {
        fprintf(stderr, "Error: no class name or --zygote supplied.\n");
        app_usage();
        LOG_ALWAYS_FATAL("app_process: no class name or --zygote supplied.");
        return 10;
    }
}
```



/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/)/[jni](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/jni/)/[AndroidRuntime.cpp](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/jni/AndroidRuntime.cpp) 

``` c++
void AndroidRuntime::start(const char* className, const Vector<String8>& options, bool zygote)
{
    ... ...
    /*
     * Start VM.  This thread becomes the main thread of the VM, and will
     * not return until the VM exits.
     */
    char* slashClassName = toSlashClassName(className);
    jclass startClass = env->FindClass(slashClassName);
    if (startClass == NULL) {
        ALOGE("JavaVM unable to locate class '%s'\n", slashClassName);
        /* keep going */
    } else {
        jmethodID startMeth = env->GetStaticMethodID(startClass, "main",
            "([Ljava/lang/String;)V");
        if (startMeth == NULL) {
            ALOGE("JavaVM unable to find main() in '%s'\n", className);
            /* keep going */
        } else {
            // 反射调用main函数，从native层进入java世界
            env->CallStaticVoidMethod(startClass, startMeth, strArray);

#if 0
            if (env->ExceptionCheck())
                threadExitUncaughtException(env);
#endif
        }
    }
    free(slashClassName);

    ALOGD("Shutting down VM\n");
    if (mJavaVM->DetachCurrentThread() != JNI_OK)
        ALOGW("Warning: unable to detach main thread\n");
    if (mJavaVM->DestroyJavaVM() != 0)
        ALOGW("Warning: VM did not shut down cleanly\n");
}
```

start方法通过反射启动RuntimeInit类，进入到RuntimeInit的main函数：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/android/)/[internal](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/android/internal/)/[os](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/android/internal/os/)/[RuntimeInit.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/android/internal/os/RuntimeInit.java) 

``` java
    public static final void main(String[] argv) {
        enableDdms();
        if (argv.length == 2 && argv[1].equals("application")) {
            if (DEBUG) Slog.d(TAG, "RuntimeInit: Starting application");
            redirectLogStreams();
        } else {
            if (DEBUG) Slog.d(TAG, "RuntimeInit: Starting tool");
        }

        commonInit();// 进行一些常规的初始化工作

        /*
         * Now that we're running in interpreted code, call back into native code
         * to run the system.
         */
        nativeFinishInit();

        if (DEBUG) Slog.d(TAG, "Leaving RuntimeInit!");
    }
```

nativeFinishInit函数如下：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/)/[jni](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/jni/)/[AndroidRuntime.cpp](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/jni/AndroidRuntime.cpp) 

``` c++
static AndroidRuntime* gCurRuntime = NULL;

/*
 * Code written in the Java Programming Language calls here from main().
 * 从用java写的RuntimeInit的main函数调用此处
 */
static void com_android_internal_os_RuntimeInit_nativeFinishInit(JNIEnv* env, jobject clazz)
{
    gCurRuntime->onStarted();
}
```

app_main.cpp中定义的AppRuntime继承AndroidRuntime，实现onStarted函数：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[cmds](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/)/[app_process](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/app_process/)/[app_main.cpp](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/app_process/app_main.cpp) 

``` c++
class AppRuntime : public AndroidRuntime
{
  ... ...
  virtual void onStarted()
    {
        sp<ProcessState> proc = ProcessState::self();
        ALOGV("App process: starting thread pool.\n");
        proc->startThreadPool();

        AndroidRuntime* ar = AndroidRuntime::getRuntime();
        // 调用AndroidRuntime.callMain函数
        ar->callMain(mClassName, mClass, mArgs);

        IPCThreadState::self()->stopProcess();
    }
    ... ...
}
```

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/)/[jni](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/jni/)/[AndroidRuntime.cpp](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/jni/AndroidRuntime.cpp) 

``` c++
status_t AndroidRuntime::callMain(const String8& className, jclass clazz,
    const Vector<String8>& args)
{
    JNIEnv* env;
    jmethodID methodId;

    ALOGD("Calling main entry %s", className.string());

    env = getJNIEnv();
    if (clazz == NULL || env == NULL) {
        return UNKNOWN_ERROR;
    }

    methodId = env->GetStaticMethodID(clazz, "main", "([Ljava/lang/String;)V");
    if (methodId == NULL) {
        ALOGE("ERROR: could not find method %s.main(String[])\n", className.string());
        return UNKNOWN_ERROR;
    }

    /*
     * We want to call main() with a String array with our arguments in it.
     * Create an array and populate it.
     */
    jclass stringClass;
    jobjectArray strArray;

    const size_t numArgs = args.size();
    stringClass = env->FindClass("java/lang/String");
    strArray = env->NewObjectArray(numArgs, stringClass, NULL);

    for (size_t i = 0; i < numArgs; i++) {
        jstring argStr = env->NewStringUTF(args[i].string());
        env->SetObjectArrayElement(strArray, i, argStr);
    }

    // 最后在此处调用Pm.java的main函数
    env->CallStaticVoidMethod(clazz, methodId, strArray);
    return NO_ERROR;
}
```

#### 1.4 Pm.java流程

进入Pm.java的main函数：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[cmds](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/)/[src](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/)/[commands](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/)/[Pm.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/Pm.java)

``` java
    private String[] mArgs;
    IPackageInstaller mInstaller;
    public static void main(String[] args) {
        int exitCode = 1;
        try {
            exitCode = new Pm().run(args); // 调用run方法
        } catch (Exception e) {
            Log.e(TAG, "Error", e);
            System.err.println("Error: " + e);
            if (e instanceof RemoteException) {
                System.err.println(PM_NOT_RUNNING_ERR);
            }
        }
        System.exit(exitCode);
    }

    public int run(String[] args) throws RemoteException {
        boolean validCommand = false;
        if (args.length < 1) {
            // 如果没有参数，则显示命令用法
            return showUsage();
        }
        mAm = IAccountManager.Stub.asInterface(ServiceManager.getService(Context.ACCOUNT_SERVICE));
        mUm = IUserManager.Stub.asInterface(ServiceManager.getService(Context.USER_SERVICE));
        // 利用Binder通信，得到PKMS服务端代理
        mPm = IPackageManager.Stub.asInterface(ServiceManager.getService("package"));

        if (mPm == null) {
            System.err.println(PM_NOT_RUNNING_ERR);
            return 1;
        }
        mInstaller = mPm.getPackageInstaller();

        mArgs = args;
        String op = args[0];
        mNextArg = 1;

        if ("list".equals(op)) {
            return runList();
        }

        if ("path".equals(op)) {
            return runPath();
        }
      ... ...
        if ("install".equals(op)) {
            // 这里我们是安装，则调用runInstall
            return runInstall();
        }
      ... ...
        if ("uninstall".equals(op)) {
            // 如果是卸载则调用runUnistall
            return runUninstall();
        }
      ... ...
    }
```

接下来看runInstall函数：

``` java
    /*
     * Keep this around to support existing users of the "pm install" command that may not be
     * able to be updated [or, at least informed the API has changed] such as ddmlib.
     *
     * Moving the implementation of "pm install" to "cmd package install" changes the executing
     * context. Instead of being a stand alone process, "cmd package install" runs in the
     * system_server process. Due to SELinux rules, system_server cannot access many directories;
     * one of which being the package install staging directory [/data/local/tmp].
     *
     * The use of "adb install" or "cmd package install" over "pm install" is highly encouraged.
     */
    private int runInstall() throws RemoteException {
        // 根据install后面的参数创建InstallParams，也包含了SessionParams，标志为MODE_FULL_INSTALL
        // Mode for an install session whose staged APKs should fully replace any existing APKs for the target app.
        final InstallParams params = makeInstallParams();
        // InstallParams之后的参数，就是所要安装的APK文件，即inPath
        final String inPath = nextArg();
        // 是否安装到外置存储
        boolean installExternal =
                (params.sessionParams.installFlags & PackageManager.INSTALL_EXTERNAL) != 0;
        if (params.sessionParams.sizeBytes < 0 && inPath != null) {
            File file = new File(inPath);
            if (file.isFile()) {
                if (installExternal) {
                    try {
                        ApkLite baseApk = PackageParser.parseApkLite(file, 0);
                        PackageLite pkgLite = new PackageLite(null, baseApk, null, null, null);
                        params.sessionParams.setSize(
                                PackageHelper.calculateInstalledSize(pkgLite, false,
                                        params.sessionParams.abiOverride));
                    } catch (PackageParserException | IOException e) {
                        System.err.println("Error: Failed to parse APK file : " + e);
                        return 1;
                    }
                } else {
                    params.sessionParams.setSize(file.length());
                }
            }
        }

        // 1 Create Session
        final int sessionId = doCreateSession(params.sessionParams,
                params.installerPackageName, params.userId);

        try {
            if (inPath == null && params.sessionParams.sizeBytes == 0) {
                System.err.println("Error: must either specify a package size or an APK file");
                return 1;
            }
            // 2 Write Session
            if (doWriteSession(sessionId, inPath, params.sessionParams.sizeBytes, "base.apk",
                    false /*logSuccess*/) != PackageInstaller.STATUS_SUCCESS) {
                return 1;
            }
            // 3 Commit Session
            if (doCommitSession(sessionId, false /*logSuccess*/)
                    != PackageInstaller.STATUS_SUCCESS) {
                return 1;
            }
            // 安装成功打印"Success"
            System.out.println("Success");
            return 0;
        } finally {
            try {
                mInstaller.abandonSession(sessionId);
            } catch (Exception ignore) {
            }
        }
    }
```

从代码中看，runInstall方法主要做了三件事：创建Session，对Session进行写操作，提交Session。接下来看每一步的详细工作：

##### 1.4.1 Create Session

``` java
    private int doCreateSession(SessionParams params, String installerPackageName, int userId)
            throws RemoteException {
        // 通过AMS得到"runInstallCreate"(作为Context对应的字符串)对应的uid
        userId = translateUserId(userId, "runInstallCreate");
        if (userId == UserHandle.USER_ALL) {
            userId = UserHandle.USER_SYSTEM;
            params.installFlags |= PackageManager.INSTALL_ALL_USERS;
        }

        // 通过mInstaller(IPackageInstaller)，即通过PakcageInstallerService创建Session
        final int sessionId = mInstaller.createSession(params, installerPackageName, userId);
        return sessionId;
    }
```

查看PackageInstallerService中的createSession函数：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/)/[PackageInstallerService.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/PackageInstallerService.java)

``` java
    @Override
    public int createSession(SessionParams params, String installerPackageName, int userId) {
        try {
            return createSessionInternal(params, installerPackageName, userId);
        } catch (IOException e) {
            throw ExceptionUtils.wrap(e);
        }
    }

    private int createSessionInternal(SessionParams params, String installerPackageName, int userId) throws IOException {
        final int callingUid = Binder.getCallingUid();
        mPm.enforceCrossUserPermission(callingUid, userId, true, true, "createSession");

        if (mPm.isUserRestricted(userId, UserManager.DISALLOW_INSTALL_APPS)) {
            throw new SecurityException("User restriction prevents installing");
        }

        // 修改SessionParams的installFlags
        if ((callingUid == Process.SHELL_UID) || (callingUid == Process.ROOT_UID)) {
            params.installFlags |= PackageManager.INSTALL_FROM_ADB;

        } else {
            mAppOps.checkPackage(callingUid, installerPackageName);

            params.installFlags &= ~PackageManager.INSTALL_FROM_ADB;
            params.installFlags &= ~PackageManager.INSTALL_ALL_USERS;
            params.installFlags |= PackageManager.INSTALL_REPLACE_EXISTING;
        }

        // Only system components can circumvent runtime permissions when installing.
        if ((params.installFlags & PackageManager.INSTALL_GRANT_RUNTIME_PERMISSIONS) != 0
                && mContext.checkCallingOrSelfPermission(Manifest.permission
                .INSTALL_GRANT_RUNTIME_PERMISSIONS) == PackageManager.PERMISSION_DENIED) {
            throw new SecurityException("You need the "
                    + "android.permission.INSTALL_GRANT_RUNTIME_PERMISSIONS permission "
                    + "to use the PackageManager.INSTALL_GRANT_RUNTIME_PERMISSIONS flag");
        }

        // Defensively resize giant app icons
        // 调整app图标大小
        if (params.appIcon != null) {
            final ActivityManager am = (ActivityManager) mContext.getSystemService(
                    Context.ACTIVITY_SERVICE);
            final int iconSize = am.getLauncherLargeIconSize();
            if ((params.appIcon.getWidth() > iconSize * 2)
                    || (params.appIcon.getHeight() > iconSize * 2)) {
                params.appIcon = Bitmap.createScaledBitmap(params.appIcon, iconSize, iconSize,
                        true);
            }
        }

        switch (params.mode) {
            case SessionParams.MODE_FULL_INSTALL:
            case SessionParams.MODE_INHERIT_EXISTING:
                break;
            default:
                throw new IllegalArgumentException("Invalid install mode: " + params.mode);
        }

        // If caller requested explicit location, sanity check it, otherwise
        // resolve the best internal or adopted location.
        // 根据SessionParams的installFlags进行一些操作
        if ((params.installFlags & PackageManager.INSTALL_INTERNAL) != 0) {
            if (!PackageHelper.fitsOnInternal(mContext, params.sizeBytes)) {
                throw new IOException("No suitable internal storage available");
            }

        } else if ((params.installFlags & PackageManager.INSTALL_EXTERNAL) != 0) {
            if (!PackageHelper.fitsOnExternal(mContext, params.sizeBytes)) {
                throw new IOException("No suitable external storage available");
            }

        } else if ((params.installFlags & PackageManager.INSTALL_FORCE_VOLUME_UUID) != 0) {
            // For now, installs to adopted media are treated as internal from
            // an install flag point-of-view.
            params.setInstallFlagsInternal();

        } else {
            // 通过adb安装会进入到这个分支，为SessionParams设置InstallInternal Flag
            // For now, installs to adopted media are treated as internal from
            // an install flag point-of-view.
            params.setInstallFlagsInternal();

            // Resolve best location for install, based on combination of
            // requested install flags, delta size, and manifest settings.
            final long ident = Binder.clearCallingIdentity();
            try {
                params.volumeUuid = PackageHelper.resolveInstallVolume(mContext,
                        params.appPackageName, params.installLocation, params.sizeBytes);
            } finally {
                Binder.restoreCallingIdentity(ident);
            }
        }

        final int sessionId;
        final PackageInstallerSession session;
        synchronized (mSessions) {
            // Sanity check that installer isn't going crazy
            // 确保同一个uid没有提交过多的活动Session，MAX_ACTIVE_SESSIONS=1024
            final int activeCount = getSessionCount(mSessions, callingUid);
            if (activeCount >= MAX_ACTIVE_SESSIONS) {
                throw new IllegalStateException(
                        "Too many active sessions for UID " + callingUid);
            }
            // 确保同一个uid没有提交过多的历史Session，MAX_HISTORICAL_SESSIONS=1048576
            final int historicalCount = getSessionCount(mHistoricalSessions, callingUid);
            if (historicalCount >= MAX_HISTORICAL_SESSIONS) {
                throw new IllegalStateException(
                        "Too many historical sessions for UID " + callingUid);
            }

            sessionId = allocateSessionIdLocked();
        }

        final long createdMillis = System.currentTimeMillis();
        // We're staging to exactly one location
        File stageDir = null;
        String stageCid = null;
        // 根据installFlags决定安装目录，默认安装到internal目录下
        if ((params.installFlags & PackageManager.INSTALL_INTERNAL) != 0) {
            final boolean isEphemeral =
                    (params.installFlags & PackageManager.INSTALL_EPHEMERAL) != 0;
            stageDir = buildStageDir(params.volumeUuid, sessionId, isEphemeral);
        } else {
            stageCid = buildExternalStageCid(sessionId);
        }

        session = new PackageInstallerSession(mInternalCallback, mContext, mPm,
                mInstallThread.getLooper(), sessionId, userId, installerPackageName, callingUid,
                params, createdMillis, stageDir, stageCid, false, false);

        synchronized (mSessions) {
            mSessions.put(sessionId, session);
        }

        // 回调通知Session已经create
        mCallbacks.notifySessionCreated(session.sessionId, session.userId);
        // 在mSessionsFile中记录
        writeSessionsAsync();
        return sessionId;
    }
```





