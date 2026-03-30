/**
 * BookmarkHero Background Service Worker
 *
 * 职责：
 * 1. 响应来自前端页面的消息（如死链检测请求）
 * 2. 在扩展权限上下文中发起跨域 fetch 请求（host_permissions 在此处生效）
 * 3. 管理 Side Panel 打开行为
 */

import type { DeadLinkCheckPayload, DeadLinkResultPayload, UrlCheckResult } from '../shared/messages';

// 让点击插件图标时打开 Side Panel（取消注释即可启用）
// chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

console.log('[BookmarkHero] Background service worker started.');

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
    console.debug(`[DeadLink] HEAD failed (${headResponse.status}), fallback to GET: ${url}`);
    const getController = new AbortController();
    const getTimer = setTimeout(() => getController.abort(), timeoutMs);
    const getResponse = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: getController.signal,
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
