---
title: MPAndroidChart 用法
copyright: true
date: 2021-03-12 10:00:20
tags:
categories: Technical
password:
top:
---



## ScatterChart

``` java
    private void setScatterProperties() {
        xAxis = scatterChart.getXAxis();
        xAxis.setPosition(XAxis.XAxisPosition.BOTTOM);
        xAxis.setLabelRotationAngle(90);
        xAxis.setGranularityEnabled(true);
        xAxis.setGranularity(1f);
        xAxis.setAxisMinimum(0f);
        xAxis.setAxisMaximum(86400f); // 89400 为24小时的秒数
        scatterChart.setVisibleXRange(0, 35);
        xAxis.setLabelCount(35); // 左右分布是15，上下分布是35
        Log.d(TAG, "getLableCount: " + xAxis.getLabelCount());
        //xAxis.setDrawGridLines(false); // 是否绘制竖向网格线
        //xAxis.setValueFormatter(new XAxisValueFormatter(minTime));

        YAxis axisLeft = scatterChart.getAxisLeft();
        YAxis axisRight = scatterChart.getAxisRight();
        axisRight.setEnabled(false);
        axisLeft.setGranularityEnabled(true);
        axisLeft.setGranularity(1);
        axisLeft.setAxisMinimum(0);
        axisLeft.setAxisMaximum(eventIndexKeys.length);
        scatterChart.setVisibleYRange(0, 8, YAxis.AxisDependency.LEFT);
        axisLeft.setLabelCount(8);// Y 轴总共标签数（含原点），和setVisibleYRange 可保证 Y 轴不缩放
        axisLeft.setValueFormatter(new YAxisValueFormatter(eventIndexKeys));

        /*Legend legend = scatterChart.getLegend();
        legend.setVerticalAlignment(Legend.LegendVerticalAlignment.TOP);
        legend.setHorizontalAlignment(Legend.LegendHorizontalAlignment.LEFT);
        legend.setForm(Legend.LegendForm.CIRCLE);*/
        scatterChart.getLegend().setEnabled(false); // 不显示图例

        scatterChart.setExtraBottomOffset(10);
        //scatterChart.setVisibleYRangeMinimum(7, YAxis.AxisDependency.LEFT); // 值为标签个数即可
        //scatterChart.setVisibleXRangeMinimum(5);
        //scatterChart.setVisibleXRangeMaximum(10);
        //scatterChart.setNoDataText("NO DATA !!!");
        //scatterChart.setViewPortOffsets(1, 1, 1, 1);
        //scatterChart.setScaleXEnabled(false);
        //scatterChart.setVisibleYRange(0, 7, YAxis.AxisDependency.LEFT);
        //scatterChart.setVisibleXRange(10, 30);
        //scatterChart.setFitsSystemWindows(true);

        scatterChartDescription = scatterChart.getDescription();

    }
```



## RadarChart

``` java
...
```





## BubbleChart

``` java
    private void setBubbleProperties() {
        bubbleChart.setDrawBorders(false); // 图标周围边界一圈黑线
        bubbleChart.setDrawGridBackground(false); // 是否设置网格背景，如设置，默认为灰色
        bubbleChart.setGridBackgroundColor(Color.GRAY); // 网格背景颜色
        //bubbleChart.animateXY(2500, 1500); // 设置XY轴动画效果
        //bubbleChart.setVisibleXRangeMinimum(10); // 无需滚动即可查看 X 轴上不小于 10 的范围
        //bubbleChart.setVisibleYRangeMinimum(20, YAxis.AxisDependency.LEFT);
        //bubbleChart.setExtraOffsets(-5, 2, 2, 2); // 设置整个左边上下左右的偏移量（图各方向的边界和手机显示边界的距离），类似于 padding
        //bubbleChart.setVisibleYRangeMinimum(10, YAxis.AxisDependency.LEFT);
        bubbleChart.setTouchEnabled(true);
        bubbleChart.setDragEnabled(true);
        //bubbleChart.setVisibleXRange(0, 10);
        Legend legend = bubbleChart.getLegend();
        legend.setForm(Legend.LegendForm.CIRCLE);
        legend.setVerticalAlignment(Legend.LegendVerticalAlignment.TOP);
        legend.setHorizontalAlignment(Legend.LegendHorizontalAlignment.LEFT);

        XAxis xAxis = bubbleChart.getXAxis();
        xAxis.setGranularity(1); // 放大时轴的最小间隔
        xAxis.setPosition(XAxis.XAxisPosition.BOTTOM); // 设置 X 轴位置
        xAxis.setAxisMinimum(0); // 设置 X 轴最小值
        //xAxis.setAxisMaximum(100);
        //xAxis.setLabelCount(15); // 设置 X 轴标签个数，最大值为25
        Log.d(TAG, "labelCount: " + xAxis.getLabelCount());
        //xAxis.setLabelRotationAngle(90);

        YAxis axisLeft = bubbleChart.getAxisLeft();
        YAxis axisRight = bubbleChart.getAxisRight();
        axisRight.setEnabled(false); // 禁用右边 Y 轴
        axisLeft.setGranularity(1); // 放大时 Y 轴的最小间隔
        //axisLeft.setAxisMinimum(0f); // 设置 Y 轴最小值
        axisLeft.setLabelCount(10); // 设置左边 Y 轴标签个数


        Description description = bubbleChart.getDescription();
        description.setText("实时行为气泡图");
        description.setTextColor(Color.RED);
        Log.d(TAG, "position: " + description.getPosition() + ", width: " + bubbleChart.getWidth() + ", height: " + bubbleChart.getHeight());

    }
```

