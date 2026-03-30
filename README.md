# 🦸 BookmarkHero

> 你的数字记忆助手。让保存的每一条信息，在需要时都能以最短路径找到。

BookmarkHero 是一个智能 Chrome 书签管理扩展。不仅帮助你检测死链、清理空文件夹、合并重复项，更能提供基于当前网页的智能书签推荐，以及利用 AI 对积压书签进行自动分类。

## ✨ 核心特性

- **🩺 书签健康体检**: 极速扫描死链（4xx/5xx）、清理无用空文件夹。
- **🔄 智能去重合并**: 识别内容相同或 URL 参数差异的重复书签，建议合并方案。
- **📊 动态仪表盘**: 直观展示你的书签构成（域名分布、书签年龄等）。
- **⚡ 双界面设计**:
  - **Side Panel**: 轻量侧边栏，适合日常碎片化整理和"当前网页相关推荐"。
  - **Options**: 全屏选项页，适合全局数据分析和批量深度整理。

*(注：基于 AI 的自动分类和语义检索功能正在规划中，将在 Phase 2 推出。)*

## 🛠 技术栈

- **框架**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **构建**: [Vite 8](https://vitejs.dev/) + [CRXJS Vite Plugin](https://crxjs.dev/vite-plugin)
- **样式**: [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **状态管理**: [Zustand](https://zustand-demo.pmnd.rs/)

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 本地开发

启动带有 HMR (热更新) 支持的开发服务器：

```bash
npm run dev
```

1. 打开 Chrome 扩展管理页面 `chrome://extensions/`
2. 开启右上角的 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择项目根路径下的 `dist` 目录

*(开发期间代码变更后，扩展会自动重载)*

### 3. 生产构建

发布前进行生产环境打包：

```bash
npm run build
```
执行后，`dist` 文件夹即刻打包为可供发布或分发的 Chrome 扩展产物。

## 📝 开发进度

本项目正在通过 Phase 1-4 阶段逐步交付：
- [x] **Phase 1 (基础健康)**: 死链检测、空文件夹清理、重复去重。（开发中）
- [ ] **Phase 2 (AI 分类)**: 新书签自动分类，存量批量整理。
- [ ] **Phase 3 (智能检索)**: 结合向量数据库的语义化搜索和网页内推荐。
- [ ] **Phase 4 (知识网络)**: 数据看板强化和阅读习惯统计。

---

*由数字空间的探险家们打造，为每一位信息收藏家护航。*
