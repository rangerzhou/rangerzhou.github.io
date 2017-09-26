---
title: Android 7.0 PackageManagerService源码分析
date: 2017-06-26 13:56:01
tags:
categories: "Frameworks"
copyright: true
---



PKMS模块分三个部分学习：

- [PKMS的启动、main函数解析]()
- [PKMS构造函数解析]()
- [APK安装](http://rangerzhou.top/2017/06/26/Android%207.0%20PackageManagerService%E6%BA%90%E7%A0%81%E5%88%86%E6%9E%90/)

本文开始分析APK的安装及PKMS在这个流程中所做工作，APK有多种安装方式，我们从adb install开始分析。

<!--more-->

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

### 2. pm_command

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

### 3. Pm.java流程

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
        // getPackageInstaller()在PKMS中实现，返回的是final PackageInstallerService mInstallerService;
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

从代码中看，runInstall方法主要做了三件事：创建Session、对Session进行写操作以及提交Session，接下来看每一步的详细工作。

#### 3.1 Create Session

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[cmds](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/)/[src](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/)/[commands](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/)/[Pm.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/Pm.java)

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

从代码中可知creatSession主要工作就是为APK的安装做好准备工作，最终创建出PackageInstallerSession对象，这个对象可以看作是“安装APK”这个请求的封装，其中包含了处理这个请求需要的一些信息。

#### 3.2 Write Session

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[cmds](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/)/[src](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/)/[commands](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/)/[Pm.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/Pm.java)

``` java
    private int doWriteSession(int sessionId, String inPath, long sizeBytes, String splitName,
            boolean logSuccess) throws RemoteException {
        if ("-".equals(inPath)) {
            inPath = null;
        } else if (inPath != null) {
            // file指向待安装的apk文件
            final File file = new File(inPath);
            if (file.isFile()) {
                sizeBytes = file.length();
            }
        }

        final SessionInfo info = mInstaller.getSessionInfo(sessionId);

        PackageInstaller.Session session = null;
        InputStream in = null;
        OutputStream out = null;
        try {
            // 获取PakcageInstallerSession的调用接口
            session = new PackageInstaller.Session(
                    mInstaller.openSession(sessionId));

            if (inPath != null) {
                // 定义输入端，待安装apk对应文件的源地址
                in = new FileInputStream(inPath);
            } else {
                in = new SizedInputStream(System.in, sizeBytes);
            }
            // 定义输出端，对应copy后的目的地址
            out = session.openWrite(splitName, 0, sizeBytes);

            int total = 0;
            byte[] buffer = new byte[65536];
            int c;
            // 开始copy文件
            while ((c = in.read(buffer)) != -1) {
                total += c;
                out.write(buffer, 0, c);

                if (info.sizeBytes > 0) {
                    final float fraction = ((float) c / (float) info.sizeBytes);
                    // 更新copy的进度（c为已copy的，info.sizeBytes为总的）
                    session.addProgress(fraction);
                }
            }
            session.fsync(out);

            if (logSuccess) {
                System.out.println("Success: streamed " + total + " bytes");
            }
            return PackageInstaller.STATUS_SUCCESS;
        } catch (IOException e) {
            System.err.println("Error: failed to write; " + e.getMessage());
            return PackageInstaller.STATUS_FAILURE;
        } finally {
            IoUtils.closeQuietly(out);
            IoUtils.closeQuietly(in);
            IoUtils.closeQuietly(session);
        }
    }
```

从代码看此段代码主要作用是通过Session将源端的数据copy到目的端。

整个执行过程是基于C/S架构的通信工程，PackageInstallerSession是服务端：

``` java
public class PackageInstallerSession extends IPackageInstallerSession.Stub {
```

Pm作为PackageInstallerService的客户端，利用PackageInstallerSession来封装每一次完整的通信过程。

##### 3.2.1 得到PackageInstallerSession的代理对象

在Write Session中通过`session = new PackageInstaller.Session(mInstaller.openSession(sessionId));`获取了PackageInstallerSession的调用接口，PackageInstaller.Session的构造函数如下：

``` java
    public static class Session implements Closeable {
        private IPackageInstallerSession mSession;

        /** {@hide} */
        public Session(IPackageInstallerSession session) {
            mSession = session;
        }
    ... ...
    }
```

传入的参数是`mInstaller.openSession(sessionId)`，mInstaller是在Pm.java中定义的，`IPackageInstaller mInstaller;`，`mInstaller = mPm.getPackageInstaller();`，最终返回的是`final PackageInstallerService mInstallerService;` ，来看一下PackageInstallerService.openSession函数：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/)/[PackageInstallerService.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/PackageInstallerService.java)

``` java
    @Override
    public IPackageInstallerSession openSession(int sessionId) {
        try {
            return openSessionInternal(sessionId);
        } catch (IOException e) {
            throw ExceptionUtils.wrap(e);
        }
    }

    private IPackageInstallerSession openSessionInternal(int sessionId) throws IOException {
        synchronized (mSessions) {
            // 根据sessionId获得PackageInstallerSession
            final PackageInstallerSession session = mSessions.get(sessionId);
            if (session == null || !isCallingUidOwner(session)) {
                throw new SecurityException("Caller has no access to session " + sessionId);
            }
            session.open();
            return session;
        }
    }

    // open函数作用是准备好待copy的目录
    public void open() throws IOException {
        if (mActiveCount.getAndIncrement() == 0) {
            mCallback.onSessionActiveChanged(this, true);
        }

        synchronized (mLock) {
            if (!mPrepared) {
                if (stageDir != null) {
                    prepareStageDir(stageDir);
                } else if (stageCid != null) {
                    final long identity = Binder.clearCallingIdentity();
                    try {
                        prepareExternalStageCid(stageCid, params.sizeBytes);
                    } finally {
                        Binder.restoreCallingIdentity(identity);
                    }

                    // TODO: deliver more granular progress for ASEC allocation
                    mInternalProgress = 0.25f;
                    computeProgressLocked(true);
                } else {
                    throw new IllegalArgumentException(
                            "Exactly one of stageDir or stageCid stage must be set");
                }

                mPrepared = true;
                mCallback.onSessionPrepared(this);
            }
        }
    }
```

##### 3.2.2 定义输出端，得到客户端

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/)/[content](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/content/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/content/pm/)/[PackageInstaller.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/content/pm/PackageInstaller.java)

