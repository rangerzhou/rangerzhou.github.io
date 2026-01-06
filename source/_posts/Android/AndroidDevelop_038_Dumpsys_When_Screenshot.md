---
title: Android - 截图触发抓取 Dumpsys 信息
date: 2024-06-28 23:18:26
tags:
categories: Android
copyright: true
password:
---

> Android 偶现窗口问题时抓取 dumpsys 信息
>

<!--more-->

------

当发生偶现问题的时候，经常会因为日志没有包含问题发生时的信息而导致需要重新复现抓取日志，对解决问题有很大的阻碍，所以针对这种情况及时的获取问题相关的信息就至关重要，我们这里讨论抓取问题发生时的 dympsys 信息。

原理：

- 当问题发生时，我们马上截图，而在截图的时候触发 dumpsys 信息抓取；
- 抓取 dympsys 信息需要一定的权限才能做到，我们想到使用 Shell 来帮我们操作；
- 所以整个过程设计到了 system_server(截屏所在进程)和 Shell 进程，system_server 需要跨进程告知 Shell 进程帮我们执行 dumpsys 命令，这里我们采用 ContentProvider 来实现这两个进程之间的 IPC 通信；

Patch 如下：

``` java

diff --git a/core/java/com/android/internal/util/ScreenshotHelper.java b/core/java/com/android/internal/util/ScreenshotHelper.java
index f4f438b1f601..e0fb0b2a080d 100644
--- a/core/java/com/android/internal/util/ScreenshotHelper.java
+++ b/core/java/com/android/internal/util/ScreenshotHelper.java
@@ -30,6 +30,7 @@ import android.os.UserHandle;
 import android.util.Log;
 import android.view.WindowManager;
 
+import java.util.ArrayList;
 import java.util.Objects;
 import java.util.function.Consumer;
 
@@ -441,6 +442,7 @@ public class ScreenshotHelper {
                         }
                     }
                 };
+                startDumpsys(mContext);
                 if (mContext.bindServiceAsUser(serviceIntent, conn,
                         Context.BIND_AUTO_CREATE | Context.BIND_FOREGROUND_SERVICE,
                         UserHandle.CURRENT)) {
@@ -462,7 +464,23 @@ public class ScreenshotHelper {
             }
         }
     }
-
+    void startDumpsys(Context context) {
+        new Thread(new Runnable() {
+            @Override
+            public void run() {
+                try {
+                    Bundle bundle = new Bundle();
+                    ArrayList<String> cmds = new ArrayList<>();
+                    cmds.add("dumpsys window windows");
+                    cmds.add("dumpsys activity containers");
+                    bundle.putStringArrayList("cmds",cmds);
+                    context.getContentResolver().call(Uri.parse("content://com.android.shellexecute"),"cmd","list",bundle);
+                }catch (Exception e) {
+                    e.printStackTrace();
+                }
+            }
+        }).start();
+    }
     /**
      * Unbinds the current screenshot connection (if any).
      */
diff --git a/packages/Shell/AndroidManifest.xml b/packages/Shell/AndroidManifest.xml
index 3b862ffbbd9e..768711e431ff 100644
--- a/packages/Shell/AndroidManifest.xml
+++ b/packages/Shell/AndroidManifest.xml
@@ -767,5 +767,10 @@
         <service
             android:name=".BugreportProgressService"
             android:exported="false"/>
+        <provider
+            android:authorities="com.android.shellexecute"
+            android:name=".ShellExcuteProvider"
+            android:exported="true"
+            ></provider>
     </application>
 </manifest>
diff --git a/packages/Shell/src/com/android/shell/ShellExcuteProvider.java b/packages/Shell/src/com/android/shell/ShellExcuteProvider.java
new file mode 100644
index 000000000000..7f065630ba5e
--- /dev/null
+++ b/packages/Shell/src/com/android/shell/ShellExcuteProvider.java
@@ -0,0 +1,89 @@
+package com.android.shell;
+
+import android.content.ContentProvider;
+import android.content.ContentValues;
+import android.database.Cursor;
+import android.net.Uri;
+import android.os.Bundle;
+
+import androidx.annotation.NonNull;
+import androidx.annotation.Nullable;
+
+
+
+import java.io.BufferedReader;
+import java.io.BufferedWriter;
+import java.io.File;
+import java.io.FileOutputStream;
+import java.io.InputStreamReader;
+import java.io.OutputStreamWriter;
+import java.util.ArrayList;
+
+public class ShellExcuteProvider extends ContentProvider {
+    @Override
+    public boolean onCreate() {
+        return false;
+    }
+
+    @Nullable
+    @Override
+    public Cursor query(@NonNull Uri uri, @Nullable String[] projection, @Nullable String selection, @Nullable String[] selectionArgs, @Nullable String sortOrder) {
+        return null;
+    }
+
+    @Nullable
+    @Override
+    public String getType(@NonNull Uri uri) {
+        return null;
+    }
+
+    @Nullable
+    @Override
+    public Uri insert(@NonNull Uri uri, @Nullable ContentValues values) {
+        return null;
+    }
+
+    @Override
+    public int delete(@NonNull Uri uri, @Nullable String selection, @Nullable String[] selectionArgs) {
+        return 0;
+    }
+
+    @Override
+    public int update(@NonNull Uri uri, @Nullable ContentValues values, @Nullable String selection, @Nullable String[] selectionArgs) {
+        return 0;
+    }
+
+    @Nullable
+    @Override
+    public Bundle call(@NonNull String method, @Nullable String arg, @Nullable Bundle extras) {
+        android.util.Log.i("test11","method = " + method + " arg = " + arg);
+        if ("cmd".equals(method)) {
+            try {
+                File file = new File("data/local/tmp/dumpsys-debug"+ System.currentTimeMillis()+".txt");
+                FileOutputStream outputStream = new FileOutputStream(file);
+                BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(outputStream));
+                ArrayList<String> cmds = extras.getStringArrayList("cmds");
+                if (cmds!= null && cmds.size() > 0) {
+                    for (String str:cmds) {
+                        Process p = Runtime.getRuntime().exec(str);
+                        BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(p.getInputStream()));
+                        String line = null;
+                        String strResult = null;//all
+                        while ((line = bufferedReader.readLine())!= null) {
+                            strResult += line + "\n";
+                            writer.write(line);
+                            writer.newLine();
+                        }
+                        android.util.Log.i("test11","strResult = " + strResult);
+                        bufferedReader.close();
+                    }
+
+                }
+                writer.close();
+            }catch (Exception e) {
+                e.printStackTrace();
+            }
+        }
+        return super.call(method, arg, extras);
+    }
+}
```

如果是在非手机/平板设备，比如车机，可以使用命令触发截屏事件从而抓取 dumpsys 信息；

``` shell
# 触发截屏事件
adb shell input keyevent 120
```



