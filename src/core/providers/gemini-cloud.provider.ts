import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ClassificationResult, IAIProvider } from './types';
import { useSettingsStore } from '../../stores/settings.store';

export class GeminiCloudProvider implements IAIProvider {
  id = 'gemini-cloud';
  name = 'Gemini API (Cloud)';

  async isAvailable(): Promise<boolean> {
    const { geminiApiKey, geminiModel } = useSettingsStore.getState();
    if (!geminiApiKey) {
      return false;
    }

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: geminiModel || 'gemini-flash-lite-latest' });
      // 发送一个最小的探测请求，真正验证 API Key 的连通性和有效性
      await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: '1' }] }],
        generationConfig: { maxOutputTokens: 1 },
      });
      return true;
    } catch (error) {
      console.warn('[GeminiCloudProvider] isAvailable test failed:', error);
      return false;
    }
  }

  async classify(
    bookmark: { title: string; url: string },
    existingFolders: { id: string; path: string }[]
  ): Promise<ClassificationResult> {
    const { geminiApiKey, geminiModel } = useSettingsStore.getState();
    if (!geminiApiKey) {
      throw new Error('Gemini API Key is not configured.');
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: geminiModel || 'gemini-flash-lite-latest' });

    const prompt = this.buildPrompt(bookmark, existingFolders);

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      return this.validateResponse(parsed, existingFolders);
    } catch (error) {
      console.error('[GeminiCloudProvider] Classify error:', error);
      throw new Error(`分类失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async classifyBatch(
    bookmarks: { id: string; title: string; url: string }[],
    existingFolders: { id: string; path: string }[]
  ): Promise<Map<string, ClassificationResult>> {
    // 简化处理：目前逐个调用，后续可优化为 true batch 提示
    const results = new Map<string, ClassificationResult>();
    for (const b of bookmarks) {
      try {
        const res = await this.classify(b, existingFolders);
        results.set(b.id, res);
      } catch (err) {
        console.warn(`[GeminiCloudProvider] Failed to classify ${b.id}:`, err);
      }
    }
    return results;
  }

  private buildPrompt(
    bookmark: { title: string; url: string },
    folders: { id: string; path: string }[]
  ): string {
    const folderListStr = folders.map((f) => `- ${f.path}`).join('\n');
    return `你是一个书签分类助手。请根据书签的标题和URL，从用户已有的文件夹中选择一个最合适的分类目标。

用户已有文件夹：
${folderListStr}

待分类书签：
标题：${bookmark.title}
URL：${bookmark.url}

请以 JSON 格式返回，包含以下字段：
- suggestedFolderPath: 最合适的文件夹路径（必须是上方列表中的一项）
- confidence: 0.0 到 1.0 的置信度数值
- reasoning: 一句话分类理由
- alternatives: 备选列表，每个元素包含 path 和 confidence（最多2个，可选）

示例输出：
{
  "suggestedFolderPath": "书签栏/开发资源/前端",
  "confidence": 0.95,
  "reasoning": "该链接是关于 React 的教程，属于前端开发范畴。",
  "alternatives": [
    { "path": "书签栏/学习笔记", "confidence": 0.6 }
  ]
}`;
  }

  /**
   * 验证并补全从 AI 返回的数据
   */
  private validateResponse(
    parsed: Record<string, unknown>,
    folders: { id: string; path: string }[]
  ): ClassificationResult {
    const suggestedFolderPath = parsed.suggestedFolderPath || '';
    // 从给定的 folders 中找 id，防幻觉
    const matchedFolder = folders.find((f) => f.path === suggestedFolderPath);
    
    // 如果找不到精确匹配的，找一个最接近的，或者 fallback
    const finalFolderId = matchedFolder ? matchedFolder.id : 'fallback_id_or_create_new';
    
    return {
      suggestedFolderId: finalFolderId,
      suggestedFolderPath: matchedFolder ? matchedFolder.path : (suggestedFolderPath as string),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: (parsed.reasoning as string) || '',
      alternativeFolders: Array.isArray(parsed.alternatives)
        ? (parsed.alternatives
            .map((alt: Record<string, unknown>) => {
              const matchedAlt = folders.find((f) => f.path === alt.path);
              return matchedAlt
                ? {
                    folderId: matchedAlt.id,
                    folderPath: matchedAlt.path,
                    confidence: typeof alt.confidence === 'number' ? alt.confidence : 0,
                  }
                : null;
            })
            .filter((a: unknown) => a !== null) as { folderId: string; folderPath: string; confidence: number }[])
        : undefined,
    };
  }
}