``` java
        public @NonNull OutputStream openWrite(@NonNull String name, long offsetBytes,
                long lengthBytes) throws IOException {
            try {
                // 调用了mSession(PackageInstallerSession对象)的openWrite方法，发生了Binder通信
                final ParcelFileDescriptor clientSocket = mSession.openWrite(name,
                        offsetBytes, lengthBytes);
                // 此处创建了一个FileBridge对象
                return new FileBridge.FileBridgeOutputStream(clientSocket);
            } catch (RuntimeException e) {
                ExceptionUtils.maybeUnwrapIOException(e);
                throw e;
            } catch (RemoteException e) {
                throw e.rethrowFromSystemServer();
            }
        }
```

实际上就是获得输出流，对应copy后的目的地址，接下来看看PackageInstallerSession的openWrite方法。

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/)/[PackageInstallerSession.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/PackageInstallerSession.java)

``` java
    @Override
    public ParcelFileDescriptor openWrite(String name, long offsetBytes, long lengthBytes) {
        try {
            return openWriteInternal(name, offsetBytes, lengthBytes);
        } catch (IOException e) {
            throw ExceptionUtils.wrap(e);
        }
    }

    private ParcelFileDescriptor openWriteInternal(String name, long offsetBytes, long lengthBytes)
            throws IOException {
        // Quick sanity check of state, and allocate a pipe for ourselves. We
        // then do heavy disk allocation outside the lock, but this open pipe
        // will block any attempted install transitions.
        // FileBridge建立客户端和服务端的管道
        final FileBridge bridge;
        synchronized (mLock) {
            assertPreparedAndNotSealed("openWrite");

            bridge = new FileBridge();
            mBridges.add(bridge);
        }

        try {
            // Use installer provided name for now; we always rename later
            if (!FileUtils.isValidExtFilename(name)) {
                throw new IllegalArgumentException("Invalid name: " + name);
            }
            final File target;
            final long identity = Binder.clearCallingIdentity();
            try {
                target = new File(resolveStageDir(), name);
            } finally {
                Binder.restoreCallingIdentity(identity);
            }

            // TODO: this should delegate to DCS so the system process avoids
            // holding open FDs into containers.
            final FileDescriptor targetFd = Libcore.os.open(target.getAbsolutePath(),
                    O_CREAT | O_WRONLY, 0644);
            Os.chmod(target.getAbsolutePath(), 0644);

            // If caller specified a total length, allocate it for them. Free up
            // cache space to grow, if needed.
            if (lengthBytes > 0) {
                final StructStat stat = Libcore.os.fstat(targetFd);
                final long deltaBytes = lengthBytes - stat.st_size;
                // Only need to free up space when writing to internal stage
                if (stageDir != null && deltaBytes > 0) {
                    mPm.freeStorage(params.volumeUuid, deltaBytes);
                }
                Libcore.os.posix_fallocate(targetFd, 0, lengthBytes);
            }

            if (offsetBytes > 0) {
                Libcore.os.lseek(targetFd, offsetBytes, OsConstants.SEEK_SET);
            }

            bridge.setTargetFile(targetFd);
            bridge.start();
            return new ParcelFileDescriptor(bridge.getClientSocket());

        } catch (ErrnoException e) {
            throw e.rethrowAsIOException();
        }
    }
```

FileBridge到底是什么呢，来看一下FileBridge类：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/)/[os](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/os/)/[FileBridge.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/os/FileBridge.java)

``` java
/**
 * Simple bridge that allows file access across process boundaries without
 * returning the underlying {@link FileDescriptor}. This is useful when the
 * server side needs to strongly assert that a client side is completely
 * hands-off.
 *
 * @hide
 */
public class FileBridge extends Thread {
    private static final String TAG = "FileBridge";

    // TODO: consider extending to support bidirectional IO

    private static final int MSG_LENGTH = 8;

    /** CMD_WRITE [len] [data] */
    private static final int CMD_WRITE = 1;
    /** CMD_FSYNC */
    private static final int CMD_FSYNC = 2;
    /** CMD_CLOSE */
    private static final int CMD_CLOSE = 3;

    private FileDescriptor mTarget;

    private final FileDescriptor mServer = new FileDescriptor();
    private final FileDescriptor mClient = new FileDescriptor();

    private volatile boolean mClosed;

    public FileBridge() {
        try {
            // 构造函数建立的mServer和mClient之间的管道
            Os.socketpair(AF_UNIX, SOCK_STREAM, 0, mServer, mClient);
        } catch (ErrnoException e) {
            throw new RuntimeException("Failed to create bridge");
        }
    }

    public boolean isClosed() {
        return mClosed;
    }

    public void forceClose() {
        IoUtils.closeQuietly(mTarget);
        IoUtils.closeQuietly(mServer);
        IoUtils.closeQuietly(mClient);
        mClosed = true;
    }

    public void setTargetFile(FileDescriptor target) {
        mTarget = target;
    }

    public FileDescriptor getClientSocket() {
        return mClient;
    }

    @Override
    public void run() {
        final byte[] temp = new byte[8192];
        try {
            // mServer和mClient已经通过管道绑定，取出从mClient写入到mServer中的数据并进行处理
            while (IoBridge.read(mServer, temp, 0, MSG_LENGTH) == MSG_LENGTH) {
                final int cmd = Memory.peekInt(temp, 0, ByteOrder.BIG_ENDIAN);
                if (cmd == CMD_WRITE) {
                    // Shuttle data into local file
                    int len = Memory.peekInt(temp, 4, ByteOrder.BIG_ENDIAN);
                    while (len > 0) {
                        int n = IoBridge.read(mServer, temp, 0, Math.min(temp.length, len));
                        if (n == -1) {
                            throw new IOException(
                                    "Unexpected EOF; still expected " + len + " bytes");
                        }
                        IoBridge.write(mTarget, temp, 0, n);
                        len -= n;
                    }

                } else if (cmd == CMD_FSYNC) {
                    // Sync and echo back to confirm
                    Os.fsync(mTarget);
                    IoBridge.write(mServer, temp, 0, MSG_LENGTH);

                } else if (cmd == CMD_CLOSE) {
                    // Close and echo back to confirm
                    Os.fsync(mTarget);
                    Os.close(mTarget);
                    mClosed = true;
                    IoBridge.write(mServer, temp, 0, MSG_LENGTH);
                    break;
                }
            }

        } catch (ErrnoException | IOException e) {
            Log.wtf(TAG, "Failed during bridge", e);
        } finally {
            forceClose(); // 此处会关闭bridge
        }
    }
```

在PackageInstallerSession中的openWrite函数中，Pm得到与PackageInstallerSession通信的client端，同时PackageInstallerSession也启动了FileBridge准备接收数据。

