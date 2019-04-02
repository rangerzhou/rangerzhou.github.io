---
title: Android_O系统层授予APP权限
copyright: true
date: 2018-08-29 19:21:59
tags: Android, Permission
categories: Android
password:
---





### 1. 概述

> 权限的目的是保护用户隐私， Andriod 应用访问用户敏感数据（例如联系人、短信）和某些系统功能（例如相机、网络）时必须申请权限，系统会根据不同的功能选择自动授予权限或者提示用户批准权限请求。

<!--more-->

### 2. 权限许可

应用必须在 `AndroidManifest.xml` 中使用 `<uses-permission>` 标签对声明需要的权限，例如声明需要访问网络和发送短信的权限：

```xm
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.aptiv.helloworld">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.SEND_SMS" />

    <application ...>
		...
    </application>

</manifest>
```



在 Android 5.1 或更低版本，或者应用的 targetSdk 为22 或更低，用户必须在安装应用时授予 manifest 中列出的权限，否则应用无法安装；

在 Android 6.0及以上，或者应用的 targetSdk 为23或者更高，应用必须在 manifest 中列出权限，并且必须在运行时请求其需要的每项 **dangerous** 权限，用户可以授予或拒绝每项权限，且即使用户拒绝权限请求，应用仍可以继续运行有限的功能；



系统权限分为几个保护级别，我们一般只需要了解最重要的保护级别： **normal** 和 **dangerous**：

- **normal：**默认值，低风险的权限采用此级别，在 app 安装时系统会自动授予此 app 请求的所有 normal 权限，无需征求用户的同意；
- **dangerous：**较高风险的权限，如果应用声明其需要危险权限，则用户必须明确向应用授予该权限； 如果在 manifest 中列出的权限级别为 **normal** （也就是说，权限不会对用户的隐私或设备操作造成太大风险），系统会自动授予这些权限给应用。

 

