# 🚀 BookmarkHero — Chrome Web Store 发布路线图

> 生成于 2026-03-30。按阶段顺序执行，每完成一项请打勾 `[x]`。

---

## Phase 0 · 代码卫生（约 2 小时）

> 不改功能，只清理代码质量问题，影响审核通过率。

### P0-1 移除生产环境日志

- [ ] **`src/background/index.ts` 第 15 行** — 删除 `console.log('[BookmarkHero] Background service worker started.')`
- [ ] 搜索全项目 `console.log`，将所有 background/core 层的日志改为条件输出:
  ```typescript
  // 替换为统一的 debug 工具
  const DEBUG = false; // 生产时改为 false
  if (DEBUG) console.log(...);
  ```
- [ ] `console.debug` 在 dead-link.scanner.ts 中也需要移除（HEAD fallback 那行）

### P0-2 生产构建验证

- [ ] 运行 `npm run build`，确认无报错
- [ ] 检查 `dist/` 目录，确认三个入口均已生成：
  - `dist/src/popup/index.html`
  - `dist/src/sidepanel/index.html`
  - `dist/src/options/index.html`
- [ ] 确认 `dist/` 目录大小 < 50MB（Chrome 商店限制）
- [ ] 打包 zip：`cd dist && zip -r ../bookmark-hero-v1.0.0.zip .`

---

## Phase 1 · 核心 Bug & 体验修复（约 1 天）

> 现有功能的体验缺口，上架前必须解决。

### P1-1 点击工具栏图标直接打开 Side Panel

**文件**：`src/background/index.ts`

- [ ] 取消注释第 13 行：
  ```typescript
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  ```
- [ ] 评估是否保留 Popup（现在 Popup 只有一个按钮，开启上面这行后 Popup 不会再弹出，可选择删除 Popup 相关代码以减少体积）

### P1-2 操作日志持久化（撤销删除的基础）

**背景**：`DeleteAction` 已封装了 `undo` 逻辑，但 `IssueList.tsx` 没有使用它，直接调用了 `removeBookmark`，导致：
1. 无 Undo 能力
2. 操作历史无记录（`STORAGE_KEYS.OPERATION_LOGS` 已定义未使用）

**文件**：`src/components/dashboard/IssueList.tsx`、`src/stores/scanner.store.ts`

- [ ] 新建 `src/stores/log.store.ts` — 管理操作历史：
  ```typescript
  interface OperationLog {
    id: string;
    timestamp: number;
    action: 'delete';
    bookmarkTitle: string;
    bookmarkUrl?: string;
    folderPath?: string;
    undoInfo: UndoInfo; // 来自 DeleteAction
  }
  ```
- [ ] `IssueList.tsx` 删除操作改为调用 `DeleteAction.execute()`，执行后将 `UndoInfo` 写入 log store
- [ ] Log store 使用 `persist` 中间件持久化到 `chrome.storage.local`（key: `STORAGE_KEYS.OPERATION_LOGS`）
- [ ] Options 页底部新增「操作历史」区域，展示最近 50 条记录，每条可点击「撤销」

### P1-3 死链检测 GET Fallback 优化

**文件**：`src/background/index.ts`

- [ ] GET fallback 请求加上 `Range: bytes=0-1023` 头，只取前 1KB 验证可达性，避免下载整个页面：
  ```typescript
  const getResponse = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: getController.signal,
    headers: { 'Range': 'bytes=0-1023' },
  });
  ```
- [ ] 同时加上 User-Agent，模拟浏览器请求减少被拦截的概率：
  ```typescript
  headers: {
    'Range': 'bytes=0-1023',
    'User-Agent': 'Mozilla/5.0 (compatible; BookmarkHero/1.0)',
  }
  ```

### P1-4 Side Panel 补充统计概览

**文件**：`src/sidepanel/SidePanel.tsx`

- [ ] Header 下方新增小型统计行（一行数字，不占太多空间）：
  ```
  📚 1,234 个书签  📁 56 个文件夹  ✅ 上次体检: 3分钟前
  ```
- [ ] 使用 `useBookmarkStore` 读取 `stats.totalBookmarks` / `stats.totalFolders`
- [ ] 用 `useScannerStore` 读取上次扫描的时间戳（需要在 results 中增加 `timestamp` 字段）

### P1-5 空文件夹删除安全性加固

**文件**：`src/components/dashboard/IssueList.tsx`

- [ ] 当前直接调用 `removeBookmarkTree()`，它能删除有内容的文件夹（危险！）
- [ ] 改为调用已有的 `DeleteAction.execute()`，其内部已有安全校验：拒绝删除有内容的文件夹

---

## Phase 2 · 品牌 & 视觉（约 0.5 天）

> 没有真实图标就无法提交审核。

### P2-1 设计品牌图标套件

