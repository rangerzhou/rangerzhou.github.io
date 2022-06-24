---
title: Android OpenGL 开发学习
date: 2021-12-01 10:35:09
tags:
categories: Android
copyright: true
password:
---

>
>
>Android OpenGL ES 开发学习。

<!--more-->

## 1. OpenGL 渲染流程

[OpenGL 渲染管线流程](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Render_Pipeline.png)

![OpenGL_Render_Pipeline](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Render_Pipeline.png "OpenGL渲染管线流程")



OpenGL 渲染管线也叫渲染流水线，一般是由显示芯片（GPU）内部处理图形信号的并行处理单元组成。这些并行处理单元量量之间是相互独立的，不同型号的硬件上独立处理单元的数量也有很大的差异。

OpenGL 渲染管线流程如上图所示，主要包括：**读取顶点数据 -> 顶点着色器 -> 图元装配 -> 光栅化图元 -> 片元着色器 -> 写入帧缓冲 -> 显示到屏幕上**，释义如下：

- 基本处理：设定 3D 空间中物体的顶点坐标、颜色、纹理坐标属性，指定绘制方式（点/线/三角形）；

- 读取顶点数据：将待绘制图形的顶点数据传递给渲染管线中（通常通过顶点缓冲对象的方式，节省 GPU I/O 带宽，提高渲染效率）；
- 顶点着色器：生成每个顶点的最终位置，执行顶点的各种变换（基础变换矩阵<旋转/平移/缩放>，相机视图矩阵，投影矩阵），会针对每个顶点执行一次，确定了最终位置后，OpenGL 就可以把这些顶点集合按照给定的参数类型组装成点、线或者三角形；
- 图元装配：图元装配包括两部分，图元组装和图元处理；
  - 图元组装：指顶点数据根据设置的绘制方式被结合成完整的图元，例如，点绘制方式每个顶点为一个图元，线绘制方式每两个顶点构成一个图元，三角形绘制方式三个顶点构成一个图元；
  - 图元处理：对图元进行剪裁，使得图元位于视景体内部的部分传递到后续步骤，视景体外部的部分剪裁丢弃；
- 光栅化图元：指的是将一个图元离散化成很多可显示的二维单元片段，这些小单元称为片元。一个片元对应屏幕上一个或多个像素，片元包括了位置、颜色、纹理坐标等信息，这些值是由图元的顶点信息进行插值计算得到的；
- 片元着色器：为每个片元生成最终的颜色，针对每个片元都会执行一次，一旦颜色确定，OpenGL 就会把他们写入到帧缓冲区中；

### 1.1 顶点着色器原理

[顶点着色器原理](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Principle_Vertex_Shader.png "顶点着色器原理")

![OpenGL_Principle_Vertex_Shader](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Principle_Vertex_Shader.png "顶点着色器原理")

### 1.2 片元着色器原理

[片元着色器原理](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Principle_Fragment_Shader.png)

![OpenGL_Principle_Fragment_Shader](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Principle_Fragment_Shader.png "片元着色器原理")



## 2. OpenGL 矩阵变换流程

首先了解几种不同的空间，主要包括：物体空间、世界空间、摄像机空间、裁剪空间、标准设备空间、实际窗口空间：

- 物体空间：或者叫局部空间，就是需要绘制的 3D 物体所在的原始坐标系代表的空间。例如，在设计时物体的中心是摆放到坐标系原点的，这个坐标系代表的就是物体空间。
- 世界空间：物体在最终 3D 场景中的摆放位置对应的坐标所属的坐标系代表的空间。比如要在[10,5,8] 位置摆放一个球，在 [20,8,9] 位置摆放一个正方体，这里的 [10,5,8] 和 [20,8,9] 两组坐标所属的坐标系代表的就是世界空间。
- 摄像机空间：物体经摄像机观察后，进入摄像机空间。指的是以观察场景的摄像机为原点的一个特定坐标系代表的空间。在这个坐标系中，摄像机永远位于原点，视线永远沿 z 轴负方向，y 轴方向与摄像机 UP 向量方向一致。但是相对于世界坐标系，摄像机坐标系可能是歪的或斜的，就像人眼观察世界时，若歪着头看，就感觉是物体斜了，其实物体在世界坐标系中是正的，只是经过眼睛观察后进入了眼睛（摄像机）坐标系里是歪的而已。
- 裁剪空间：物体即使被摄像机观察到进入了摄像机空间，如果有的部分位于视景体外部，也是看不到的，所以被摄像机观察到的，同时位于视景体外部的部分裁去，留下在视景体内部的物体部分，这部分构成了剪裁空间。
- 标准设备空间：将剪裁空间内的物体进行透视除法后得到的就是在标准设备空间的物体，需要注意的是对于 OpenGL ES 而言标准设备空间三个轴的坐标范围都是 -1.0~1.0。
- 实际窗口空间：就是视口对应的空间，代表设备屏幕上的一块矩形区域，其坐标以像素为单位，一般以 `glViewport(0, 0, width, height)` 设置。

