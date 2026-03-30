export const APP_NAME = 'BookmarkHero';

// 扫描器配置
export const SCAN_CONFIG = {
  /** 死链检测的最大并发数 */
  MAX_CONCURRENCY: 5,
  /** 死链检测 HEAD 请求的超时时间 (ms) */
  HEAD_TIMEOUT_MS: 8000,
  /** 死链检测 GET 请求的超时时间 (ms) */
  GET_TIMEOUT_MS: 10000,
};

// 存储键名
export const STORAGE_KEYS = {
  /** 扩展设置 */
  SETTINGS: 'bh_settings',
  /** 操作日志 */
  OPERATION_LOGS: 'bh_logs',
};