在Write Session中进行文件copy时，最终是利用FileBridge的管道来完成实际的工作。

#### 3.3 Commit Session

在doWriteSession函数完成后，APK源文件已经copy到目的地址了，紧接着开始doCommitSession的工作：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[cmds](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/)/[src](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/)/[commands](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/)/[Pm.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/cmds/pm/src/com/android/commands/pm/Pm.java)

``` java
    private int doCommitSession(int sessionId, boolean logSuccess) throws RemoteException {
        PackageInstaller.Session session = null;
        try {
            session = new PackageInstaller.Session(
                    mInstaller.openSession(sessionId));

            final LocalIntentReceiver receiver = new LocalIntentReceiver();
            // 此处提交Session
            session.commit(receiver.getIntentSender());

            final Intent result = receiver.getResult();
            final int status = result.getIntExtra(PackageInstaller.EXTRA_STATUS,
                    PackageInstaller.STATUS_FAILURE);
            if (status == PackageInstaller.STATUS_SUCCESS) {
                if (logSuccess) {
                    System.out.println("Success");
                }
            } else {
                System.err.println("Failure ["
                        + result.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) + "]");
            }
            return status;
        } finally {
            IoUtils.closeQuietly(session);
        }
    }
```

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/)/[content](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/content/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/content/pm/)/[PackageInstaller.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/android/content/pm/PackageInstaller.java)

``` java
        /**
         * Attempt to commit everything staged in this session. This may require
         * user intervention, and so it may not happen immediately. The final
         * result of the commit will be reported through the given callback.
         * <p>
         * Once this method is called, no additional mutations may be performed
         * on the session. If the device reboots before the session has been
         * finalized, you may commit the session again.
         *
         * @throws SecurityException if streams opened through
         *             {@link #openWrite(String, long, long)} are still open.
         */
        public void commit(@NonNull IntentSender statusReceiver) {
            try {
                // 通过Binder通信调用PackageInstallerSession中的commit函数
                mSession.commit(statusReceiver);
            } catch (RemoteException e) {
                throw e.rethrowFromSystemServer();
            }
        }
```

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/)/[PackageInstallerSession.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/PackageInstallerSession.java)

``` java
    @Override
    public void commit(IntentSender statusReceiver) {
        Preconditions.checkNotNull(statusReceiver);

        final boolean wasSealed; // boolean默认值为false
        synchronized (mLock) {
            wasSealed = mSealed;
            if (!mSealed) {
                // Verify that all writers are hands-off
                // 在FileBridge.java中run()的finally代码块中(也即doWriteSession传输数据的结尾)会关闭bridge
                for (FileBridge bridge : mBridges) {
                    if (!bridge.isClosed()) {
                        throw new SecurityException("Files still open");
                    }
                }
                mSealed = true;
            }

            // Client staging is fully done at this point
            mClientProgress = 1f;
            computeProgressLocked(true);
        }

        if (!wasSealed) {
            // Persist the fact that we've sealed ourselves to prevent
            // mutations of any hard links we create. We do this without holding
            // the session lock, since otherwise it's a lock inversion.
            mCallback.onSessionSealedBlocking(this);
        }

        // This ongoing commit should keep session active, even though client
        // will probably close their end.
        mActiveCount.incrementAndGet();

        final PackageInstallObserverAdapter adapter = new PackageInstallObserverAdapter(mContext,
                statusReceiver, sessionId, mIsInstallerDeviceOwner, userId);
        mHandler.obtainMessage(MSG_COMMIT, adapter.getBinder()).sendToTarget();
    }
```

指定mHandler对应的callback：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/)/[PackageInstallerSession.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/PackageInstallerSession.java)

``` java
    private final Handler.Callback mHandlerCallback = new Handler.Callback() {
        @Override
        public boolean handleMessage(Message msg) {
            // Cache package manager data without the lock held
            final PackageInfo pkgInfo = mPm.getPackageInfo(
                    params.appPackageName, PackageManager.GET_SIGNATURES /*flags*/, userId);
            final ApplicationInfo appInfo = mPm.getApplicationInfo(
                    params.appPackageName, 0, userId);

            synchronized (mLock) {
                if (msg.obj != null) {
                    mRemoteObserver = (IPackageInstallObserver2) msg.obj;
                }

                try {
                    // 最终触发commitLocked
                    commitLocked(pkgInfo, appInfo);
                } catch (PackageManagerException e) {
                    final String completeMsg = ExceptionUtils.getCompleteMessage(e);
                    Slog.e(TAG, "Commit of session " + sessionId + " failed: " + completeMsg);
                    destroyInternal();
                    dispatchSessionFinished(e.error, completeMsg, null);
                }

                return true;
            }
        }
    };
```

``` java
    private void commitLocked(PackageInfo pkgInfo, ApplicationInfo appInfo)
            throws PackageManagerException {
        ... ...
        try {
            resolveStageDir(); // 解析安装地址，即apk文件copy后的目的地址
        } catch (IOException e) {
            throw new PackageManagerException(INSTALL_FAILED_CONTAINER_ERROR,
                    "Failed to resolve stage location", e);
        }

        // Verify that stage looks sane with respect to existing application.
        // This currently only ensures packageName, versionCode, and certificate
        // consistency.
        // 检查apk文件是否满足要求，验证包名，版本号，证书的一致性
        validateInstallLocked(pkgInfo, appInfo);

        Preconditions.checkNotNull(mPackageName);
        Preconditions.checkNotNull(mSignatures);
        Preconditions.checkNotNull(mResolvedBaseFile);

        // 检查权限
        if (!mPermissionsAccepted) {
            // User needs to accept permissions; give installer an intent they
            // can use to involve user.
            final Intent intent = new Intent(PackageInstaller.ACTION_CONFIRM_PERMISSIONS);
            intent.setPackage(mContext.getPackageManager().getPermissionControllerPackageName());
            intent.putExtra(PackageInstaller.EXTRA_SESSION_ID, sessionId);
            try {
                mRemoteObserver.onUserActionRequired(intent);
            } catch (RemoteException ignored) {
            }

            // Commit was keeping session marked as active until now; release
            // that extra refcount so session appears idle.
            close();
            return;
        }

        if (stageCid != null) {
            // Figure out the final installed size and resize the container once
            // and for all. Internally the parser handles straddling between two
            // locations when inheriting.
            final long finalSize = calculateInstalledSize();
            resizeContainer(stageCid, finalSize);
        }

        // Inherit any packages and native libraries from existing install that
        // haven't been overridden.
        if (params.mode == SessionParams.MODE_INHERIT_EXISTING) {
            // 如果新的APK文件继承某些已安装的Package(不懂。。。)，此处将copy需要的native库文件等
            ... ...
        }

        // TODO: surface more granular state from dexopt
        mInternalProgress = 0.5f;
        computeProgressLocked(true);

        // Unpack native libraries
        // 解压native库文件
        extractNativeLibraries(mResolvedStageDir, params.abiOverride);

        // Container is ready to go, let's seal it up!
        // 封装容器，会针对安装在sdcard的操作做一些处理
        if (stageCid != null) {
            finalizeAndFixContainer(stageCid);
        }

        // We've reached point of no return; call into PMS to install the stage.
        // Regardless of success or failure we always destroy session.
        final IPackageInstallObserver2 localObserver = new IPackageInstallObserver2.Stub() {
            @Override
            public void onUserActionRequired(Intent intent) {
                throw new IllegalStateException();
            }

            @Override
            public void onPackageInstalled(String basePackageName, int returnCode, String msg,
                    Bundle extras) {
                destroyInternal();
                dispatchSessionFinished(returnCode, msg, extras);
            }
        };

        final UserHandle user;
        if ((params.installFlags & PackageManager.INSTALL_ALL_USERS) != 0) {
            user = UserHandle.ALL;
        } else {
            user = new UserHandle(userId);
        }

        mRelinquished = true;
        // 调用PKMS的installStage，进入安装的下一步操作
        mPm.installStage(mPackageName, stageDir, stageCid, localObserver, params,
                installerPackageName, installerUid, user, mCertificates);
    }
```

