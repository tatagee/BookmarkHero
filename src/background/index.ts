/**
 * BookmarkHero Background Service Worker
 *
 * 职责：
 * 1. 响应来自前端页面的消息（如死链检测请求）
 * 2. 在扩展权限上下文中发起跨域 fetch 请求（host_permissions 在此处生效）
 * 3. 管理 Side Panel 打开行为
 */

import type { DeadLinkCheckPayload, DeadLinkResultPayload, UrlCheckResult } from '../shared/messages';
import { ClassificationService } from '../core/services/classification.service';
import { moveBookmark, ensureFolderExists } from '../shared/chrome-api';

// 让点击插件图标时打开 Side Panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

if (import.meta.env.DEV) {
  console.log('[BookmarkHero] Background service worker started.');
}

/**
 * 检测单个 URL 是否存活
 * 在 background 中执行，拥有 host_permissions，无需 no-cors
 */
async function checkUrlAlive(
  url: string,
  timeoutMs: number
): Promise<{ alive: boolean; statusCode?: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 步骤1: 轻量的 HEAD 请求
    const headResponse = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (headResponse.ok || (headResponse.status >= 200 && headResponse.status < 400)) {
      return { alive: true, statusCode: headResponse.status };
    }

    // 步骤2: HEAD 失败，fallback 到 GET（有些服务器禁止 HEAD 请求）
    if (import.meta.env.DEV) {
      console.debug(`[DeadLink] HEAD failed (${headResponse.status}), fallback to GET: ${url}`);
    }
    const getController = new AbortController();
    const getTimer = setTimeout(() => getController.abort(), timeoutMs);
    const getResponse = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: getController.signal,
      headers: {
        'Range': 'bytes=0-1023', // P1-3 优化: 只验证连通性
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 BookmarkHero/1.0',
      },
    });
    clearTimeout(getTimer);

    if (getResponse.ok) {
      return { alive: true, statusCode: getResponse.status };
    }
    return { alive: false, statusCode: getResponse.status };
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      return { alive: false, error: 'TIMEOUT' };
    }
    return { alive: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 监听来自前端页面（SidePanel/Options）的消息
 */
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload?: unknown },
    _sender,
    sendResponse
  ) => {
    if (message.type === 'deadlink:check') {
      const payload = message.payload as DeadLinkCheckPayload;

      // 异步处理并批量返回结果
      (async () => {
        const results: UrlCheckResult[] = [];
        // 逐个检测（background 中不担心 UI 线程阻塞，可使用批量 Promise.all）
        await Promise.all(
          payload.urls.map(async ({ bookmarkId, url }) => {
            const result = await checkUrlAlive(url, payload.timeoutMs);
            results.push({ bookmarkId, url, ...result });
          })
        );

        const response: DeadLinkResultPayload = {
          requestId: payload.requestId,
          results,
        };
        sendResponse(response);
      })();

      // 返回 true 表示异步响应
      return true;
    }

    return false;
  }
);

// --- AI 自动分类新书签 ---

const classificationResults = new Map<string, { bookmarkId: string; folderId: string; folderPath: string }>();

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (!bookmark.url) return; // 忽略文件夹的创建

  try {
    const service = new ClassificationService();
    const res = await service.classify({ title: bookmark.title, url: bookmark.url });
    
    // 如果 AI 认为当前位置合理，不需要移动
    if (res.action === 'keep') {
      return; 
    }

    // 如果找不到精确匹配的 folderId，尝试自动创建
    let targetFolderId = res.suggestedFolderId;
    if (targetFolderId === 'fallback_id_or_create_new' || targetFolderId === 'fallback') {
      try {
        targetFolderId = await ensureFolderExists(res.suggestedFolderPath);
      } catch {
        return; // 创建失败就静默退出
      }
    }

    const notifId = `classify-${id}-${Date.now()}`;
    classificationResults.set(notifId, {
      bookmarkId: id,
      folderId: targetFolderId,
      folderPath: res.suggestedFolderPath
    });

    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'), 
      title: '📂 BookmarkHero 分类建议',
      message: `将「${bookmark.title}」移到 "${res.suggestedFolderPath}"？`,
      buttons: [{ title: '✅ 接受' }, { title: '❌ 忽略' }],
      requireInteraction: true // 不自动消失
    });
  } catch (err) {
    console.error('[AutoClassify] Failed:', err);
  }
});

chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
  const result = classificationResults.get(notifId);
  if (!result) return;

  if (buttonIndex === 0) {
    // 点击了 ✅ 接受
    try {
      await moveBookmark(result.bookmarkId, { parentId: result.folderId });
    } catch (err) {
      console.error('[AutoClassify] Move failed:', err);
    }
  }
  
  // 无论接受与否，都清理 Map 和通知
  classificationResults.delete(notifId);
  chrome.notifications.clear(notifId);
});

chrome.notifications.onClosed.addListener((notifId) => {
  classificationResults.delete(notifId);
});

