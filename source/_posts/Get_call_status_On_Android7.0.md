---
title: Android7.0获取通话状态
copyright: true
date: 2017-08-31 14:03:52
tags:
categories: Frameworks
password:
---

> 有时候有监听童话状态的需求，Android7.0 获取通话状态的方式有如下几种：

<!--more-->

#### 1 通过phoneStateListener监听电话状态

``` java
            TelephonyManager tm = (TelephonyManager) mContext.getSystemService(Context.TELEPHONY_SERVICE);
            PhoneStateListener listener = new PhoneStateListener(){
                @java.lang.Override
                public void onCallStateChanged(int state, String incomingNumber) {
                    super.onCallStateChanged(state, incomingNumber);
                    switch (state) {
                        case TelephonyManager.CALL_STATE_RINGING:
                        case TelephonyManager.CALL_STATE_OFFHOOK:
                            SystemProperties.set("sys.thermal.isincall", "1");
                            Slog.d("zrlog", "LS-84-sys.thermal.isincall = " + SystemProperties.get("sys.thermal.isincall"));
                            break;
                        case TelephonyManager.CALL_STATE_IDLE:
                            SystemProperties.set("sys.thermal.isincall", "0");
                            Slog.d("zrlog", "LS-89-sys.thermal.isincall = " + SystemProperties.get("sys.thermal.isincall"));
                            break;
                    }
                }
            };
            tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE);
```

#### 2 通过TelecomManager中的接口监听

##### 2.1 isInCall()函数

``` java
    /**
     * Returns whether there is an ongoing phone call (can be in dialing, ringing, active or holding
     * states).
     * <p>
     * Requires permission: {@link android.Manifest.permission#READ_PHONE_STATE}
     * </p>
     */
    @RequiresPermission(android.Manifest.permission.READ_PHONE_STATE)
    public boolean isInCall() {
        try {
            if (isServiceConnected()) {
                return getTelecomService().isInCall(mContext.getOpPackageName());
            }
        } catch (RemoteException e) {
            Log.e(TAG, "RemoteException calling isInCall().", e);
        }
        return false;
    }
```

##### 2.2 getCallState()函数

``` java
    /**
     * Returns one of the following constants that represents the current state of Telecom:
     *
     * {@link TelephonyManager#CALL_STATE_RINGING}
     * {@link TelephonyManager#CALL_STATE_OFFHOOK}
     * {@link TelephonyManager#CALL_STATE_IDLE}
     *
     * Note that this API does not require the
     * {@link android.Manifest.permission#READ_PHONE_STATE} permission. This is intentional, to
     * preserve the behavior of {@link TelephonyManager#getCallState()}, which also did not require
     * the permission.
     * @hide
     */
    @SystemApi
    public int getCallState() {
        try {
            if (isServiceConnected()) {
                return getTelecomService().getCallState();
            }
        } catch (RemoteException e) {
            Log.d(TAG, "RemoteException calling getCallState().", e);
        }
        return TelephonyManager.CALL_STATE_IDLE;
    }
```



#### 3  通过NotificationManagerServices监听广播

``` java
    private final BroadcastReceiver mIntentReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();

            if (action.equals(Intent.ACTION_SCREEN_ON)) { // 亮屏广播
                // Keep track of screen on/off state, but do not turn off the notification light
                // until user passes through the lock screen or views the notification.
                mScreenOn = true;
                updateNotificationPulse();
            } else if (action.equals(Intent.ACTION_SCREEN_OFF)) { // 灭屏广播
                mScreenOn = false;
                updateNotificationPulse();
            } else if (action.equals(TelephonyManager.ACTION_PHONE_STATE_CHANGED)) {
                // 电话状态变化广播
                mInCall = TelephonyManager.EXTRA_STATE_OFFHOOK.equals(intent.getStringExtra(TelephonyManager.EXTRA_STATE));
                updateNotificationPulse();
            } else if (action.equals(Intent.ACTION_USER_STOPPED)) {
                int userHandle = intent.getIntExtra(Intent.EXTRA_USER_HANDLE, -1);
                if (userHandle >= 0) {
                    cancelAllNotificationsInt(MY_UID, MY_PID, null, 0, 0, true, userHandle,
                            REASON_USER_STOPPED, null);
                }
            } else if (action.equals(Intent.ACTION_MANAGED_PROFILE_UNAVAILABLE)) {
                int userHandle = intent.getIntExtra(Intent.EXTRA_USER_HANDLE, -1);
                if (userHandle >= 0) {
                    cancelAllNotificationsInt(MY_UID, MY_PID, null, 0, 0, true, userHandle,
                            REASON_PROFILE_TURNED_OFF, null);
                }
            } else if (action.equals(Intent.ACTION_USER_PRESENT)) {
                // turn off LED when user passes through lock screen
                mNotificationLight.turnOff();
                if (mStatusBar != null) {
                    mStatusBar.notificationLightOff();
                }
            } else if (action.equals(Intent.ACTION_USER_SWITCHED)) {
                final int user = intent.getIntExtra(Intent.EXTRA_USER_HANDLE, UserHandle.USER_NULL);
                // reload per-user settings
                mSettingsObserver.update(null);
                mUserProfiles.updateCache(context);
                // Refresh managed services
                mConditionProviders.onUserSwitched(user);
                mListeners.onUserSwitched(user);
                mRankerServices.onUserSwitched(user);
                mZenModeHelper.onUserSwitched(user);
            } else if (action.equals(Intent.ACTION_USER_ADDED)) {
                mUserProfiles.updateCache(context);
            } else if (action.equals(Intent.ACTION_USER_REMOVED)) {
                final int user = intent.getIntExtra(Intent.EXTRA_USER_HANDLE, UserHandle.USER_NULL);
                mZenModeHelper.onUserRemoved(user);
            } else if (action.equals(Intent.ACTION_USER_UNLOCKED)) {
                final int user = intent.getIntExtra(Intent.EXTRA_USER_HANDLE, UserHandle.USER_NULL);
                mConditionProviders.onUserUnlocked(user);
                mListeners.onUserUnlocked(user);
                mRankerServices.onUserUnlocked(user);
                mZenModeHelper.onUserUnlocked(user);
            } else if (action.equals(CarrierConfigManager.ACTION_CARRIER_CONFIG_CHANGED)) {
                mCarrierConfig = mConfigManager.getConfig();
            }
        }
    };
```

电话状态有3种，分别为RINGING、OFFHOOK、IDLE，来电时状态为RINGING，接通时状态为OFFHOOK，挂断后状态为IDLE，去电和去电接通时状态为OFFHOOK，挂断时状态为IDLE。

亮灭屏也可以在此处监听。