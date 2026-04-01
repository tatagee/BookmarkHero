/**
 * 检测单个 URL 是否存活
 * 在 background 中执行，拥有 host_permissions，无需 no-cors
 */
export async function checkUrlAlive(
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
    if (import.meta.env?.DEV) {
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

export function escapeHtml(text: string): string {
  if (!text) return '';
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}
