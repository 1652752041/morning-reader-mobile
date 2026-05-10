# 晨读精读手机端

这是一个不依赖本地后端的手机端 PWA 原型，适合 iPhone Safari 添加到主屏幕。

功能：

- 粘贴导入英文文章、公众号讲解、PDF 复制文本
- 自动识别英文段落、中文翻译、重点解析和词汇释义
- 系统英文朗读、上一句、下一句、阅读进度
- 可填写合法取得的音频链接作为人工音频
- 划词后跳转欧路词典
- 本地生词本和阅读库
- 离线缓存静态页面

本地预览：

```bash
cd mobile
python3 -m http.server 9000
```

然后打开 `http://localhost:9000`。

也可以在上一层目录双击 `启动手机端预览.command`。

iPhone 使用：

1. 把 `mobile/` 部署到 GitHub Pages、Cloudflare Pages、Netlify 或任意静态网页托管。
2. iPhone Safari 打开部署后的网址。
3. 分享按钮 -> 添加到主屏幕。

版权边界：只导入你自己合法取得的学习材料。这个 App 不自动下载非官方外刊 PDF 或音频。
