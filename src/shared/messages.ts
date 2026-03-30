/**
 * 跨模块消息传递的事件类型定义
 */
export type EventType =
  | 'bookmark:created'
  | 'bookmark:removed'
  | 'bookmark:moved'
  | 'bookmark:changed'
  | 'scan:started'
  | 'scan:progress'
  | 'scan:completed'
  | 'action:executed'
  // --- 死链检测相关 (前端 → Background) ---
  | 'deadlink:check'
  | 'deadlink:result';

/**
 * 基础消息接口
 */
export interface BaseMessage<T = unknown> {
  type: EventType;
  payload?: T;
}

/**
 * 书签操作相关的消息体
 */
export interface BookmarkPayload {
  id: string;
  node?: chrome.bookmarks.BookmarkTreeNode;
}

export interface BookmarkRemovedPayload {
  id: string;
  removeInfo: Record<string, unknown>;
}

export interface BookmarkMovedPayload {
  id: string;
  moveInfo: Record<string, unknown>;
}

export interface BookmarkChangedPayload {
  id: string;
  changeInfo: Record<string, unknown>;
}

// ---- 死链检测消息协议 ----

/**
 * 前端 → Background: 请求检测一批 URL 是否存活
 */
export interface DeadLinkCheckPayload {
  /** 本批请求的唯一 ID，用于在多次并发调用时区分结果 */
  requestId: string;
  urls: { bookmarkId: string; url: string }[];
  timeoutMs: number;
}

/**
 * 单个 URL 的检测结果
 */
export interface UrlCheckResult {
  bookmarkId: string;
  url: string;
  alive: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Background → 前端: 批量检测完成后的结果
 */
export interface DeadLinkResultPayload {
  requestId: string;
  results: UrlCheckResult[];
}