到这里可以总结Pm.java所做的事情，实际操作就是将adb copy的文件，copy到系统内或者sdcard的目录中，进行初步的权限检查等工作，最后通知PKMS进入Install Stage。这部分流程图如下：

![pm流程](http://otqux1hnn.bkt.clouddn.com/rangerzhou/170904/pm.png)



### 4. installStage

接下来进入PKMS，首先来看installStage函数：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/)/[PackageManagerService.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/PackageManagerService.java)

``` java
    void installStage(String packageName, File stagedDir, String stagedCid,
            IPackageInstallObserver2 observer, PackageInstaller.SessionParams sessionParams,
            String installerPackageName, int installerUid, UserHandle user,
            Certificate[][] certificates) {
        if (DEBUG_EPHEMERAL) {
            if ((sessionParams.installFlags & PackageManager.INSTALL_EPHEMERAL) != 0) {
                Slog.d(TAG, "Ephemeral install of " + packageName);
            }
        }
        // verificationInfo主要用于存储权限验证需要的信息
        final VerificationInfo verificationInfo = new VerificationInfo(
                sessionParams.originatingUri, sessionParams.referrerUri,
                sessionParams.originatingUid, installerUid);

        final OriginInfo origin;
        if (stagedDir != null) {
            // origin存储apk文件的路径信息
            origin = OriginInfo.fromStagedFile(stagedDir);
        } else {
            origin = OriginInfo.fromStagedContainer(stagedCid);
        }

        final Message msg = mHandler.obtainMessage(INIT_COPY); // 参数为INIT_COPY
        // 准备安装所需要的参数
        final InstallParams params = new InstallParams(origin, null, observer,
                sessionParams.installFlags, installerPackageName, sessionParams.volumeUuid,
                verificationInfo, user, sessionParams.abiOverride,
                sessionParams.grantedRuntimePermissions, certificates);
        params.setTraceMethod("installStage").setTraceCookie(System.identityHashCode(params));
        msg.obj = params; // 把安装参数赋给msg.obj

        Trace.asyncTraceBegin(TRACE_TAG_PACKAGE_MANAGER, "installStage",
                System.identityHashCode(msg.obj));
        Trace.asyncTraceBegin(TRACE_TAG_PACKAGE_MANAGER, "queueInstall",
                System.identityHashCode(msg.obj));

        // 发送INIT_COPY消息，驱动处理流程
        mHandler.sendMessage(msg);
    }
```

此处的mHandler为PKMS中内部类PackageHandler对象，其中处理消息的函数为doHandleMessage:

``` java
    static final String DEFAULT_CONTAINER_PACKAGE = "com.android.defcontainer";

    static final ComponentName DEFAULT_CONTAINER_COMPONENT = new ComponentName(
            DEFAULT_CONTAINER_PACKAGE,
            "com.android.defcontainer.DefaultContainerService");
... ...
	class PackageHandler extends Handler {
        private boolean mBound = false;
        final ArrayList<HandlerParams> mPendingInstalls =
            new ArrayList<HandlerParams>();
        private boolean connectToService() { // 其实就是bindService
            if (DEBUG_SD_INSTALL) Log.i(TAG, "Trying to bind to" +
                    " DefaultContainerService");
            // 如上定义了component的包名和类名
            Intent service = new Intent().setComponent(DEFAULT_CONTAINER_COMPONENT);
            Process.setThreadPriority(Process.THREAD_PRIORITY_DEFAULT);
            if (mContext.bindServiceAsUser(service, mDefContainerConn,
                    Context.BIND_AUTO_CREATE, UserHandle.SYSTEM)) {
                Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
                mBound = true;
                return true;
            }
            Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
            return false;
        }

        private void disconnectService() { // unbindService
            mContainerService = null;
            mBound = false;
            Process.setThreadPriority(Process.THREAD_PRIORITY_DEFAULT);
            mContext.unbindService(mDefContainerConn);
            Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
        }

        PackageHandler(Looper looper) {
            super(looper);
        }

        public void handleMessage(Message msg) {
            try {
                doHandleMessage(msg);
            } finally {
                Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
            }
        }
        void doHandleMessage(Message msg) {
            switch (msg.what) {
                case INIT_COPY: {
                    // 在installStage中msg.obj已经被赋值安装参数
                    HandlerParams params = (HandlerParams) msg.obj;
                    // idx为当前等待处理的安装请求个数
                    int idx = mPendingInstalls.size();
                    if (DEBUG_INSTALL) Slog.i(TAG, "init_copy idx=" + idx + ": " + params);
                    // If a bind was already initiated we dont really
                    // need to do anything. The pending install
                    // will be processed later on.
                    // 如果已经有一个绑定被初始化，那就不做任何事情，待安装的操作稍后会进行，初始时mBound的值为false
                    if (!mBound) {
                        Trace.asyncTraceBegin(TRACE_TAG_PACKAGE_MANAGER, "bindingMCS",
                                System.identityHashCode(mHandler));
                        // If this is the only one pending we might
                        // have to bind to the service again.
                        // 绑定实际的安装service
                        if (!connectToService()) {
                            Slog.e(TAG, "Failed to bind to media container service");
                            params.serviceError();
                            Trace.asyncTraceEnd(TRACE_TAG_PACKAGE_MANAGER, "bindingMCS",
                                    System.identityHashCode(mHandler));
                            if (params.traceMethod != null) {
                                Trace.asyncTraceEnd(TRACE_TAG_PACKAGE_MANAGER, params.traceMethod,
                                        params.traceCookie);
                            }
                            return;
                        } else {
                            // Once we bind to the service, the first
                            // pending request will be processed.
                            // 绑定服务成功后，将请求加入到mPendingInstalls等待处理
                            mPendingInstalls.add(idx, params);
                        }
                    } else {
                        // 如果已经绑定过service，同样将新的请求加入到mPendingInstalls等待处理
                        mPendingInstalls.add(idx, params);
                        // Already bound to the service. Just make
                        // sure we trigger off processing the first request.
                        if (idx == 0) {
                            // idx=0代表第一个请求，直接发送MCS_BOUND事件，触发处理流程
                            mHandler.sendEmptyMessage(MCS_BOUND);
                        }
                    }
                    break;
                }
                ... ...
            }
        }
     }
```

