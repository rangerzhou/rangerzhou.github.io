---
title: HomeAssistant 集成和风天气
copyright: true
date: 2019-06-28 15:05:50
tags: HeWeather
categories: HASS
password:
top:
---

> HomeAssistant 接入和风天气。

<!--more-->

HA Version: 0.94.4

首先用京东帐号申请一个**和风API**，请注意，是京东万象平台，不是从风天气官网申请的 API

## 1. hf_weather 组件实现

### 1.1. 预览

![001](https://raw.githubusercontent.com/rangerzhou/git_resource/master/blog_resource/2019/HeWeather_001.PNG)

![002](https://raw.githubusercontent.com/rangerzhou/git_resource/master/blog_resource/2019/HeWeather_002.PNG)

### 1.2 下载组件

[下载组件](https://github.com/rangerzhou/HomeAssistant/tree/master/hf_weather) ,放入 HA 对应目录。

### 1.3. 配置 configurations.yaml

配置 configuration.yaml

``` yaml
weather:
  - platform: hf_weather
    name: hefengweather
    city: shanghai
    appkey: YOUR_API_KEY
```

启用 sun 组件

``` yaml
sun:
```

lovelace 启用天气卡片（首页右上角“配置 UI - 原始配置编辑器”）

``` yaml
# 引入自定义卡片hf_weather-card
resources:
  - type: module
    url: /local/custom-lovelace/hf_weather-card/hf_weather-card.js
  - type: module
    url: /local/custom-lovelace/hf_weather-card/hf_weather-more-info.js
# 在view里面的cards节点，增加天气卡片类型
views:
    path: default_view
    title: Home
    cards:
    ... ...
      - type: 'custom:hf_weather-card' # card类型
        entity: weather.hefengweather # entityid
        mode: daily # hourly按小时天气预报、daily按天天气预报，不设置则同时显示
        title: 和风天气 # 标题，不设置则使用entity的friendly_name
        icons: /local/custom-lovelace/hf_weather-card/icons/animated/  # 图标路径，不设置则采用cdn，结尾要有"/"
```

如果不从原始编辑器中添加，也可添加 ENTITY，在 entity 的编辑器中编辑如下：

``` yaml
entity: weather.hefengweather
icons: /local/custom-lovelace/hf_weather-card/icons/animated/
title: 和风天气
type: 'custom:hf_weather-card'
mode: hourly
```



## 2. HeWeather组件实现

![HeWeather](https://raw.githubusercontent.com/rangerzhou/git_resource/master/Hass_Resources/HeWeather.png)

### 2.1 下载组件

[下载组件](https://github.com/rangerzhou/HomeAssistant/tree/master/HeWeather) ，放入 HA 对应目录。

### 2.2 配置

编辑 [heweather.yaml](https://github.com/rangerzhou/HomeAssistant/blob/master/HeWeather/packages/heweather.yaml) ，填充对应 appkey ，

``` yaml
sensor:
  - platform: heweather
    city: shanghai
    appkey: 905195***************3627c7f781d
    ... ...
```

配置 configurations.yaml ，添加 packages：

``` yaml
homeassistant:
  ... ...
  customize: !include customize.yaml
  packages: !include_dir_named packages # 添加此行
```

### 2.3 HA 中添加 entity

``` yaml
  - cards:
      - entity: weather.localweather
        name: 上海天气
        type: weather-forecast
      - entities:
          - entity: sensor.remind
          - entity: sensor.hourly_forcast_3
          - entity: sensor.hourly_forcast_6
          - entity: sensor.hourly_forcast_9
        show_header_toggle: false
        title: 小时天气预报
        type: entities
      - entities:
          - entity: sensor.suggestion_air
          - entity: sensor.suggestion_comf
          - entity: sensor.suggestion_cw
          - entity: sensor.suggestion_drsg
          - entity: sensor.suggestion_flu
          - entity: sensor.suggestion_sport
          - entity: sensor.suggestion_trav
          - entity: sensor.suggestion_uv
        show_header_toggle: false
        title: 品质生活
        type: entities
      - entities:
          - entity: sensor.heweather_qlty
          - entity: sensor.heweather_no2
          - entity: sensor.heweather_pm25
          - entity: sensor.heweather_co
          - entity: sensor.heweather_so2
          - entity: sensor.heweather_o3
        show_header_toggle: false
        title: 本地空气质量
        type: entities
```

