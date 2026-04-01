# 🦸 BookmarkHero

> Your intelligent bookmark management superhero for Chrome.
> 你的智能 Chrome 书签管理助手。

BookmarkHero is a powerful Chrome extension that helps you detect dead links, clean up empty folders, merge duplicates, and intelligently organize your bookmarks with AI assistance.

BookmarkHero 是一个强大的 Chrome 扩展，帮助你检测死链、清理空文件夹、合并重复书签，并通过 AI 智能分类整理你的书签。

---

## ✨ Features / 核心特性

| Feature | 功能 |
|---------|------|
| 🩺 **Health Check** — Scan dead links (4xx/5xx) and clean empty folders | **书签体检** — 检测死链，清理空文件夹 |
| 🔄 **Duplicate Detection** — Find and merge bookmarks with identical URLs | **智能去重** — 发现并合并重复书签 |
| 🤖 **AI Classification** — Auto-classify bookmarks using Gemini API or local Ollama | **AI 分类** — 通过 Gemini 或本地 Ollama 自动整理分类 |
| 📊 **Dashboard** — Visual bookmark health stats with undo history | **动态看板** — 直观统计 + 操作日志与撤销 |
| ⚡ **Dual Interface** — Side Panel for quick actions, Options for deep analysis | **双界面** — 侧边栏快速操作，选项页深度分析 |

---

## 🛠 Tech Stack / 技术栈

- **Framework / 框架**: React 19 + TypeScript
- **Build / 构建**: Vite + CRXJS Vite Plugin
- **Styling / 样式**: Tailwind CSS + shadcn/ui
- **State / 状态管理**: Zustand
- **AI**: Google Gemini API / Ollama (local / 本地)

---

## 🚀 Getting Started / 快速开始

### 1. Install dependencies / 安装依赖

```bash
npm install
```

### 2. Local development / 本地开发

```bash
npm run dev
```

Then load the extension in Chrome / 然后在 Chrome 中加载扩展：

1. Open `chrome://extensions/` / 打开 `chrome://extensions/`
2. Enable **Developer mode** / 开启右上角 **开发者模式**
3. Click **Load unpacked** / 点击 **加载已解压的扩展程序**
4. Select the `dist` folder / 选择项目根目录下的 `dist` 文件夹

### 3. Production build / 生产构建

```bash
npm run build
```

### 4. Run tests / 运行测试

```bash
npm run test
```

---

## 📝 Roadmap / 开发进度

- [x] **Phase 1** — Dead link detection, empty folder cleanup, duplicate merging / 死链检测、空文件夹清理、重复去重
- [x] **Phase 2** — AI-powered bookmark classification (Gemini + Ollama) / AI 书签分类（Gemini + Ollama）
- [ ] **Phase 3** — Semantic search & in-page recommendations / 语义搜索与网页内推荐
- [ ] **Phase 4** — Enhanced analytics & reading habit insights / 数据看板强化与阅读习惯分析

---

## 📄 Legal / 法律文件

- [Privacy Policy / 隐私政策](https://tatagee.github.io/BookmarkHero/privacy-policy.html)
- [Terms of Service / 使用条款](./terms-of-service.md)

---

*Built for every digital collector. / 为每一位信息收藏家打造。*
