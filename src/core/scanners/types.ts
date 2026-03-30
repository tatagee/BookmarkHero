// 定义问题严重程度
export type IssueSeverity = 'error' | 'warning' | 'info';

// 定义扫描器建议执行的行动类型
export type ActionType = 'delete' | 'merge' | 'move' | 'none';

/**
 * 表示扫描器发现的一个具体问题
 */
export interface ScanIssue<T = unknown> {
  id: string;               // 问题的唯一标识符 (例如 `dev-link-${bookmarkId}`)
  bookmarkId: string;       // 关联的书签 ID
  bookmarkTitle: string;    // 关联的书签标题
  bookmarkUrl?: string;     // 关联的书签 URL (如果是文件夹则为 undefined)
  severity: IssueSeverity;  // 问题的严重程度
  message: string;          // 显示给用户的文字说明
  suggestedAction: ActionType; // 建议的操作类型
  data?: T;                 // 携带特定 scanner 需要的额外上下文数据，方便后续 action 消费
}

/**
 * 一次扫描的统计信息
 */
export interface ScanStats {
  totalScanned: number;
  issuesFound: number;
  duration: number; // 耗时，毫秒
}

/**
 * 扫描执行后的返回结果
 */
export interface ScanResult<T = unknown> {
  scannerId: string;
  issues: ScanIssue<T>[];
  stats: ScanStats;
}

/**
 * 扫描进度回调参数
 */
export interface ScanProgress {
  scannerId: string;
  total: number;
  current: number;
  message?: string;
}

/**
 * 扫描选项配置
 */
export interface ScanOptions {
  ignorePaths?: string[];   // 需要忽略的文件夹路径或ID
  ignoreDomains?: string[]; // 需要跳过的域名白名单
  maxConcurrency?: number;  // 最大并发数（覆盖全局常量）
}

/**
 * 所有扫描器核心必须实现的抽象接口
 */
export interface IScanner<T = unknown> {
  /** 扫描器的唯一 ID, 如 'dead-link-scanner' */
  id: string;
  /** UI 上展示的易读名称 */
  name: string;
  /** 扫描器的一句话功能描述 */
  description: string;
  
  /**
   * 执行扫描工作
   * @param bookmarks 从 Chrome 获取的书签树 (往往是完整树)
   * @param options 扫描的各种阈值、排除条件配置
   * @param onProgress 进度回调函数，用于驱动 UI 更新
   */
  scan(
    bookmarks: chrome.bookmarks.BookmarkTreeNode[],
    options?: ScanOptions,
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult<T>>;
  
  /**
   * 中止当前正在运行的扫描任务
   */
  cancel(): void;
}
