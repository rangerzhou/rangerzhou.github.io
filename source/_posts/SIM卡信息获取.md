---
title: SIM卡信息获取
copyright: true
date: 2017-08-15 16:17:48
tags:
categories: Android
password:
---

这几天帮同事看一个在小米手机电信送测时的需求，要求插卡时上报手机卡的信息，包括CDMAIMSI,LTEIMSI,MANUFACTURE,IMEI, NID, SID, ICCID, BASEID, MACID等等，由于现在大都是双卡双待，所以要获取每一个卡的信息。

<!--more-->

首先上传源码文件：[CSDN下载](http://download.csdn.net/download/guai8023/9934947) （[百度网盘](http://pan.baidu.com/s/1mify6LU) 密码: hfvz）

此文记录在获取这些信息时踩过的坑。

#### 1. 移动卡获取ICCID不全

移动卡的ICCID获取的信息不全，有的像898600只有6位，有的则是像898600760917有12位，而测试的联通卡和电信卡则获取正常，网上搜索发现有人也遇到这种情况，但是并没有卵用，没有一个人贴出原因和解决方案，只好自力更生跟进源码了。

```java
public String getSimIccid(int phoneId) {
    String iccid = "";
    Phone phone = getPhoneInstance(phoneId);
    int[] subid = SubscriptionManager.getSubId(phoneId);
    Log.d("RegistrationPairs", "subid.length = " + subid.length + ", subid[0] = " + subid[0]);
    if (mTelephonyMgr.isMultiSimEnabled()) {
        //iccid = mTelephonyMgr.getSimSerialNumber(subid[0]); // 这里是源代码获取的方式
        if (phone != null) {
            iccid = phone.getFullIccSerialNumber();
        }
    } else {
        iccid = mTelephonyMgr.getSimSerialNumber();
    }
    Log.d("RegistrationPairs", "getSimIccid-phoneId = " + phoneId + ", iccid = " + iccid);
    return TextUtils.isEmpty(iccid) ? "" : iccid;
}
```
这是我修复后的代码，原代码是通过`iccid = mTelephonyMgr.getSimSerialNumber(subid[0])` 获取的，继续看代码：

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[base](http://androidxref.com/7.1.1_r6/xref/frameworks/base/)/[telephony](http://androidxref.com/7.1.1_r6/xref/frameworks/base/telephony/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/telephony/java/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/base/telephony/java/android/)/[telephony](http://androidxref.com/7.1.1_r6/xref/frameworks/base/telephony/java/android/telephony/)/[TelephonyManager.java](http://androidxref.com/7.1.1_r6/xref/frameworks/base/telephony/java/android/telephony/TelephonyManager.java)

```java
    public String getSimSerialNumber(int subId) {
        try {
            IPhoneSubInfo info = getSubscriberInfo();
            if (info == null)
                return null;
            return info.getIccSerialNumberForSubscriber(subId, mContext.getOpPackageName());
        } catch (RemoteException ex) {
            return null;
        } catch (NullPointerException ex) {
            // This could happen before phone restarts due to crashing
            return null;
        }
    }
```

调用到PhoneSubInfoController.java中的`getIccSerialNumberForSubscriber` ，

 /[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[opt](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/)/[telephony](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/)/[src](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/android/)/[internal](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/android/internal/)/[telephony](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/android/internal/telephony/)/[PhoneSubInfoController.java](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/android/internal/telephony/PhoneSubInfoController.java) 

```java
    public String getIccSerialNumberForSubscriber(int subId, String callingPackage) {
        Phone phone = getPhone(subId);
        if (phone != null) {
            if (!checkReadPhoneState(callingPackage, "getIccSerialNumber")) {
                return null;
            }
            return phone.getIccSerialNumber();
        } else {
            loge("getIccSerialNumber phone is null for Subscription:" + subId);
            return null;
        }
    }
```

/[frameworks](http://androidxref.com/7.1.1_r6/xref/frameworks/)/[opt](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/)/[telephony](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/)/[src](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/)/[java](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/)/[com](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/)/[android](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/android/)/[internal](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/android/internal/)/[telephony](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/android/internal/telephony/)/[Phone.java](http://androidxref.com/7.1.1_r6/xref/frameworks/opt/telephony/src/java/com/android/internal/telephony/Phone.java) 

```java
    /**
     * Retrieves the serial number of the ICC, if applicable. Returns only the decimal digits before
     * the first hex digit in the ICC ID.
     */
    public String getIccSerialNumber() {
        IccRecords r = mIccRecords.get();
        return (r != null) ? r.getIccId() : null;
    }
```

同时在Phone.java中发现了另一个方法`getFullIccSerialNumber`：

```java
    /**
     * Retrieves the full serial number of the ICC (including hex digits), if applicable.
     */
    public String getFullIccSerialNumber() {
        IccRecords r = mIccRecords.get();
        return (r != null) ? r.getFullIccId() : null;
    }
```

看到这里就惊喜了，注意看注释，`getIccSerialNumber` 方法*Returns only the decimal digits before the first hex digit in the ICC ID* ，而`getFullIccSerialNumber` 是*including hex digits* ，所以移动卡获取的ICCID不完整是不是因为这个原因呢，经验证确实是这样，测试的移动卡iccid是898600f00917f9000784，只获取到了字母之前的十进制数，获取到12位的也是同理，最终修复方案为通过`PhoneFactory.getPhone(phoneId)` 获取Phone对象，然后调用Phone对象的`getFullIccSerialNumber()` 方法获取完整的iccid。

#### 2. 有一张卡状态还是无服务时就开始了自注册，导致信息错误

当插入双卡，有一张卡还是无服务的状态时就进行了自注册，导致插卡信息识别错误，后面部分信息就获取错误了，解决方案是在自注册之前判断是否有服务。

```java
private boolean isAllSimCardReady() {
    int numPhones = mTelephonyManager.getPhoneCount();
    boolean hasIccCard1 = mTelephonyManager.hasIccCard(SLOT1); // 判断卡槽1是否有卡
    boolean hasIccCard2 = mTelephonyManager.hasIccCard(SLOT2); // 判断卡槽2是否有卡
    Log.d(TAG, "RegistrationPairs-numPhones = " + numPhones + ", hasIccCard1 = " + hasIccCard1 + ", hasIccCard2 = " + hasIccCard2);

    if (hasIccCard1 && hasIccCard2 && numPhones > 1) {
        int[] subId0 = SubscriptionManager.getSubId(0);
        int[] subId1 = SubscriptionManager.getSubId(1);

      	// 判断2个卡槽中的卡是否有服务
        ServiceState ss0 = mTelephonyManager.getServiceStateForSubscriber(subId0[0]);
        ServiceState ss1 = mTelephonyManager.getServiceStateForSubscriber(subId1[0]);

        int simState0 = mTelephonyManager.getSimState(0);//Ready = 5
        int simState1 = mTelephonyManager.getSimState(1);//Ready = 5

        Log.d(TAG, "RegistrationPairs-simState0 = " + simState0 + ", simState1 = " + simState1
                + ", ss0.state = " + ss0.getState() + ", ss1.state = " + ss1.getState());
        if (simState0 == TelephonyManager.SIM_STATE_READY && simState1 == TelephonyManager.SIM_STATE_READY
                && ss0.getState() == ServiceState.STATE_IN_SERVICE && ss1.getState() == ServiceState.STATE_IN_SERVICE) {
            return true;
        }
    } else {
        for (int index = 0; index < numPhones; index++) {
            int simState = mTelephonyManager.getSimState(index);//Ready = 5
            if (simState == TelephonyManager.SIM_STATE_READY) {
                return true;
            }
        }
    }
    return false;
    }
```
这里要注意的是subId的获取，因为`getServiceStateForSubscriber` 的参数并不是固定的0和1，而是通过`getSubId` 获取的，之前坑在这里获取的状态老不对，包括getNetworkType、getDataNetworkType、getVoiceNetworkType这几个方法的参数也是一样。

