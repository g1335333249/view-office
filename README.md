# View Office

View Office 是一个基于 Collabora Online CODE 的轻量级 Office 文档预览服务。调用方可以通过文件 URL 或文件流创建预览会话，前端只需要引入 `viewer-sdk.js` 即可在业务系统中嵌入文档预览。

支持预览：

- Word: `doc`, `docx`
- Excel: `xls`, `xlsx`
- PowerPoint: `ppt`, `pptx`
- PDF: `pdf`
- Text: `txt`

## 特性

- 单 Docker 镜像运行，内置 Node.js 预览网关和 Collabora Online CODE。
- 提供最小 WOPI Host，Collabora 通过 WOPI 读取临时文件。
- 支持 URL 预览和二进制文件流上传预览。
- 前端 SDK 可直接嵌入任意业务页面。
- 默认只读预览，不提供编辑、保存、锁、协同编辑能力。
- 默认隐藏 Collabora 顶部工具栏、首次介绍弹窗、反馈弹窗和加载页 CODE 品牌。
- Excel 保留底部 Sheet 切换；Word、PPT、PDF 保留底部页码/状态信息。
- URL 下载失败不会中断服务。
- URL 下载默认忽略不受信任的 HTTPS 证书。
- 支持预览临时文件自动清理。

## 快速开始

构建镜像：

```bash
docker build -t view-office:local .
```

本机启动：

```bash
docker run -d \
  --name view-office \
  --cap-add MKNOD \
  -p 3000:3000 \
  -p 9980:9980 \
  -v view-office-data:/data \
  view-office:local
```

打开 Demo：

```text
http://localhost:3000/demo/
```

健康检查：

```text
http://localhost:3000/health
```

## 部署给其他系统调用

部署到服务器并让其他机器访问时，推荐只传 `VIEW_OFFICE_HOST`，值为预览服务所在机器的 IP 或域名，不要带端口：

```bash
docker run -d \
  --name view-office \
  --cap-add MKNOD \
  -p 3000:3000 \
  -p 9980:9980 \
  -v view-office-data:/data \
  -e VIEW_OFFICE_HOST=192.168.1.100 \
  view-office:local
```

如果 3000 和 9980 经过不同网关或域名转发，可以手动指定完整地址：

```bash
docker run -d \
  --name view-office \
  --cap-add MKNOD \
  -p 3000:3000 \
  -p 9980:9980 \
  -v view-office-data:/data \
  -e PUBLIC_URL=http://your-host:3000 \
  -e WOPI_PUBLIC_URL=http://your-host:3000 \
  -e COLLABORA_PUBLIC_URL=http://your-host:9980 \
  -e aliasgroup1=http://your-host:3000 \
  view-office:local
```

也可以使用 Docker Compose：

```bash
docker compose up --build
```

## 前端 SDK

业务页面引入 SDK：

```html
<script src="http://192.168.1.100:3000/viewer-sdk.js"></script>
<div id="viewer" style="height: 720px"></div>
```

通过 URL 预览：

```html
<script>
  let session;

  async function openPreview() {
    session = await ViewOffice.preview({
      container: "#viewer",
      source: {
        type: "url",
        url: "https://example.com/demo.docx",
        fileName: "demo.docx",
        fileType: "docx"
      }
    });
  }

  openPreview();
</script>
```

通过文件对象预览：

```js
const session = await ViewOffice.preview({
  container: "#viewer",
  source: {
    type: "file",
    file,
    fileName: file.name,
    fileType: file.name.split(".").pop()
  }
});
```

关闭并清理当前预览：

```js
await ViewOffice.cleanup(session);
```

其中 `session` 是 `ViewOffice.preview()` 的返回值，包含 `fileId` 和 `viewerUrl` 等信息。清理接口实际使用 `session.fileId`，因此也可以直接调用：

```js
await ViewOffice.cleanup(session.fileId);
```

SDK 在切换新文件预览和页面离开时会尽量自动通知服务端清理临时文件。

## HTTP API

### URL 预览

```http
POST /api/preview/url
Content-Type: application/json
```

```json
{
  "url": "https://example.com/demo.pptx",
  "fileName": "demo.pptx",
  "fileType": "pptx"
}
```

### 文件流预览

```http
POST /api/preview/upload?fileName=demo.docx&fileType=docx
Content-Type: application/octet-stream
```

Body 使用原始二进制流。

### 清理预览文件

```http
POST /api/preview/:fileId/cleanup
```

或：

