/**
 * 标准化 URL，用于比较和去重
 * 规则：
 * 1. 强制转小写
 * 2. 移除尾部的斜杠
 * 3. 移除常见的追踪参数 (utm_*, ref, source等)
 * 4. 移除 hash (#) 后的内容 (除非有特殊需求)
 * 5. 移除 www. 前缀
 */
export function normalizeUrl(rawUrl: string, options = { stripProtocol: false }): string {
  try {
    const url = new URL(rawUrl);
    
    // 基础主机名处理 (去除 www., 转小写)
    let hostname = url.hostname.toLowerCase();
    hostname = hostname.replace(/^www\./, '');
    
    // 移除指定的 query parameters
    const paramsToStrip = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
      'ref', 'source', 'gclid', 'fbclid'
    ];
    paramsToStrip.forEach(param => url.searchParams.delete(param));
    
    // 重新构建路径
    let pathname = url.pathname;
    if (pathname.endsWith('/') && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }
    
    const query = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';
    
    if (options.stripProtocol) {
      return `${hostname}${pathname}${query}`;
    }
    
    return `${url.protocol}//${hostname}${pathname}${query}`;
  } catch {
    // 如果不是合法 URL，则直接返回去掉收尾空格和尾部斜杠的原始字符串
    return rawUrl.trim().replace(/\/$/, '').toLowerCase();
  }
}

/**
 * 判断两个 URL 是否高度相似 (标准化后相等)
 */
export function isUrlSimilar(urlA: string, urlB: string): boolean {
  if (!urlA || !urlB) return false;
  return normalizeUrl(urlA) === normalizeUrl(urlB);
}
