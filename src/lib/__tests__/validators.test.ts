import { describe, it, expect } from 'vitest';
import { validateGeminiKey, validateOllamaUrl, sanitizeSettingValue } from '../validators';

describe('validators', () => {
  describe('validateGeminiKey', () => {
    it('应该正确验证合法的 Gemini API Key', () => {
      // 合法的格式：AIza + 35 个字符
      expect(validateGeminiKey('AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz0123456')).toBe(true);
    });

    it('对于不带 AIza 的字符串应该返回 false', () => {
      expect(validateGeminiKey('BIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz0123456')).toBe(false);
    });

    it('对于长度不符的字符串应该返回 false', () => {
      expect(validateGeminiKey('AIzaShort')).toBe(false);
      expect(validateGeminiKey('AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe(false);
    });

    it('对于空字符串应该返回 false', () => {
      expect(validateGeminiKey('')).toBe(false);
    });
  });

  describe('validateOllamaUrl', () => {
    it('应该正确验证合法的 HTTP/HTTPS URL', () => {
      expect(validateOllamaUrl('http://localhost:11434')).toBe(true);
      expect(validateOllamaUrl('https://api.example.com')).toBe(true);
    });

    it('对于非法协议应该返回 false', () => {
      expect(validateOllamaUrl('ftp://localhost')).toBe(false);
      expect(validateOllamaUrl('ws://localhost:8080')).toBe(false);
    });

    it('对于非法格式字符串应该返回 false', () => {
      expect(validateOllamaUrl('not-a-url')).toBe(false);
      expect(validateOllamaUrl('//localhost')).toBe(false);
    });

    it('对于空字符应该返回 false', () => {
      expect(validateOllamaUrl('')).toBe(false);
    });
  });

  describe('sanitizeSettingValue', () => {
    it('应该去除两端空格', () => {
      expect(sanitizeSettingValue('  hello  ')).toBe('hello');
    });

    it('超过最大长度应该被截断', () => {
      const longStr = 'a'.repeat(300);
      const result = sanitizeSettingValue(longStr, 255);
      expect(result.length).toBe(255);
    });

    it('空字符应该返回空字符', () => {
      expect(sanitizeSettingValue('')).toBe('');
      expect(sanitizeSettingValue('   ')).toBe('');
    });
  });
});
