---
title: 获取目录及子目录中指定信息到excel
copyright: true
date: 2017-08-05 11:39:04
tags:
categories: Python
password:
---

> 随手帮同学写了个脚本实现个简单的功能，在指定目录已经子目录中所有文件中获取指定信息输出到Excel，代码如下：

<!--more-->

``` python
#-*- coding: UTF-8 -*- 

import fnmatch
import os
import re
import xlrd
import xlwt

def fnmatch_filter_demo(path,pattern):
        writefile = r'D:\\debug\\test\\test.xls'
        wb = xlwt.Workbook()
        ws = wb.add_sheet('Sheet Test')
        wb.save(writefile)

        # 获取目录及子目录文件
        for path,dir,filelist in os.walk(path):
            for name in fnmatch.filter(filelist,pattern):
                child = os.path.join(path,name)
                fread=open(child, 'r')

                # 获取当前Excel行数
                data = xlrd.open_workbook(writefile)
                sh = data.sheet_by_name(u"Sheet Test")
                nrows = sh.nrows
                # print(nrows) # 打印当前Excel行数

                # 把关键字所在行写入到Excel
                for eachLine in fread:
                    if '开始' in eachLine:
                        ws.write(nrows, 0, child)
                        ws.write(nrows, 1, eachLine)
                        wb.save(writefile)
                    if '结束' in eachLine:
                        ws.write(nrows, 2, eachLine)
                        wb.save(writefile)

if __name__ == '__main__':
    fnmatch_filter_demo("D:\\debug\\test\\","*txt*") 

#其他截取操作
#str = ’0123456789′
#print str[0:3] #截取第一位到第三位的字符
#print str[:] #截取字符串的全部字符
#print str[6:] #截取第七个字符到结尾
#print str[:-3] #截取从头开始到倒数第三个字符之前
#print str[2] #截取第三个字符
#print str[-1] #截取倒数第一个字符
#print str[::-1] #创造一个与原字符串顺序相反的字符串
#print str[-3:-1] #截取倒数第三位与倒数第一位之前的字符
#print str[-3:] #截取倒数第三位到结尾
#print str[:-5:-3] #逆序截取，具体啥意思没搞明白？
#pip install xlutils
#pip install xlrd
#pip install xlwt
#pip install 
```