PKMS定义了安装服务的包名`com.android.defcontainer`和类名`com.android.defcontainer.DefaultContainerService`，可知实际进行安装工作的是DefaultContainerService，还是定义在PKMS中，接下来看绑定服务成功后的操作：

``` java
    class DefaultContainerConnection implements ServiceConnection {
        public void onServiceConnected(ComponentName name, IBinder service) {
            if (DEBUG_SD_INSTALL) Log.i(TAG, "onServiceConnected");
            // 获得与服务端通信的代理对象
            IMediaContainerService imcs =
                IMediaContainerService.Stub.asInterface(service);
            // 发送消息MCS_BOUND
            mHandler.sendMessage(mHandler.obtainMessage(MCS_BOUND, imcs));
        }

        public void onServiceDisconnected(ComponentName name) {
            if (DEBUG_SD_INSTALL) Log.i(TAG, "onServiceDisconnected");
        }
    }
```

绑定service后会获取与服务端通信的代理对象，并且发送MCS_BOUND消息，

``` java
        void doHandleMessage(Message msg) {
            switch (msg.what) {
                ... ...
                case MCS_BOUND: {
                    if (DEBUG_INSTALL) Slog.i(TAG, "mcs_bound");
                    if (msg.obj != null) {
                        mContainerService = (IMediaContainerService) msg.obj;
                        Trace.asyncTraceEnd(TRACE_TAG_PACKAGE_MANAGER, "bindingMCS",
                                System.identityHashCode(mHandler));
                    }
                    if (mContainerService == null) {
                        ... ...
                    } else if (mPendingInstalls.size() > 0) { // 安装请求的个数大于0
                        // 获取第一个安装请求
                        HandlerParams params = mPendingInstalls.get(0);
                        if (params != null) {
                            Trace.asyncTraceEnd(TRACE_TAG_PACKAGE_MANAGER, "queueInstall",
                                    System.identityHashCode(params));
                            Trace.traceBegin(TRACE_TAG_PACKAGE_MANAGER, "startCopy");
                            if (params.startCopy()) {
                                // We are done...  look for more work or to
                                // go idle.
                                if (DEBUG_SD_INSTALL) Log.i(TAG,
                                        "Checking for more work or unbind...");
                                // Delete pending install
                                if (mPendingInstalls.size() > 0) {
                                    mPendingInstalls.remove(0);
                                }
                                if (mPendingInstalls.size() == 0) {
                                // 如果没有安装请求了则10秒钟后解绑service
                                    if (mBound) {
                                        if (DEBUG_SD_INSTALL) Log.i(TAG,
                                                "Posting delayed MCS_UNBIND");
                                        removeMessages(MCS_UNBIND);
                                        Message ubmsg = obtainMessage(MCS_UNBIND);
                                        // Unbind after a little delay, to avoid
                                        // continual thrashing.
                                        sendMessageDelayed(ubmsg, 10000);
                                    }
                                } else {
                                    // 否则继续发送MCS_BOUND消息
                                    // There are more pending requests in queue.
                                    // Just post MCS_BOUND message to trigger processing
                                    // of next pending install.
                                    if (DEBUG_SD_INSTALL) Log.i(TAG,
                                            "Posting MCS_BOUND for next work");
                                    mHandler.sendEmptyMessage(MCS_BOUND);
                                }
                            }
                            Trace.traceEnd(TRACE_TAG_PACKAGE_MANAGER);
                        }
                    } else {
                        // Should never happen ideally.
                        Slog.w(TAG, "Empty queue");
                    }
                    break;
                }
```

这段代码的功能就是处理安装请求，处理完后安装队列不为空，则继续发送MCS_BOUND消息继续处理下一个安装请求，如果安装队列为空，则等待10秒钟后发送MCS_UNBIND消息断开service绑定。

接下来看startCopy函数：

``` java
    private abstract class HandlerParams {
        private static final int MAX_RETRIES = 4;
      ... ...
        final boolean startCopy() {
            boolean res;
            try {
                if (DEBUG_INSTALL) Slog.i(TAG, "startCopy " + mUser + ": " + this);

                // 如果最大安装重复次数大于4次，处理安装失败的消息
                if (++mRetries > MAX_RETRIES) {
                    Slog.w(TAG, "Failed to invoke remote methods on default container service. Giving up");
                    mHandler.sendEmptyMessage(MCS_GIVE_UP);
                    handleServiceError();
                    return false;
                } else {
                    handleStartCopy(); // 实际的copy工作
                    res = true;
                }
            } catch (RemoteException e) {
                if (DEBUG_INSTALL) Slog.i(TAG, "Posting install MCS_RECONNECT");
                mHandler.sendEmptyMessage(MCS_RECONNECT);
                res = false;
            }
            handleReturnCode();
            return res;
        }
```