- [ ] 设计或生成 BookmarkHero 图标（推荐：书签形状 + 英雄盾牌/闪电元素，深蓝或紫色主色调）
- [ ] 导出 4 个尺寸，PNG 格式，背景透明：
  - `public/icons/icon16.png`（16×16）
  - `public/icons/icon32.png`（32×32）
  - `public/icons/icon48.png`（48×48）
  - `public/icons/icon128.png`（128×128）
- [ ] 在 `manifest.json` 的 `action` 字段补充 `default_icon`：
  ```json
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png"
    }
  }
  ```

### P2-2 制作商店素材

- [ ] **商店截图 × 3**（1280×800 PNG）：
  1. Options 控制台全貌（含统计卡片 + 体检工具）
  2. 重复书签扫描结果详情展开状态
  3. Side Panel 侧边栏使用状态
- [ ] **宣传大图**（1400×560 PNG）：品牌图 + 一句话价值主张
- [ ] **小图标**（128×128，商店列表展示用，与扩展图标相同）

---

## Phase 3 · 合规 & 国际化（约 0.5 天）

> 法律合规 + 扩大用户覆盖。

### P3-1 隐私政策

- [ ] 撰写英文隐私政策，内容要点：
  - We do NOT collect any personal data
  - Bookmark data is processed locally in your browser
  - We do NOT transmit bookmark URLs to any server (except making HTTP HEAD requests to check if they are alive)
  - We use `chrome.storage.local` only for storing your preferences, locally
- [ ] 部署到公开 URL（推荐：GitHub Pages `BookmarkHero/privacy-policy.md`）
- [ ] 记录 URL，发布时填入 Developer Dashboard

### P3-2 manifest 补充合规字段

**文件**：`manifest.json`

- [ ] 补充 `homepage_url`：
  ```json
  "homepage_url": "https://github.com/你的用户名/BookmarkHero"
  ```
- [ ] 补充 `minimum_chrome_version`（推荐 120，Side Panel API 在此版本稳定）：
  ```json
  "minimum_chrome_version": "120"
  ```
- [ ] 显式声明 CSP：
  ```json
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
  ```
- [ ] 添加键盘快捷键：
  ```json
  "commands": {
    "_execute_side_panel": {
      "suggested_key": {
        "default": "Ctrl+Shift+B",
        "mac": "Command+Shift+B"
      },
      "description": "Open BookmarkHero Side Panel"
    }
  }
  ```

### P3-3 商店描述文案

- [ ] 撰写中文简介（≤132 字符）
- [ ] 撰写英文简介（≤132 字符）
- [ ] 撰写完整中文描述（功能介绍 + 使用场景 + 隐私承诺）
- [ ] 撰写完整英文描述

**参考英文简介**：
> BookmarkHero — Your smart bookmark doctor. Detect dead links, clean empty folders, and find duplicates in one click.

### P3-4 （可选）i18n 国际化

- [ ] 创建 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`
- [ ] `manifest.json` 中 name/description 改为 `__MSG_appName__` 格式
- [ ] UI 关键文字通过 `chrome.i18n.getMessage()` 获取

---

## Phase 4 · 发布操作（约 2 小时）

> 以上全部完成后执行。

### P4-1 Developer 账号准备

- [ ] 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [ ] 支付一次性注册费 **$5**（需 Google 账号）
- [ ] 完成开发者信息验证

### P4-2 最终构建与打包

```bash
# 1. 清理旧产物
rm -rf dist/

# 2. 生产构建
npm run build

# 3. 打包（在项目根目录）
cd dist && zip -r ../bookmark-hero-v1.0.0.zip . && cd ..
```

- [ ] 确认 zip 文件大小合理（应在 1-5MB 左右）

### P4-3 提交审核

- [ ] 在 Dashboard 创建新扩展条目
- [ ] 上传 `bookmark-hero-v1.0.0.zip`
- [ ] 填写：
  - 商店主题类别：`Productivity`（生产力工具）
  - 语言：Chinese（Simplified）和 English
  - 隐私政策 URL
  - 权限理由（`host_permissions <all_urls>`）：
    > "Used exclusively to perform HTTP HEAD requests to check if bookmarked URLs are still alive. No URL data is transmitted to any third-party server."
- [ ] 上传商店截图、宣传大图
- [ ] 设置发布范围：先设为「受信任测试者」，自测无问题后改为「全球公开」
- [ ] 提交审核（通常 3-7 个工作日）

---

## 进度追踪

| 阶段 | 预计耗时 | 状态 |
|------|---------|------|
| Phase 0 · 代码卫生 | 2h | ⬜ |
| Phase 1 · Bug & 体验修复 | 1d | ✅ 完成 |
| Phase 2 · 品牌 & 视觉 | 0.5d | ✅ 完成 |
| Phase 3 · 合规 & 国际化 | 0.5d | ✅ 完成 |
| Phase 4 · 发布操作 | 2h | ✅ 完成 (已打包) |
| **合计** | **约 3 天** | |

---

*最后更新：2026-03-30*
