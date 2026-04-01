# Privacy Policy / 隐私政策

**BookmarkHero Chrome Extension**

---

*English version below. / 中文版本见下方。*

---

## English

**Effective Date:** March 30, 2026 | **Last Updated:** April 1, 2026

Thank you for choosing BookmarkHero. We are committed to protecting your privacy. This policy explains how the BookmarkHero Chrome Extension handles your data.

### 1. Information We Collect

**A. Personal Information**
We do **NOT** collect, store, or transmit any personally identifiable information (PII). No account or registration is required.

**B. Bookmark Data**
BookmarkHero uses the `bookmarks` permission to read and manage your browser bookmarks.
- **Local processing only:** All analysis (dead link detection, duplicate finding, empty folder cleanup) runs entirely within your browser.
- **No data transmission:** Your bookmarks are never uploaded to our servers or any third-party servers.

**C. Network Requests for Dead Link Detection**
To verify whether a bookmarked URL is still active, the extension makes brief HTTP requests directly from your browser:
- Uses `HEAD` or truncated `GET` requests to check HTTP status codes only.
- No user context, cookies, or tracking identifiers are attached.

### 2. Permissions Used and Why

| Permission | Purpose |
|-----------|---------|
| `bookmarks` | Read your bookmark tree to detect issues and allow cleanup operations |
| `storage` | Save your preferences and operation history (undo log) locally on your device |
| `sidePanel` | Display the side-panel UI |
| `notifications` | Show desktop notifications when AI suggests moving a newly saved bookmark |
| `<all_urls>` | Allow the background service worker to make HTTP requests to bookmarked URLs for dead link detection |

### 3. AI Features & Data Privacy

**Gemini API (Cloud)**
If you use the Gemini cloud AI feature, the bookmark's title and URL are sent to Google's Gemini API to generate a folder suggestion. This is governed by [Google's Privacy Policy](https://policies.google.com/privacy). Your API key is stored locally and never sent to our servers.

**Ollama (Local)**
When using Ollama local AI mode, all data stays on your own machine. Nothing is transmitted externally.

### 4. Data Sharing

Because we do not collect your data, we do not sell, rent, or share it with any third parties, advertisers, or analytics platforms.

### 5. Changes to This Policy

We may update this policy from time to time. Significant changes will be communicated by updating the "Last Updated" date above.

### 6. Contact

For questions, please open an issue on GitHub:
[https://github.com/tatagee/BookmarkHero/issues](https://github.com/tatagee/BookmarkHero/issues)

---

## 中文版本

**生效日期：** 2026 年 3 月 30 日 | **最后更新：** 2026 年 4 月 1 日

感谢选择 BookmarkHero。我们致力于保护你的隐私。本政策说明 BookmarkHero Chrome 扩展如何处理你的数据。

### 1. 我们收集哪些信息

**A. 个人信息**
我们**不**收集、存储或传输任何个人可识别信息（PII）。使用本扩展无需注册账号。

**B. 书签数据**
BookmarkHero 使用 `bookmarks` 权限来读取和管理你的书签。
- **仅本地处理：** 所有分析（死链检测、重复查找、空文件夹清理）均在浏览器内完成。
- **不上传任何数据：** 你的书签不会被上传至我们的服务器或任何第三方服务器。

**C. 死链检测的网络请求**
为了验证书签链接是否仍然有效，扩展会直接从你的浏览器发起简短的 HTTP 请求：
- 仅使用 `HEAD` 或截断的 `GET` 请求来检查 HTTP 状态码。
- 不附带任何用户标识、Cookie 或追踪信息。

### 2. 权限用途说明

| 权限 | 用途 |
|------|------|
| `bookmarks` | 读取书签树，检测问题并执行清理操作 |
| `storage` | 在本地保存设置偏好和操作历史（撤销日志） |
| `sidePanel` | 显示侧边栏界面 |
| `notifications` | 当 AI 建议移动新保存的书签时，发送桌面通知 |
| `<all_urls>` | 允许后台服务向书签 URL 发起 HTTP 请求，用于死链检测 |

### 3. AI 功能与数据隐私

**Gemini API（云端）**
使用 Gemini 云端 AI 功能时，书签的标题和 URL 会发送至 Google Gemini API 以获取分类建议。这受 [Google 隐私政策](https://policies.google.com/privacy) 约束。你的 API Key 仅存储在本地，不会发送至我们的服务器。

**Ollama（本地）**
使用 Ollama 本地 AI 模式时，所有数据均留在你自己的设备上，不会对外传输。

### 4. 数据共享

由于我们不收集你的数据，我们不会将其出售、出租或以任何形式分享给第三方、广告商或分析平台。

### 5. 本政策的变更

我们可能会不定期更新本政策。重大变更将通过更新上方的"最后更新"日期来告知。

### 6. 联系我们

如有疑问，请在 GitHub 上提交 Issue：
[https://github.com/tatagee/BookmarkHero/issues](https://github.com/tatagee/BookmarkHero/issues)