```http
DELETE /api/preview/:fileId/cleanup
```

## 常用配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | Node.js 预览网关端口 |
| `DATA_DIR` | `/data` | 临时文件和元数据目录 |
| `VIEW_OFFICE_HOST` | 空 | 预览服务 IP 或域名，不带端口 |
| `PUBLIC_URL` | `http://localhost:3000` | 浏览器访问预览网关的地址 |
| `WOPI_PUBLIC_URL` | `http://localhost:3000` | Collabora 访问 WOPI Host 的地址 |
| `COLLABORA_INTERNAL_URL` | `http://127.0.0.1:9980` | Node.js 网关访问 Collabora discovery 的地址 |
| `COLLABORA_PUBLIC_URL` | `http://localhost:9980` | 浏览器访问 Collabora iframe 的地址 |
| `MAX_UPLOAD_BYTES` | `524288000` | 上传和 URL 下载最大文件大小，默认 500MB |
| `IGNORE_HTTPS_ERRORS` | `true` | URL 下载时是否忽略不受信任 HTTPS 证书 |
| `PREVIEW_TTL_MS` | `86400000` | 临时文件保留时间，默认 24 小时 |
| `CLEANUP_INTERVAL_MS` | `86400000` | 遗留文件定时清理间隔，默认 24 小时 |
| `VIEW_OFFICE_LOGO_URL` | 空 | 自定义加载页 logo；未设置时使用内置默认 loading logo |
| `VIEW_OFFICE_BRAND_NAME` | 空 | 自定义加载页品牌名 |
| `VIEW_OFFICE_LOADING_TEXT` | `正在加载，请稍候...` | 自定义加载文案 |
| `COLLABORA_LOAD_TIMEOUT_SECS` | `600` | Collabora 文档加载超时 |
| `COLLABORA_CONVERT_TIMEOUT_SECS` | `600` | Collabora 文档转换超时 |
| `COLLABORA_CONNECTION_TIMEOUT_SECS` | `120` | Collabora 外部连接超时 |
| `COLLABORA_MEMPROPORTION` | `95.0` | Collabora 最大可用内存比例 |

自定义加载页品牌：

```bash
docker run -d \
  --name view-office \
  --cap-add MKNOD \
  -p 3000:3000 \
  -p 9980:9980 \
  -v view-office-data:/data \
  -e VIEW_OFFICE_HOST=192.168.1.100 \
  -e VIEW_OFFICE_LOGO_URL=http://192.168.1.100:3000/logo.png \
  -e VIEW_OFFICE_BRAND_NAME=文档预览 \
  -e VIEW_OFFICE_LOADING_TEXT=正在加载，请稍候... \
  view-office:local
```

## 文件清理

预览文件会临时保存在容器 `/data/files`。

- 前端关闭预览、切换新文件或页面离开时，会调用清理接口删除当前文件。
- 服务端启动时会执行一次过期文件清理。
- 服务端会按 `CLEANUP_INTERVAL_MS` 定期清理超过 `PREVIEW_TTL_MS` 的遗留文件。

浏览器异常关闭、网络中断等情况下，文件可能无法立即清理，但会被定时清理兜底删除。

## 注意事项

- 当前项目不包含鉴权，生产环境建议在网关层增加访问控制。
- 当前项目只面向预览场景，不实现保存、协同编辑、锁管理和历史版本。
- 外部业务系统引用 `viewer-sdk.js` 时不要写 `localhost`，应使用预览服务真实 IP 或域名。
- `9980` 端口是 Collabora iframe 访问端口，业务页面必须能访问该地址。
- 大文件或复杂 Office 文件的加载效果取决于 Collabora/LibreOfficeKit 和容器可用内存。
- 如果 Docker Desktop 内存过低，复杂 Word、Excel、PPT 可能加载失败，建议至少分配 4GB，复杂场景建议 8GB 或更高。

## 开源与许可证说明

本仓库代码是一个预览服务封装层，使用 Node.js 实现最小 WOPI Host、前端 SDK、Demo 页面和 Collabora Online CODE 容器定制脚本。

本项目 Docker 镜像基于 `collabora/code:latest` 构建。Collabora Online CODE、Collabora Office、LibreOfficeKit 及其相关资源分别遵循其上游开源许可证和品牌条款。使用、分发或商用前，请自行确认上游许可证、商标和品牌合规要求。

本项目中的 Collabora UI 隐藏和品牌定制仅用于预览型嵌入体验，不代表上游项目背书。
