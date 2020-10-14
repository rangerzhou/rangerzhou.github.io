---
title: Curl
copyright: true
date: 2018-06-13 13:27:04
tags:
categories: Technical
password:
top:
---



``` java
String[] msgDwnCmds = {"curl", MSG_DOWNLOAD_JSON_URL + "?secret=" + secret + "&device_id=" + device_id};
String msgDwnJson = getResult(msgDwnCmds);
    private String getResult(String[] cmds) {
        ProcessBuilder pb = new ProcessBuilder(cmds);
        pb.redirectErrorStream(true);
        Process p;
        StringBuilder sb = new StringBuilder();
        try {
            p = pb.start();
            BufferedReader br = null;
            String line = null;

            br = new BufferedReader(new InputStreamReader(p.getInputStream()));
            while ((line = br.readLine()) != null) {
                System.out.println("\t" + line);
                if (line.startsWith("{")) {
                    sb.append(line + "\n");
                }
            }

            br.close();
        } catch (IOException e) {
            // TODO Auto-generated catch block
            e.printStackTrace();
        }
        return sb.toString();
    }
```