可以在/[frameworks](http://androidxref.com/8.1.0_r33/xref/frameworks/)/[base](http://androidxref.com/8.1.0_r33/xref/frameworks/base/)/[core](http://androidxref.com/8.1.0_r33/xref/frameworks/base/core/)/[res](http://androidxref.com/8.1.0_r33/xref/frameworks/base/core/res/)/[AndroidManifest.xml](http://androidxref.com/8.1.0_r33/xref/frameworks/base/core/res/AndroidManifest.xml)中查询各个权限的级别（protectionLevel属性）：

```xml
    <permission android:name="android.permission.INTERNET"
        android:description="@string/permdesc_createNetworkSockets"
        android:label="@string/permlab_createNetworkSockets"
        android:protectionLevel="normal|instant" />
    ... ...
    <permission android:name="android.permission.CAMERA"
        android:permissionGroup="android.permission-group.CAMERA"
        android:label="@string/permlab_camera"
        android:description="@string/permdesc_camera"
        android:protectionLevel="dangerous|instant" />
```

也可以通过 `adb shell pm list permissions -g -d`命令查看危险权限列表：

```powershell
rangerzhou@zr:~ $ adb shell pm list permissions -g -d
Dangerous Permissions:

group:android.permission-group.CONTACTS
  permission:android.permission.WRITE_CONTACTS
  permission:android.permission.GET_ACCOUNTS
  permission:android.permission.READ_CONTACTS

group:android.permission-group.PHONE
  permission:android.permission.READ_CALL_LOG
  permission:android.permission.ANSWER_PHONE_CALLS
  permission:android.permission.READ_PHONE_NUMBERS
  permission:android.permission.READ_PHONE_STATE
  permission:android.permission.CALL_PHONE
  permission:android.permission.WRITE_CALL_LOG
  permission:android.permission.USE_SIP
  permission:android.permission.PROCESS_OUTGOING_CALLS
  permission:com.android.voicemail.permission.ADD_VOICEMAIL

... ...

ungrouped:
  permission:com.xiaomi.xmsf.permission.PAYMENT
  permission:miui.permission.ACCESS_BLE_SETTINGS
```



### 3. App简要安装流程

[点此查看安装流程](http://rangerzhou.top/2017/06/26/Android_7.0_PackageManagerService%E6%BA%90%E7%A0%81%E5%88%86%E6%9E%90/) 

![pkgGrantPermission](http://otqux1hnn.bkt.clouddn.com/rangerzhou/180821pkgGrantPermission.png)



### 4. 系统层授予权限

假如在某些场景下我们需要 APP 无需申请，直接拥有某些权限，那么就需要在系统层直接授予相应的权限了。需要授予的权限分为安装时权限（ **normal** 级别）和运行时权限（ **dangerous** 级别）。

#### 4.1 添加运行时权限

添加运行时权限的方法有两种：

##### 4.1.1 在 `system/etc/default-permissions` 添加 `default_permissions.xml` 文件

```xml
<exceptions>
    <!-- This is an example of an exception:
    <exception
        package="com.aptiv.helloworld"
      <permission name="android.permission.RECORD_AUDIO" fixed="true"/>
      <permission name="android.permission.ACCESS_FINE_LOCATION" fixed="false"/>
</exception> 
```

并添加权限(chmod a+r default_permissions.xml)：

源码依据：

/[frameworks](http://androidxref.com/8.1.0_r33/xref/frameworks/)/[base](http://androidxref.com/8.1.0_r33/xref/frameworks/base/)/[services](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/)/[core](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/)/[java](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/server/)/[pm](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/server/pm/)/[DefaultPermissionGrantPolicy.java](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/server/pm/DefaultPermissionGrantPolicy.java)

```java
    public void grantDefaultPermissions(int userId) {
        if (mService.hasSystemFeature(PackageManager.FEATURE_EMBEDDED, 0)) {
            grantAllRuntimePermissions(userId);
        } else {
            grantPermissionsToSysComponentsAndPrivApps(userId); // runtime
            grantDefaultSystemHandlerPermissions(userId); // runtime
            grantDefaultPermissionExceptions(userId); // runtime
        }
    }
... ...
    private void grantDefaultPermissionExceptions(int userId) {
        synchronized (mService.mPackages) {
            mHandler.removeMessages(MSG_READ_DEFAULT_PERMISSION_EXCEPTIONS);

            if (mGrantExceptions == null) {
                mGrantExceptions = readDefaultPermissionExceptionsLPw();
            }
            ...
    }
... ...
    private @NonNull ArrayMap<String, List<DefaultPermissionGrant>>
            readDefaultPermissionExceptionsLPw() {
        File[] files = getDefaultPermissionFiles();
        if (files == null) {
            return new ArrayMap<>(0);
        }
    ...
    } 
... ...
    private File[] getDefaultPermissionFiles() {
        ArrayList<File> ret = new ArrayList<File>();
        File dir = new File(Environment.getRootDirectory(), "etc/default-permissions");
        if (dir.isDirectory() && dir.canRead()) {
            Collections.addAll(ret, dir.listFiles());
        }
        dir = new File(Environment.getVendorDirectory(), "etc/default-permissions");
        if (dir.isDirectory() && dir.canRead()) {
            Collections.addAll(ret, dir.listFiles());
        }
        return ret.isEmpty() ? null : ret.toArray(new File[0]);
    }
```

可以看出系统会在 `system/etc/default-permissions/ ` 目录下查找权限配置文件，只需按照格式添加 APP 对应的权限即可。



##### 4.1.2 通过修改源码实现

调用 [PackageManagerService.java](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/server/pm/PackageManagerService.java).**grantRuntimePermission(String packageName, String name, final int userId)** 接口实现；

授予权限又分为2种情况，一种是原本在**manifest**文件中声明了，一种是没有在**manifest**中声明，前者直接调用申请即可，后者则还需要把相应的权限添加到  **pkg.requestedPermissions** 中。需要在系统起来后就授予，故可以在 **PackageManagerService** 启动后就开始授予：

/[frameworks](http://androidxref.com/8.1.0_r33/xref/frameworks/)/[base](http://androidxref.com/8.1.0_r33/xref/frameworks/base/)/[services](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/)/[core](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/)/[java](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/)/[com](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/)/[android](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/)/[server](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/server/)/[pm](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/server/pm/)/[PackageManagerService.java](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/server/pm/PackageManagerService.java)

```java
    public void systemReady() {
        synchronized (mPackages) {
            ArrayList<PreferredActivity> removed = new ArrayList<PreferredActivity>();
            ... ...
            // Begin ...
            for (PackageParser.Package pkg : mPackages.values()) {
                if ("com.aptiv.helloworld".equals(pkg.packageName)) {
                    pkg.requestedPermissions.add(Manifest.permission.SEND_SMS); // 未在 manifest 中声明
                    grantRuntimePermission(pkg.packageName, Manifest.permission.SEND_SMS, 0);
                    // 如下已在 manifest 中声明
                    grantRuntimePermission(pkg.packageName, Manifest.permission.READ_CONTACTS, 0);
                    grantRuntimePermission(pkg.packageName, Manifest.permission.CAMERA, 0);
                    grantRuntimePermission(pkg.packageName, Manifest.permission.CALL_PHONE, 0);

                    Log.i(TAG, "NFC: " + checkPermission(Manifest.permission.NFC, "com.aptiv.helloworld", 0));
                    Log.i(TAG, "INTERNET: " + checkPermission(Manifest.permission.INTERNET, "com.aptiv.helloworld", 0));
                    Log.i(TAG, "CAMERA: " + checkPermission(Manifest.permission.CAMERA, "com.aptiv.helloworld", 0));
                    Log.i(TAG, "READ_CONTACTS: " + checkPermission(Manifest.permission.READ_CONTACTS, "com.aptiv.helloworld", 0));
                    Log.i(TAG, "SEND_SMS: " + checkPermission(Manifest.permission.SEND_SMS, "com.aptiv.helloworld", 0));

                }
            }
            // End ...
            ... ...
    }
```

并可通过 **checkPermission** 方法检查权限是否添加成功，也可通过 Settings - Apps - xxx - Permissions 检查对应权限开关是否打开: 

```java
    public int checkPermission(String permName, String pkgName, int userId) {
        if (!sUserManager.exists(userId)) {
            return PackageManager.PERMISSION_DENIED;
        }
        final int callingUid = getCallingUid();

        synchronized (mPackages) {
            final PackageParser.Package p = mPackages.get(pkgName);
            if (p != null && p.mExtras != null) {
                final PackageSetting ps = (PackageSetting) p.mExtras;
                if (filterAppAccessLPr(ps, callingUid, userId)) {
                    return PackageManager.PERMISSION_DENIED;
                }
                final boolean instantApp = ps.getInstantApp(userId);
                final PermissionsState permissionsState = ps.getPermissionsState();
                if (permissionsState.hasPermission(permName, userId)) {
                    if (instantApp) {
                        BasePermission bp = mSettings.mPermissions.get(permName);
                        if (bp != null && bp.isInstant()) {
                            return PackageManager.PERMISSION_GRANTED;
                        }
                    } else {
                        return PackageManager.PERMISSION_GRANTED;
                    }
                }
                // Special case: ACCESS_FINE_LOCATION permission includes ACCESS_COARSE_LOCATION
                if (Manifest.permission.ACCESS_COARSE_LOCATION.equals(permName) && permissionsState
                        .hasPermission(Manifest.permission.ACCESS_FINE_LOCATION, userId)) {
                    return PackageManager.PERMISSION_GRANTED;
                }
            }
        }

        return PackageManager.PERMISSION_DENIED;
    }
```



#### 4.2 添加安装时权限

[PackageManagerService.java](http://androidxref.com/8.1.0_r33/xref/frameworks/base/services/core/java/com/android/server/pm/PackageManagerService.java) 会在 APP 安装时解析其中的 Manifest 文件，并会把其中声明的 permission 添加到一个 requestedPermissions Arraylist中:

[frameworks](http://androidxref.com/8.1.0_r33/xref/frameworks/)/[base](http://androidxref.com/8.1.0_r33/xref/frameworks/base/)/[core](http://androidxref.com/8.1.0_r33/xref/frameworks/base/core/)/[java](http://androidxref.com/8.1.0_r33/xref/frameworks/base/core/java/)/[android](http://androidxref.com/8.1.0_r33/xref/frameworks/base/core/java/android/)/[content](http://androidxref.com/8.1.0_r33/xref/frameworks/base/core/java/android/content/)/[pm](http://androidxref.com/8.1.0_r33/xref/frameworks/base/core/java/android/content/pm/)/[PackageParser.java](http://androidxref.com/8.1.0_r33/xref/frameworks/base/core/java/android/content/pm/PackageParser.java)

```java
    private Package parseBaseApk(File apkFile, AssetManager assets, int flags)
            throws PackageParserException {//start...
        final String apkPath = apkFile.getAbsolutePath();
        ... ...
        final int cookie = loadApkIntoAssetManager(assets, apkPath, flags);

        Resources res = null;
        XmlResourceParser parser = null;
        try {
            res = new Resources(assets, mMetrics, null);
            parser = assets.openXmlResourceParser(cookie, ANDROID_MANIFEST_FILENAME); // 解析AndroidManifest.xml

            final String[] outError = new String[1];
            final Package pkg = parseBaseApk(apkPath, res, parser, flags, outError);
            if (pkg == null) {
                throw new PackageParserException(mParseError,
                        apkPath + " (at " + parser.getPositionDescription() + "): " + outError[0]);
            }
        ...
    }
```

```java
    private Package parseBaseApk(String apkPath, Resources res, XmlResourceParser parser, int flags,
            String[] outError) throws XmlPullParserException, IOException {
        final String splitName;
        final String pkgName;
        ...
        return parseBaseApkCommon(pkg, null, res, parser, flags, outError);
    }
```

```java
    private Package parseBaseApkCommon(Package pkg, Set<String> acceptedTags, Resources res,
            XmlResourceParser parser, int flags, String[] outError) throws XmlPullParserException,
            IOException {
            ...
            String tagName = parser.getName();
            ...
            } else if (tagName.equals(TAG_USES_PERMISSION)) {
                if (!parseUsesPermission(pkg, res, parser)) {
                    return null;
                }
            } else if (tagName.equals(TAG_USES_PERMISSION_SDK_M)
                    || tagName.equals(TAG_USES_PERMISSION_SDK_23)) {
                if (!parseUsesPermission(pkg, res, parser)) {
                    return null;
                }
            ...
    }
```



```java
    private boolean parseUsesPermission(Package pkg, Resources res, XmlResourceParser parser)
            throws XmlPullParserException, IOException {
        TypedArray sa = res.obtainAttributes(parser,
                com.android.internal.R.styleable.AndroidManifestUsesPermission);

        ... ...

        int index = pkg.requestedPermissions.indexOf(name);

        if (index == -1) {
            pkg.requestedPermissions.add(name.intern()); // 
        } else {
            Slog.w(TAG, "Ignoring duplicate uses-permissions/uses-permissions-sdk-m: "
                    + name + " in package: " + pkg.packageName + " at: "
                    + parser.getPositionDescription());
        }
        return true;
    }
```

若想添加 install 权限，只需在安装 APP 解析权限的时候把需要的权限添加上即可：

```java
import android.Manifest;
    private boolean parseUsesPermission(Package pkg, Resources res, XmlResourceParser parser)
            throws XmlPullParserException, IOException {
        TypedArray sa = res.obtainAttributes(parser,
                com.android.internal.R.styleable.AndroidManifestUsesPermission);

        ... ...
        // Begin ...
        if ("com.aptiv.helloworld".equals(pkg.packageName)) {
            pkg.requestedPermissions.add(Manifest.permission.NFC);
            pkg.requestedPermissions.add(Manifest.permission.INTERNET);
        }
        // End ...
        int index = pkg.requestedPermissions.indexOf(name);

        if (index == -1) {
            pkg.requestedPermissions.add(name.intern()); // 把AndroidManifest.xml 中的 <uses-permission> 添加到 requestedPermissions 中
        } else {
            Slog.w(TAG, "Ignoring duplicate uses-permissions/uses-permissions-sdk-m: "
                    + name + " in package: " + pkg.packageName + " at: "
                    + parser.getPositionDescription());
        }
        return true;
    }
```

同样可通过 **checkPermission** 方法检查权限是否添加成功。

### 5. 应用

``` java
	private final static int MY_PERMISSIONS_REQUEST_CODE = 0x1000;
	// 所需申请的权限，需在 Manifest 中声明
    private static String[] PERMISSION_GROUP = {
            Manifest.permission.READ_CALENDAR,
            Manifest.permission.READ_EXTERNAL_STORAGE
    };

	// 申请权限
    public void checkPermissions() {
        Log.i(TAG, "checkPermissions");
        if (checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(PERMISSION_GROUP, MY_PERMISSIONS_REQUEST_CODE);
        }
    }

	// 申请后会回调此方法
    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        //super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        switch (requestCode) {
            case MY_PERMISSIONS_REQUEST_CODE:
                Log.i(TAG, "permissions.length: " + permissions.length + ", results.length: " + grantResults.length);
                for (int i = 0; i < permissions.length || i < grantResults.length; i++) {
                    Log.i(TAG, "permissions[" + i + "] : " + grantResults[i]);
                    if (shouldShowRequestPermissionRationale(permissions[i])) {
                        // 申请过权限但是被拒绝了，没有勾选 "不再提示" 的 checkbox
                        permissionStr.append("[").append(permissions[i]).append("] ");
                    }
                }
                showWaringDialog(permissionStr);
                break;
        }
    }

    private void showWaringDialog(StringBuilder str) {

        Log.i(TAG, "str.length: " + str.length() + "str: " + str);
        if (str.length() != 0) {
            AlertDialog dialog = new AlertDialog.Builder(this)
                    .setTitle("警告！")
                    .setMessage("需要 " + str + "权限，请前往设置->应用->CalendarDemo->权限中打开相关权限，否则功能无法正常运行！")
                    .setCancelable(false)
                    .setPositiveButton("确定", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            // TODO sth. when click Ok
                            // 一般情况下如果用户不授权的话，功能是无法运行的，做退出处理
                            //finish();
                        }
                    })
                    .setNegativeButton("取消", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            // TODO sth. when click Cancel
                        }
                    })
                    .create();
            dialog.show();
        }
    }
```

