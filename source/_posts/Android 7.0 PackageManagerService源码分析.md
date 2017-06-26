---
title: Android 7.0 PackageManagerService源码分析
date: 2017-06-26 13:56:01
tags:
categories: "Frameworks"
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

从代码中了解`install_app`就是将源机器中的文件copy到了目的机器（手机）中，可能是因为这个支持Feature的流程PKMS能够监听到这个copy，接下来继续看传动的安装方式`install_app_legacy`。

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
        // 根据参数构造pm命令
        cmd += " " + escape_arg(*argv++);
    }

    // 向adbd发送shell命令
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
        if (!disable_shell_protocol) {
            FeatureSet features;
            std::string error;
            if (adb_get_feature_set(&features, &error)) {
                use_shell_protocol = CanUseFeature(features, kFeatureShell2);
            } else {
                // Device was unreachable.
                attempt_connection = false;
            }
        }

        if (attempt_connection) {
            std::string error;
            std::string service_string = ShellServiceString(use_shell_protocol, "", command);

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