![installStage](http://otqux1hnn.bkt.clouddn.com/rangerzhou/170728/installstage.png)

### 5. handleStartCopy

如上图，HandlerParams为内部抽象类，handleStartCopy在HandlerParams的子类InstallParams中实现：

``` java
    class InstallParams extends HandlerParams {
      ... ...
      /*
         * Invoke remote method to get package information and install
         * location values. Override install location based on default
         * policy if needed and then create install arguments based
         * on the install location.
         */
        public void handleStartCopy() throws RemoteException {
            int ret = PackageManager.INSTALL_SUCCEEDED;

            // If we're already staged, we've firmly committed to an install location
            if (origin.staged) {
                if (origin.file != null) {
                    installFlags |= PackageManager.INSTALL_INTERNAL;
                    installFlags &= ~PackageManager.INSTALL_EXTERNAL;
                } else if (origin.cid != null) {
                    installFlags |= PackageManager.INSTALL_EXTERNAL;
                    installFlags &= ~PackageManager.INSTALL_INTERNAL;
                } else {
                    throw new IllegalStateException("Invalid stage location");
                }
            }

            final boolean onSd = (installFlags & PackageManager.INSTALL_EXTERNAL) != 0;
            final boolean onInt = (installFlags & PackageManager.INSTALL_INTERNAL) != 0;
            final boolean ephemeral = (installFlags & PackageManager.INSTALL_EPHEMERAL) != 0;
            PackageInfoLite pkgLite = null;

            // 检查APK的安装位置是否正确
            if (onInt && onSd) {
                // Check if both bits are set.
                // APK不能同时安装在内部存储和SD卡上
                Slog.w(TAG, "Conflicting flags specified for installing on both internal and external");
                ret = PackageManager.INSTALL_FAILED_INVALID_INSTALL_LOCATION;
            } else if (onSd && ephemeral) {
                // APK不能短暂的安装在SD卡中
                Slog.w(TAG,  "Conflicting flags specified for installing ephemeral on external");
                ret = PackageManager.INSTALL_FAILED_INVALID_INSTALL_LOCATION;
            } else {
                // getMini...用来解析安装包，返回PackageInfoLite对象，判断能否安装，具体见5.1
                pkgLite = mContainerService.getMinimalPackageInfo(origin.resolvedPath, installFlags, packageAbiOverride);

                if (DEBUG_EPHEMERAL && ephemeral) {
                    Slog.v(TAG, "pkgLite for install: " + pkgLite);
                }

                /*
                 * If we have too little free space, try to free cache
                 * before giving up.
                 */
                // 如果由于存储空间过小导致安装失败时
                if (!origin.staged && pkgLite.recommendedInstallLocation
                        == PackageHelper.RECOMMEND_FAILED_INSUFFICIENT_STORAGE) {
                    // TODO: focus freeing disk space on the target device
                    final StorageManager storage = StorageManager.from(mContext);
                    // 获取设备内部存储空间允许的最小存储空间大小
                    final long lowThreshold = storage.getStorageLowBytes(
                            Environment.getDataDirectory());

                    // 计算安装APK大概所需的空间
                    final long sizeBytes = mContainerService.calculateInstalledSize(
                            origin.resolvedPath, isForwardLocked(), packageAbiOverride);

                    try {
                        // 释放cache，尝试将缓存释放到大于等于sizeBytes + lowThreshold
                        mInstaller.freeCache(null, sizeBytes + lowThreshold);
                        // 再次通过getMini...方法判断是否满足安装条件
                        pkgLite = mContainerService.getMinimalPackageInfo(origin.resolvedPath,
                                installFlags, packageAbiOverride);
                    } catch (InstallerException e) {
                        Slog.w(TAG, "Failed to free cache", e);
                    }

                    /*
                     * The cache free must have deleted the file we
                     * downloaded to install.
                     *
                     * TODO: fix the "freeCache" call to not delete
                     *       the file we care about.
                     */
                    // 如果经过释放cache后还是无法安装，则把安装失败flag保存到recom...
                    if (pkgLite.recommendedInstallLocation
                            == PackageHelper.RECOMMEND_FAILED_INVALID_URI) {
                        pkgLite.recommendedInstallLocation
                            = PackageHelper.RECOMMEND_FAILED_INSUFFICIENT_STORAGE;
                    }
                }
            }

            if (ret == PackageManager.INSTALL_SUCCEEDED) {
                // recommendedInstallLocation保存安装路径信息，即内部还是SD卡中，也记录安装失败的信息
                int loc = pkgLite.recommendedInstallLocation;
                if (loc == PackageHelper.RECOMMEND_FAILED_INVALID_LOCATION) {
                    ret = PackageManager.INSTALL_FAILED_INVALID_INSTALL_LOCATION;
                } else if (loc == PackageHelper.RECOMMEND_FAILED_ALREADY_EXISTS) {
                    ret = PackageManager.INSTALL_FAILED_ALREADY_EXISTS;
                } else if (loc == PackageHelper.RECOMMEND_FAILED_INSUFFICIENT_STORAGE) {
                    ret = PackageManager.INSTALL_FAILED_INSUFFICIENT_STORAGE;
                } else if (loc == PackageHelper.RECOMMEND_FAILED_INVALID_APK) {
                    ret = PackageManager.INSTALL_FAILED_INVALID_APK;
                } else if (loc == PackageHelper.RECOMMEND_FAILED_INVALID_URI) {
                    ret = PackageManager.INSTALL_FAILED_INVALID_URI;
                } else if (loc == PackageHelper.RECOMMEND_MEDIA_UNAVAILABLE) {
                    ret = PackageManager.INSTALL_FAILED_MEDIA_UNAVAILABLE;
                } else {
                    // Override with defaults if needed.
                    // 如果安装路径有足够的空间，loc就不会等于上述判断条件
                    // 代码将会走到这里，installLocationPolicy用来判断APK是否已经安装过，具体见5.2
                    loc = installLocationPolicy(pkgLite);
                    ... ...
                }
            }

            // 创建安装参数，具体见5.3
            final InstallArgs args = createInstallArgs(this);
            mArgs = args;

            if (ret == PackageManager.INSTALL_SUCCEEDED) {
                // TODO: http://b/22976637
                // Apps installed for "all" users use the device owner to verify the app
                UserHandle verifierUser = getUser();
                if (verifierUser == UserHandle.ALL) {
                    verifierUser = UserHandle.SYSTEM;
                }

                /*
                 * Determine if we have any installed package verifiers. If we
                 * do, then we'll defer to them to verify the packages.
                 */
                final int requiredUid = mRequiredVerifierPackage == null ? -1
                        : getPackageUid(mRequiredVerifierPackage, MATCH_DEBUG_TRIAGED_MISSING,
                                verifierUser.getIdentifier());
                if (!origin.existing && requiredUid != -1
                        && isVerificationEnabled(verifierUser.getIdentifier(), installFlags)) {
                    // 存在安装包检查者，并且满足启动检查条件，就利用安装包检查者检查
                    final Intent verification = new Intent(
                            Intent.ACTION_PACKAGE_NEEDS_VERIFICATION);
                    verification.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
                    verification.setDataAndType(Uri.fromFile(new File(origin.resolvedPath)),
                            PACKAGE_MIME_TYPE);
                    verification.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                    // 检查安装包的操作
                    ... ...
                } else {
                    /*
                     * No package verification is enabled, so immediately start
                     * the remote call to initiate copy using temporary file.
                     */
                    // 没有安装包检查，则直接执行copyApk函数，具体见5.4
                    ret = args.copyApk(mContainerService, true);
                }
            }

            mRet = ret;
        }
```

#### 5.1 getMinimalPackageInfo

getMinimalPackageInfo定义在DefaultContainerService中：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[packages](http://androidxref.com/7.1.1_r6/xref/frameworks/base/packages/)/[DefaultContainerService](http://androidxref.com/7.1.1_r6/xref/frameworks/base/packages/DefaultContainerService/)/[src](http://androidxref.com/7.1.1_r6/xref/frameworks/base/packages/DefaultContainerService/src/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/packages/DefaultContainerService/src/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/packages/DefaultContainerService/src/com/android/)/[defcontainer](http://androidxref.com/7.1.1_r6/xref/frameworks/base/packages/DefaultContainerService/src/com/android/defcontainer/)/[DefaultContainerService.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/packages/DefaultContainerService/src/com/android/defcontainer/DefaultContainerService.java)

``` java
        /**
         * Parse given package and return minimal details.
         *
         * @param packagePath absolute path to the package to be copied. Can be
         *            a single monolithic APK file or a cluster directory
         *            containing one or more APKs.
         */
        @Override
        public PackageInfoLite getMinimalPackageInfo(String packagePath, int flags,
                String abiOverride) {
            final Context context = DefaultContainerService.this;
            final boolean isForwardLocked = (flags & PackageManager.INSTALL_FORWARD_LOCK) != 0;

            PackageInfoLite ret = new PackageInfoLite();
            if (packagePath == null) {
                Slog.i(TAG, "Invalid package file " + packagePath);
                ret.recommendedInstallLocation = PackageHelper.RECOMMEND_FAILED_INVALID_APK;
                return ret;
            }

            final File packageFile = new File(packagePath);
            final PackageParser.PackageLite pkg;
            final long sizeBytes;
            try {
                // 解析安装包，得到PackageParser.PackageLite
                pkg = PackageParser.parsePackageLite(packageFile, 0);
                sizeBytes = PackageHelper.calculateInstalledSize(pkg, isForwardLocked, abiOverride);
            } catch (PackageParserException | IOException e) {
                Slog.w(TAG, "Failed to parse package at " + packagePath + ": " + e);

                if (!packageFile.exists()) {
                    ret.recommendedInstallLocation = PackageHelper.RECOMMEND_FAILED_INVALID_URI;
                } else {
                    ret.recommendedInstallLocation = PackageHelper.RECOMMEND_FAILED_INVALID_APK;
                }

                return ret;
            }

            ret.packageName = pkg.packageName;
            ret.splitNames = pkg.splitNames;
            ret.versionCode = pkg.versionCode;
            ret.baseRevisionCode = pkg.baseRevisionCode;
            ret.splitRevisionCodes = pkg.splitRevisionCodes;
            ret.installLocation = pkg.installLocation;
            ret.verifiers = pkg.verifiers;
            // 利用resolveInstallLocation获取安装位置
            ret.recommendedInstallLocation = PackageHelper.resolveInstallLocation(context,
                    pkg.packageName, pkg.installLocation, sizeBytes, flags);
            ret.multiArch = pkg.multiArch;

            return ret;
        }
```

从代码可知`getMinimalPackageInfo`就是对安装包进行解析，获取安装包的一些信息。

resolveInstallLocation:

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/android/)/[internal](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/android/internal/)/[content](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/android/internal/content/)/[PackageHelper.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/core/java/com/android/internal/content/PackageHelper.java)

``` java
    /**
     * Given a requested {@link PackageInfo#installLocation} and calculated
     * install size, pick the actual location to install the app.
     */
    public static int resolveInstallLocation(Context context, String packageName,
            int installLocation, long sizeBytes, int installFlags) {
        ApplicationInfo existingInfo = null;
        try {
            // 就根据包名获取已经存在的ApplicationInfo信息，意如其名existingInfo
            existingInfo = context.getPackageManager().getApplicationInfo(packageName,
                    PackageManager.GET_UNINSTALLED_PACKAGES);
        } catch (NameNotFoundException ignored) {
        }

        final int prefer;
        final boolean checkBoth;
        boolean ephemeral = false;
        // 根据installFlags与一些常量flag参数的相与结果以及installLocation决定安装路径
        if ((installFlags & PackageManager.INSTALL_EPHEMERAL) != 0) {
            prefer = RECOMMEND_INSTALL_INTERNAL;
            ephemeral = true;
            checkBoth = false;
        } else if ((installFlags & PackageManager.INSTALL_INTERNAL) != 0) {
            prefer = RECOMMEND_INSTALL_INTERNAL;
            checkBoth = false;
        } else if ((installFlags & PackageManager.INSTALL_EXTERNAL) != 0) {
            prefer = RECOMMEND_INSTALL_EXTERNAL;
            checkBoth = false;
        } else if (installLocation == PackageInfo.INSTALL_LOCATION_INTERNAL_ONLY) {
            prefer = RECOMMEND_INSTALL_INTERNAL;
            checkBoth = false;
        } else if (installLocation == PackageInfo.INSTALL_LOCATION_PREFER_EXTERNAL) {
            prefer = RECOMMEND_INSTALL_EXTERNAL;
            checkBoth = true;
        } else if (installLocation == PackageInfo.INSTALL_LOCATION_AUTO) {
            // 一般情况下installLocation为AUTO
            // When app is already installed, prefer same medium
            if (existingInfo != null) {
                // TODO: distinguish if this is external ASEC
                // APK以前安装过，直接从保存的ApplicationInfo中获取flag得出安装路径
                if ((existingInfo.flags & ApplicationInfo.FLAG_EXTERNAL_STORAGE) != 0) {
                    prefer = RECOMMEND_INSTALL_EXTERNAL;
                } else {
                    prefer = RECOMMEND_INSTALL_INTERNAL;
                }
            } else {
                // 如果existingInfo为null，即以前没有安装过，则安装在手机内部
                prefer = RECOMMEND_INSTALL_INTERNAL;
            }
            checkBoth = true;
        } else {
            // 默认情况下也安装在手机内部
            prefer = RECOMMEND_INSTALL_INTERNAL;
            checkBoth = false;
        }

        // fitsOnInternal函数会判断上文中得出的sizeBytes是否小于data目录的剩余空间
        boolean fitsOnInternal = false;
        if (checkBoth || prefer == RECOMMEND_INSTALL_INTERNAL) {
            fitsOnInternal = fitsOnInternal(context, sizeBytes);
        }

        // fitsOnExternal和fitsOnInternal一样都是判断是否有足够空间安装
        boolean fitsOnExternal = false;
        if (checkBoth || prefer == RECOMMEND_INSTALL_EXTERNAL) {
            fitsOnExternal = fitsOnExternal(context, sizeBytes);
        }

        // 根据prefer和上面得出的fits...再次判断返回的安装目录
        // 怎么这么多重复判断呢，感觉代码写的有点冗余，明明可以合在上面代码中一并处理
        if (prefer == RECOMMEND_INSTALL_INTERNAL) {
            // The ephemeral case will either fit and return EPHEMERAL, or will not fit
            // and will fall through to return INSUFFICIENT_STORAGE
            if (fitsOnInternal) {
                return (ephemeral)
                        ? PackageHelper.RECOMMEND_INSTALL_EPHEMERAL
                        : PackageHelper.RECOMMEND_INSTALL_INTERNAL;
            }
        } else if (prefer == RECOMMEND_INSTALL_EXTERNAL) {
            if (fitsOnExternal) {
                return PackageHelper.RECOMMEND_INSTALL_EXTERNAL;
            }
        }

        // 正常情况下以上部分代码已经返回了安装路径
        if (checkBoth) {
            if (fitsOnInternal) {
                return PackageHelper.RECOMMEND_INSTALL_INTERNAL;
            } else if (fitsOnExternal) {
                return PackageHelper.RECOMMEND_INSTALL_EXTERNAL;
            }
        }

        // 如果没有足够的空间安装，则返回。。。
        return PackageHelper.RECOMMEND_FAILED_INSUFFICIENT_STORAGE;
    }
```

`resolveInstallLocation`的作用就是判断安装路径是否有足够的工具，返回对应的flag。

#### 5.2 installLocationPolicy

如果`resolveInstallLocation`返回的不是failed的flag，就会调用installLocationPolicy函数：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[services](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/)/[core](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/)/[pm](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/)/[PackageManagerService.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/services/core/java/com/android/server/pm/PackageManagerService.java)

``` java
    class InstallParams extends HandlerParams {
      ... ...
        private int installLocationPolicy(PackageInfoLite pkgLite) {
            String packageName = pkgLite.packageName;
            int installLocation = pkgLite.installLocation;
            boolean onSd = (installFlags & PackageManager.INSTALL_EXTERNAL) != 0;
            // reader
            synchronized (mPackages) {
                // Currently installed package which the new package is attempting to replace or
                // null if no such package is installed.
                // 判断终端上是否安装过同样的APK
                PackageParser.Package installedPkg = mPackages.get(packageName);
                // ... ...
                // 如果installedPkg为null，则设备上没有安装这个APK或者APK已卸载
                PackageParser.Package dataOwnerPkg = installedPkg;
                if (dataOwnerPkg  == null) {
                    // 如果APK卸载了，但是保留了数据，那么将取出对应的PackageSetting对象
                    PackageSetting ps = mSettings.mPackages.get(packageName);
                    if (ps != null) {
                        // 如果取出的PackageSetting不为空，则取出对应的pkg给dataOwnerPkg
                        dataOwnerPkg = ps.pkg;
                    }
                }

                if (dataOwnerPkg != null) {
					// ... ...
                    final boolean downgradeRequested =
                            (installFlags & PackageManager.INSTALL_ALLOW_DOWNGRADE) != 0;
                    final boolean packageDebuggable =
                                (dataOwnerPkg.applicationInfo.flags
                                        & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
                    final boolean downgradePermitted =
                            (downgradeRequested) && ((Build.IS_DEBUGGABLE) || (packageDebuggable));
                    if (!downgradePermitted) {
                        try {
                            checkDowngrade(dataOwnerPkg, pkgLite);
                        } catch (PackageManagerException e) {
                            Slog.w(TAG, "Downgrade detected: " + e.getMessage());
                            return PackageHelper.RECOMMEND_FAILED_VERSION_DOWNGRADE;
                        }
                    }
                }

                if (installedPkg != null) {
                    if ((installFlags & PackageManager.INSTALL_REPLACE_EXISTING) != 0) {
                        // Check for updated system application.
                        if ((installedPkg.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0) {
                            if (onSd) {
                                Slog.w(TAG, "Cannot install update to system app on sdcard");
                                return PackageHelper.RECOMMEND_FAILED_INVALID_LOCATION;
                            }
                            return PackageHelper.RECOMMEND_INSTALL_INTERNAL;
                        } else {
                            if (onSd) {
                                // Install flag overrides everything.
                                return PackageHelper.RECOMMEND_INSTALL_EXTERNAL;
                            }
                            // If current upgrade specifies particular preference
                            if (installLocation == PackageInfo.INSTALL_LOCATION_INTERNAL_ONLY) {
                                // Application explicitly specified internal.
                                return PackageHelper.RECOMMEND_INSTALL_INTERNAL;
                            } else if (installLocation == PackageInfo.INSTALL_LOCATION_PREFER_EXTERNAL) {
                                // App explictly prefers external. Let policy decide
                            } else {
                                // Prefer previous location
                                if (isExternal(installedPkg)) {
                                    return PackageHelper.RECOMMEND_INSTALL_EXTERNAL;
                                }
                                return PackageHelper.RECOMMEND_INSTALL_INTERNAL;
                            }
                        }
                    } else {
                        // Invalid install. Return error code
                        return PackageHelper.RECOMMEND_FAILED_ALREADY_EXISTS;
                    }
                }
            }
            // All the special cases have been taken care of.
            // Return result based on recommended install location.
            if (onSd) {
                return PackageHelper.RECOMMEND_INSTALL_EXTERNAL;
            }
            return pkgLite.recommendedInstallLocation;
        }
```





#### 5.3 createInstallArgs





#### 5.4 copyApk



### 6. handleReturnCode



#### 6.1 



#### 6.2 



#### 6.3 



### 6.4 



### 7. 



