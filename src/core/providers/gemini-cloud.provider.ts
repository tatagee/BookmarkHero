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
    bookmark: { title: string; url: string; currentPath?: string },
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

      return this.validateResponse(parsed, existingFolders, bookmark.currentPath);
    } catch (error) {
      console.error('[GeminiCloudProvider] Classify error:', error);
      throw new Error(`分类失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async classifyBatch(
    bookmarks: { id: string; title: string; url: string; currentPath?: string }[],
    existingFolders: { id: string; path: string }[]
  ): Promise<Map<string, ClassificationResult>> {
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
    bookmark: { title: string; url: string; currentPath?: string },
    folders: { id: string; path: string }[]
  ): string {
    const folderListStr = folders.map((f) => `- ${f.path}`).join('\n');
    const currentLocation = bookmark.currentPath
      ? `当前所在位置：${bookmark.currentPath}`
      : '当前所在位置：未分类（根目录）';

    return `你是一个书签分类助手。请根据书签的标题、URL 和当前所在位置，判断该书签是否放在了合理的位置。

用户已有文件夹：
${folderListStr}

待审查书签：
标题：${bookmark.title}
URL：${bookmark.url}
${currentLocation}

请你做出以下判断：
1. 如果当前位置已经合理 → action 设为 "keep"，suggestedFolderPath 设为当前路径
2. 如果当前位置不合理（未分类、或放错了文件夹）→ action 设为 "move"，suggestedFolderPath 设为你建议的最佳路径（优先从已有文件夹中选，必要时可建议新路径）

请以 JSON 格式返回，包含以下字段：
- action: "keep" 或 "move"
- suggestedFolderPath: 最合适的文件夹路径（keep 时为当前路径，move 时为建议路径）
- confidence: 0.0 到 1.0 的置信度数值
- reasoning: 一句话判断理由
- alternatives: 备选列表，每个元素包含 path 和 confidence（最多2个，可选）

示例输出（需要移动）：
{
  "action": "move",
  "suggestedFolderPath": "书签栏/开发资源/前端",
  "confidence": 0.95,
  "reasoning": "该链接是关于 React 的教程，属于前端开发范畴，不应放在根目录。",
  "alternatives": [
    { "path": "书签栏/学习笔记", "confidence": 0.6 }
  ]
}

示例输出（位置正确）：
{
  "action": "keep",
  "suggestedFolderPath": "书签栏/开发资源/前端",
  "confidence": 0.92,
  "reasoning": "该书签已在前端开发相关文件夹中，位置合理。"
}`;
  }

  /**
   * 验证并补全从 AI 返回的数据
   */
  private validateResponse(
    parsed: Record<string, unknown>,
    folders: { id: string; path: string }[],
    currentPath?: string,
  ): ClassificationResult {
    const action = parsed.action === 'keep' ? 'keep' : 'move';
    const suggestedFolderPath = (parsed.suggestedFolderPath as string) || '';

    // 从给定的 folders 中找 id，防幻觉
    const matchedFolder = folders.find((f) => f.path === suggestedFolderPath);

    // 如果 action 是 keep，使用当前路径对应的 folder
    let finalFolderId: string;
    if (action === 'keep' && currentPath) {
      const currentFolder = folders.find((f) => f.path === currentPath);
      finalFolderId = currentFolder ? currentFolder.id : 'keep';
    } else {
      finalFolderId = matchedFolder ? matchedFolder.id : 'fallback_id_or_create_new';
    }

    return {
      action,
      suggestedFolderId: finalFolderId,
      suggestedFolderPath: matchedFolder ? matchedFolder.path : suggestedFolderPath,
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
