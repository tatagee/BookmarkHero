import { describe, it, expect } from 'vitest';
import { normalizeUrl, isUrlSimilar } from '@/core/utils/url';

describe('normalizeUrl', () => {
  it('应该移除 www. 前缀', () => {
    expect(normalizeUrl('https://www.example.com')).toBe('https://example.com/');
  });

  it('应该移除尾部斜杠', () => {
    // 根路径的 / 会被保留（pathname === '/'）
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    // 非根路径的尾部斜杠会被移除
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('应该保留根路径的单斜杠', () => {
    const result = normalizeUrl('https://example.com');
    expect(result).toBe('https://example.com/');
  });

  it('应该移除 utm 系列追踪参数', () => {
    const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&keep=1';
    const result = normalizeUrl(url);
    expect(result).toContain('keep=1');
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('utm_medium');
  });

  it('应该移除 fbclid 和 gclid 追踪参数', () => {
    const url = 'https://example.com?fbclid=abc123&gclid=def456';
    const result = normalizeUrl(url);
    expect(result).not.toContain('fbclid');
    expect(result).not.toContain('gclid');
  });

  it('应该保留非追踪的 query 参数', () => {
    const url = 'https://example.com/search?q=hello&page=2';
    const result = normalizeUrl(url);
    expect(result).toContain('q=hello');
    expect(result).toContain('page=2');
  });

  it('应该将主机名转为小写', () => {
    expect(normalizeUrl('https://EXAMPLE.COM/Path')).toBe('https://example.com/Path');
  });

  it('对于非法 URL 应该降级处理（trim + lowercase）', () => {
    expect(normalizeUrl('  not-a-url/  ')).toBe('not-a-url');
  });

  it('stripProtocol 选项应该移除协议部分', () => {
    const result = normalizeUrl('https://www.example.com/page', { stripProtocol: true });
    expect(result).toBe('example.com/page');
    expect(result).not.toContain('https://');
  });
});

describe('isUrlSimilar', () => {
  it('标准化后相同的 URL 应该判定为相似', () => {
    expect(isUrlSimilar(
      'https://www.google.com/',
      'https://google.com'
    )).toBe(true);
  });

  it('带追踪参数差异的同一页面应该判定为相似', () => {
    expect(isUrlSimilar(
      'https://example.com/article',
      'https://example.com/article?utm_source=newsletter'
    )).toBe(true);
  });

  it('不同路径的 URL 应该判定为不相似', () => {
    expect(isUrlSimilar(
      'https://example.com/page-a',
      'https://example.com/page-b'
    )).toBe(false);
  });

  it('空字符串应该返回 false', () => {
    expect(isUrlSimilar('', 'https://example.com')).toBe(false);
    expect(isUrlSimilar('https://example.com', '')).toBe(false);
  });
});
