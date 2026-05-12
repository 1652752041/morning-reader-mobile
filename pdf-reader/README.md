# PDF 精读资料库 PWA

这是一个纯前端 PDF.js 阅读器，用来替代“不稳定的公众号链接抓取”。文件和标注都保存在本机浏览器 IndexedDB 中。GitHub Pages 版本通过免费 CDN 加载 PDF.js，不需要后端。

## 使用方式

1. 启动本地预览：
   ```bash
   cd "/Users/jiangyue/Documents/Codex/2026-05-07/app-1-2-3-4"
   python3 -m http.server 8090
   ```
2. 浏览器打开：
   `http://localhost:8090/pdf-reader-pwa/`
3. 点击“导入 PDF”，选择 PDF。
4. 在 PDF 页面中选中文本，再点击“高亮 / 划线 / 笔记 / 查词”。

## 手机使用

部署到 GitHub Pages 后，用 Safari 打开 HTTPS 地址，再选择“添加到主屏幕”。PWA 会像 App 一样打开。

## 说明

- 原 PDF 文件不会上传服务器。
- 标注、笔记、资料库保存在当前浏览器里。
- 微信公众号文章建议先用系统或第三方工具保存成 PDF，再导入这里阅读。