从一个空间到另一个空间的变换就是通过乘以各种变换矩阵以及进行一些必要的计算来完成的，具体过程如下图：

[矩阵变换流程](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Matrix_Transformation_Process.png)

![OpenGL_Principle_Fragment_Shader](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Matrix_Transformation_Process.png "矩阵变换流程")

- 物体空间 ——> 世界空间：**乘以基本变换矩阵**实现，基本变换矩阵就是用于实现各种基本变换（缩放、平移、旋转）的矩阵；
- 世界空间 —— > 摄像机空间：**乘以摄像机观察矩阵（相机视图矩阵）**；
- 摄像机空间 ——> 裁剪空间：**乘以投影矩阵**，根据需求选择正交投影或透视投影的变换矩阵，乘以投影矩阵后，任何一个点的坐标 [x,y,z,w] 中的 x、y、z 分量都将在 -w~w 内，乘完后，物体就已经被投影在近平面上了，此时物体各个顶点的坐标不再是三维，而是二维，是对应在近平面上的位置；

**<font color = red>用户可以操作的为以上三个步骤，一旦物体投影到近平面后，之后的步骤就由渲染管线自动完成。</font>**

- 裁剪空间 ——> 标准设备空间：**执行透视除法**完成，将近平面上的物体顶点坐标化为标准设备空间中的 [-1,1] 坐标，就是将齐次坐标 [x,y,z,w] 的 4 个分量都除以 w，结果为 [x/w,y/w,z/w,1]，本质就是对齐次坐标进行了规范化；
- 标准设备空间 ——> 实际窗口空间：将执行透视除法后的 x、y 坐标分量转换为实际窗口的 xy 像素坐标；

上述每一步乘以不同矩阵以及进行响应计算产生的具体效果如下：

[矩阵变换效果](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Matrix_Transformation_Effect.png)

![OpenGL_Matrix_Transformation_Effect](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/OpenGL_Matrix_Transformation_Effect.png "矩阵变换效果")

[笛卡尔坐标系](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Cartesian_coordinates.png)

