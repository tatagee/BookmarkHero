/**
 * BookmarkHero Background Service Worker
 *
 * 1. 响应来自前端页面的消息（如死链检测请求）
 * 2. 在扩展权限上下文中发起跨域 fetch 请求（host_permissions 在此处生效）
 * 3. 监听扩展图标点击，打开 Options 页面
 */

import type { DeadLinkCheckPayload, DeadLinkResultPayload, UrlCheckResult } from '../shared/messages';
import { ClassificationService } from '../core/services/classification.service';
import { moveBookmark, ensureFolderExists } from '../shared/chrome-api';
import { getT } from '../i18n';

import { checkUrlAlive } from './utils';

// 让点击插件图标时直接打开此全屏选项页
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

if (import.meta.env.DEV) {
  console.log('[BookmarkHero] Background service worker started.');
}

// url checking is now imported

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
        try {
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
        } catch (err) {
          console.error('[Background] deadlink:check failed:', err);
          sendResponse({
            requestId: payload.requestId,
            results: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
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
    
    if (classificationResults.size >= 50) {
      const oldestKey = classificationResults.keys().next().value;
      if (oldestKey) classificationResults.delete(oldestKey);
    }
    
    classificationResults.set(notifId, {
      bookmarkId: id,
      folderId: targetFolderId,
      folderPath: res.suggestedFolderPath
    });

    const t = getT();
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'), 
      title: t('background.notify.title'),
      message: t('background.notify.message', { title: bookmark.title, path: res.suggestedFolderPath }),
      buttons: [{ title: t('common.accept') }, { title: t('common.ignore') }],
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

