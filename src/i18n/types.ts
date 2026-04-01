export type TranslationKeys = {
  // === Common ===
  'common.refresh': string;
  'common.cancel': string;
  'common.confirm': string;
  'common.accept': string;
  'common.ignore': string;

  // === Header / App ===
  'app.title': string;
  'app.subtitle': string;
  'app.toggleLang': string;
  'app.langName': string; // "中 / En"
  'app.loadingBookmarks': string;
  'app.statsFullLink': string;

  // === Dashboard Sections ===
  'section.overview': string;
  'section.settings': string;
  'section.scanners': string;
  'section.history': string;

  // === StatsCards ===
  'stats.totalBookmarks': string;
  'stats.recentlyAdded': string; // + {count} 个新增 (近 30 天)
  'stats.folders': string;
  'stats.maxDepth': string; // 最大嵌套层级: {depth} 层
  'stats.health评估': string;
  'stats.health.untested': string; // 未体检
  'stats.health.excellent': string; // 优秀
  'stats.health.good': string; // 良好
  'stats.health.fair': string; // 一般
  'stats.health.needsAttention': string; // 需关注
  'stats.healthDesc.tested': string; // 基于最新体检结果
  'stats.healthDesc.untested': string; // 请先运行体检工具
  'stats.issues': string;
  'stats.issuesDesc.hasIssue': string; // 需要处理的书签问题
  'stats.issuesDesc.noIssue': string; // 太棒了，未发现问题
  'stats.issuesDesc.untested': string; // 暂无数据，等待体检

  // === SidePanel ===
  'sidepanel.title': string;
  'sidepanel.btnBigScreen': string; // ⚙️ 大屏统计
  'sidepanel.miniStats.total': string; // 书签总量
  'sidepanel.miniStats.folders': string; // 文件夹数
  'sidepanel.ai.title': string;
  'sidepanel.ai.desc': string;
  'sidepanel.ai.btn': string;

  // === ScannerPanel ===
  'scanner.batchCleanBtn': string; // 一键清理全部 ({count})
  'scanner.batchCleanConfirm': string; // ⚠️ 确认清理全部 {count} 项？
  'scanner.batchCleanProgress': string; // 已清理 {done}/{total}
  'scanner.batchCleanFailed': string; // 失败 {failed}
  'scanner.batchCleanDone': string; // ✅ 清理完成！
  'scanner.recheckBtn': string; // 二次检测误判
  'scanner.recheckProgress': string; // 复测中 {done}/{total}
  'scanner.recheckDone': string; // ✅ 成功排除 {recovered} 个误判
  'scanner.card.foundIssues': string; // 发现了 {count} 个问题
  'scanner.card.timeSpent': string; // 耗时: {time}s (已扫 {count} 项)
  'scanner.card.collapse': string; // 收起详情
  'scanner.card.expand': string; // 查看问题详情
  'scanner.detail.title': string; // {name} — 问题详情
  'scanner.detail.count': string; // {count} 项

  // Scanner Names & Descriptions
  'scanner.deadLink.name': string;
  'scanner.deadLink.desc': string;
  'scanner.duplicate.name': string;
  'scanner.duplicate.desc': string;
  'scanner.emptyFolder.name': string;
  'scanner.emptyFolder.desc': string;

  // Scanner Internal Messages
  'scanner.msg.noTarget': string;
  'scanner.msg.deadLink.check': string;
  'scanner.msg.deadLink.done': string;
  'scanner.msg.dupe.check': string;
  'scanner.msg.dupe.done': string;
  'scanner.msg.emptyFolder.check': string;
  'scanner.msg.emptyFolder.done': string;
  'scanner.issue.deadLink': string;
  'scanner.issue.timeout': string;
  'scanner.issue.httpError': string;
  'scanner.issue.duplicate': string;
  'scanner.issue.emptyFolder': string;

  // === IssueList ===
  'issueList.summary': string; // 共 {total} 个问题 (显示 {display} 条)
  'issueList.tip': string; // 💡 点击删除按钮可逐个清理问题书签
  'issueList.loadMore': string;
  'issueList.deleted': string;
  'issueList.confirmDelete': string;
  'issueList.deleteBtn': string; // 删除
  'issueList.excludeBtn': string; // 排除
  'issueList.logDesc.bookmark': string; // 删除了书签「{title}」
  'issueList.logDesc.folder': string; // 删除了文件夹「{title}」
  'issueList.deadLink.status': string; // 错误码: {code} / {error}
  'issueList.deadLink.location': string; // 位于:
  'issueList.deadLink.timeout': string; // 请求超时
  'issueList.dup.copy': string; // 此副本位于:
  'issueList.dup.original': string; // 原版位于:
  'issueList.duplicate.tip': string; // 保留最早创建的版本，自动删除其余同样内容的分身。
  'issueList.emptyFolder.tip': string; // 该文件夹内没有任何书签，可以安全删除。

  // === AIClassifierPanel ===
  'ai.title': string; // AI 智能整理
  'ai.subtitle': string; // 一键扫描并分析，自动找出需要重新归类的书签。
  'ai.mode.quick': string; // 快速
  'ai.mode.quickTip': string; // 只分析根目录下的松散书签（速度快、API调用少）
  'ai.mode.deep': string; // 深度
  'ai.mode.deepTip': string; // 分析所有书签（全面但较慢，API调用较多）
  'ai.includeBookmarksBar': string; // 包含书签栏
  'ai.includeBookmarksBarTip': string; // 书签栏是高频区域，默认不参与整理
  'ai.btnStart': string; // 开始整理
  'ai.btnAnalyzing': string; // 分析中 {done}/{total}
  'ai.progressTip': string; // 正在用 AI 逐条分析，请稍候... ({done}/{total})
  'ai.summary.analyzed': string; // 已分析 {total} 个书签
  'ai.summary.needMove': string; // ⚠ {count} 个需要整理
  'ai.summary.correct': string; // ✅ {count} 个位置正确
  'ai.summary.empty': string; // 未找到书签，请确认书签库非空
  'ai.btnAcceptAll': string; // 全部接受 ({count})
  'ai.tab.move': string; // ⚠ 需整理 ({count})
  'ai.tab.keep': string; // ✅ 正确 ({count})
  'ai.tab.all': string; // 全部 ({count})
  'ai.empty.move': string; // 🎉 太棒了！所有书签都在正确的位置，无需整理。
  'ai.empty.filter': string; // 当前过滤条件下没有结果
  'ai.item.currentDir': string; // 📂 当前: {path}
  'ai.item.suggestDir': string; // 建议移至: {path}
  'ai.item.reason.move': string; // {reason} (置信度 {confidence}%)
  'ai.item.reason.keep': string; // 位置正确 — {reason}
  'ai.item.btnAccept': string; // ✅ 接受
  'ai.logDesc.move': string; // 将书签移动至 "{path}"
  'ai.moveFailed': string; // 移动失败: {err}
  'ai.guide.title': string; // 选择模式后点击「开始整理」
  'ai.guide.quick': string; // 快速模式：只分析根目录下的松散书签（推荐首次使用）
  'ai.guide.deep': string; // 深度模式：审查所有书签的分类是否合理（API 调用较多）

  // === OperationLogPanel ===
  'log.title': string; // 操作历史
  'log.clearAll': string; // 清空记录
  'log.undoneMark': string; // 已撤销
  'log.btnUndo': string; // 撤销
  'log.btnUndoing': string; // 撤销中...
  'log.undoFailed': string; // 撤销失败: {err}

  // === AIProviderSettings ===
  'settings.gemini.key': string;
  'settings.gemini.keyTip': string;
  'settings.gemini.keyLink': string;
  'settings.gemini.model': string;
  'settings.gemini.modelTip': string;
  'settings.ollama.url': string;
  'settings.ollama.model': string;
  'settings.ollama.modelTip': string;
  'settings.general.title': string;
  'settings.general.concurrency': string; // ⚡️ 全局最大并发数 ({count})
  'settings.general.concurTip': string; // 用于控制死链体检和 AI 智能分类时的并行处理数量。数值太高有可能触发网站封禁或 AI 服务限流，推荐保持 10。
  'settings.general.catLang': string; // 📝 分类命名语言
  'settings.general.catLangZh': string; // 中文
  'settings.general.catLangEn': string; // English
  'settings.general.catLangTip': string; // 控制 AI 建议的新文件夹使用的语言，已有文件夹名称不受影响。
  'settings.test.btn': string; // 测试连接
  'settings.test.testing': string; // 测试中...
  'settings.test.success': string; // 连接成功！AI 引擎已准备就绪。
  'settings.test.failGemini': string; // 连接失败，请检查 API Key 是否有效及网络状况。
  'settings.test.failOllama': string; // 连接失败，请确认本地 Ollama 服务已启动且允许跨域请求。
  'settings.test.failException': string; // 探测出现异常: {err}

  // === Services / Misc ===
  'ai.provider.unavailable': string; // AI 服务 [{name}] 当前不可用，请检查设置。

  // === Store / Background Logs ===
  'store.scanner.init': string; // 初始化扫描工具中...
  'background.notify.title': string; // 📂 BookmarkHero 分类建议
  'background.notify.message': string; // 将「{title}」移到 "{path}"？
};