![Cartesian_coordinates](https://raw.githubusercontent.com/rangerzhou/ImageHosting/master/blog_resource/2022/Cartesian_coordinates.png "笛卡尔坐标系")

齐次坐标：齐次坐标简而言之就是用 N+1 维来代表 N 维坐标，在原有2D/3D笛卡尔坐标末尾加上一个额外的变量 w，就形成了 2D/3D 齐次坐标；齐次坐标是用来表示一个点在无穷远处（∞,∞），比如一个点 (1,2) 移动到无穷远处，在笛卡尔坐标下变为 (∞,∞)，那么它的齐次坐标表示为 (1,2,0)，因为 (1/0,2/0) = (∞,∞)，这样就可以不用 ∞ 来表示一个无穷远处的点了，[点击查看齐次坐标参考讲解](https://zhuanlan.zhihu.com/p/373969867)。

参考2：https://blog.csdn.net/tiandyoin/article/details/106039312

## 3. 顶点着色器的输入变量

顶点着色器中只能使用 in 限定符来修饰全局变量，其变量用来接收渲染管线传递进顶点着色器的当前待处理顶点的各种属性值，如顶点坐标、法向量、颜色、纹理坐标等。

### 1.1 将顶点属性值送入缓冲

``` java
// java
float vertices[]=new float[] {                                 // 首先将顶点此项属性数据依次放入数组，这里是顶点坐标
    -4*UNIT_SIZE,0,                                            // 第 1 个顶点的 X、Y、Z 坐标值
    0,0,-4*UNIT_SIZE,                                          // 第 2 个顶点的 X、Y、Z 坐标值
    0,4*UNIT_SIZE,0,0                                          // 第 3 个顶点的 X、Y、Z 坐标值
}
ByteBuffer vbb = ByteBuffer.allocateDirect(vertices.length*4)  // 开辟对应容量的缓冲
vbb.order(ByteOrder.nativeOrder())                             // 设置字节顺序为本地操作系统顺序
mVertexBuffer = vbb.asFloatBuffer()                            // 浮点(Float)型缓冲
mVertexBuffer.put(vertices)                                    // 将数组中的顶点数据送入缓冲
mVertexBuffer.position(0)                                      // 设置缓冲起始位置

```



``` kotlin
// kotlin
private var mVertexBuffer: FloatBuffer =
    ByteBuffer.allocateDirect(vertices.size * 4).run {
        order(ByteOrder.nativeOrder())
        asFloatBuffer().apply {
            put(triangleCoords)
            position(0)
        }
    }
```

首先将需要的数据依次放入数组，然后开辟对应容量的缓冲，最后将数组中的数据存入缓冲即可。随具体情况的变化，数据的数量、类型会有所不同。

### 1.2 将顶点属性数据送入渲染管线

``` java
int maPositionHandle                               // 声明顶点位置属性引用
maPositionHandle = GLES31.glGetAttribLocation(     // 获取顶点位置属性引用的值			
    mProgram,                                      // 采用的着色器程序id
    "aPosition")                                   // 着色器中对应的输入变量名称
GLES31.glVertexAttribPointer(                      // 将顶点位置数据传送进渲染管线
    maPositionHandle,                              // 顶点位置属性引用
    3,                                             // 每顶点一组的数据个数(这里是X、Y、Z 坐标，因此为3)
    GLES31.GL_FLOAT,                               // 数据类型
    false,                                         // 是否规格化
    3*4,                                           // 每组数据的尺寸，这里每组3 个浮点数值(X、Y、Z 坐标)，每个浮点数4 个字节,共3*4=12 个字节
    mVertexBuffer                                  // 存放了数据的缓冲
);
GLES31.glEnableVertexAttribArray(maPositionHandle) // 启用顶点位置数据
```

一般来说，将顶点数据传送进渲染管线需要调用 glVertexAttribPointer() 或者 glVertexAttribIPointer() 方法，前者浮点型数据，后者整型数据。

## 4. 片元着色器的输入变量

片元着色器中可以使用 in 或 centroid in 限定符来修饰全局变量，其变量用于接收来自顶点着色器的相关数据，最典型的是接收根据顶点着色器的顶点数据插值产生的片元数据。



## 5. 常用函数接口

### Matrix.setLookAtM()：摄像机的设置

``` kotlin
Matrix.setLookAtM(
	mVMatrix,               // 存储生成矩阵元素的float[]类型数组，即生成的摄像机观察矩阵（相机视图矩阵）
	0,                      // 填充起始偏移量
	eyeX, eyeY, eyeZ,             // 摄像机位置的 X、Y、Z 坐标 —— 摄像机在世界坐标系的位置
	centerX, centerY, centerZ,             // 观察目标点 X、Y、Z 坐标 —— 观察物体在世界坐标系的位置
	upX, upY, upZ           // 摄像机 up 向量在 X、Y、Z 轴上的分量 —— 摄像机顶端的指向，垂直于观察方向，在世界坐标系中的方向
);
```

观察目标点坐标和摄像机位置坐标一起决定了摄像机观察的方向，即向量(centerX - eyeX,centerY - eyeY,centerZ - eyeZ)，观察方向不朝向视景体是无法看到的。

- eyeX, eyeY, eyeZ：相当于你的头的具体坐标
- centerX, centerY, centerZ：眼睛要看的物体的坐标
- upX, upY, upZ：头的方向，头朝上（upY = 1），倒立（upY = -1），向右歪头90°看（upX = 1），向左歪头90°看（upX = -1），仰头看（upZ = 1，up 方向和观察方向平行，看不到东西），低头看（upZ = -1，up 方向和观察方向平行，看不到东西）

https://cloud.tencent.com/developer/article/1015587

### Matrix.orthoM()：正交投影的设置

正交投影效果是**远处近处看起来一样大**

``` kotlin
Matrix.orthoM(
	mProjMatrix, // 存储生成矩阵元素的 float[4*4] 类型数组，即生成的投影矩阵
	0, // 填充起始偏移量
	left, right, // 近平面 left、right 边的 x 坐标
	bottom, top, // 近平面 bottom、top 边的 y 坐标
	near, far // 近平面、远平面距离摄像机（视点）的距离
);
```

### Matrix.frustumM()：透视投影的设置

透视投影效果是**近大远小**

``` java
Matrix.frustumM(
	mProjMatrix, // 存储生成矩阵元素的 float[4*4] 类型数组，即生成的投影矩阵
	0, //填充起始偏移量
	left, right, //near 面的left、right
	bottom, top, //near 面的bottom、top
	near, far //near 面、far 面与视点的距离
);
```

### GLES30.glViewport()：设置视口

视口是显示屏上指定的矩形区域，x 和 y 是视口的左下角坐标值（x 轴向右，y 轴向上），后两个参数是矩形的宽高

``` java
GLES30.glViewport(x, y, width, height);		// 设置视口
```

### 平移、旋转、缩放

``` java
MatrixState.translate(3.5f, 0, 0); //沿x 方向平移3.5f
MatrixState.rotate(30, 0, 0, 1); //绕z 轴旋转30°
MatrixState.scale(0.4f, 2f, 0.6f); //x、y、z 3 个方向按各自的缩放因子进行缩放
```

### mix()：插值

``` kotlin

genType mix(genType x,genType y,float a)
```

`mix()`是一个特殊线性插值函数，前两个参数值基于第三个参数插值，即`(x * (1-a) + y * a)`，简单理解就是 a 的值决定了 x 和 y 的强弱关系，a 的取值范围在 [0,1] 之间，a 值越大，结果值中 y 占比会越大；a 值越小，结果值中 y 占比会越小；



