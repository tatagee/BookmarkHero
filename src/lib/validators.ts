/**
 * 验证和清理工具函数
 */

/**
 * 验证 Gemini API Key 格式 (通常以 AIza 开头，总长 39 字符)
 */
export function validateGeminiKey(key: string): boolean {
  if (!key) return false;
  // 仅校验以 AIza 开头，放宽长度限制，因为未来 Google 可能会增加 Key 长度
  return /^AIza[A-Za-z0-9_-]{30,}$/.test(key);
}

/**
 * 验证 Ollama 服务的 URL 是否合法 (必须为 http: 或 https:)
 */
export function validateOllamaUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 清理设置值，移除多余空格和长度限制
 * @param value 原始字符串
 * @param maxLength 最大长度，默认 255
 */
export function sanitizeSettingValue(value: string, maxLength: number = 255): string {
  if (!value) return '';
  return value.trim().substring(0, maxLength);
}
