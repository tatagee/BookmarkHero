import type { ClassificationResult, IAIProvider } from './types';
import { useSettingsStore } from '../../stores/settings.store';

export class OllamaProvider implements IAIProvider {
  id = 'ollama';
  name = 'Ollama (Local)';

  async isAvailable(): Promise<boolean> {
    const { ollamaUrl } = useSettingsStore.getState();
    try {
      const resp = await fetch(`${ollamaUrl}/api/tags`);
      return resp.ok;
    } catch {
      return false;
    }
  }

  async classify(
    bookmark: { title: string; url: string },
    existingFolders: { id: string; path: string }[]
  ): Promise<ClassificationResult> {
    const { ollamaUrl, ollamaModel } = useSettingsStore.getState();

    const folderListStr = existingFolders.map((f) => `- ${f.path}`).join('\n');
    const prompt = `你是一个书签分类助手。从用户已有的文件夹中选择最合适的分类目标。
用户已有文件夹：
${folderListStr}

待分类书签：
标题：${bookmark.title}
URL：${bookmark.url}

请严格仅以JSON格式输出，不带markdown块：
{
  "suggestedFolderPath": "最合适的文件夹路径",
  "confidence": 0.0~1.0,
  "reasoning": "简短分类理由",
  "alternatives": [{"path": "备选1", "confidence": 0.0~1.0}]
}`;

    try {
      const resp = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel || 'llama3',
          prompt,
          stream: false,
          format: 'json',
          options: { temperature: 0.2 }, // 降低随机性
        }),
      });

      if (!resp.ok) {
        throw new Error(`Ollama request failed: ${resp.status}`);
      }

      const data = await resp.json();
      const parsed = JSON.parse(data.response);
      return this.validateResponse(parsed, existingFolders);
    } catch (error) {
      console.error('[OllamaProvider] Classify error:', error);
      throw new Error(`Ollama 分类失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async classifyBatch(
    bookmarks: { id: string; title: string; url: string }[],
    existingFolders: { id: string; path: string }[]
  ): Promise<Map<string, ClassificationResult>> {
    const results = new Map<string, ClassificationResult>();
    for (const b of bookmarks) {
      try {
        const res = await this.classify(b, existingFolders);
        results.set(b.id, res);
      } catch (err) {
        console.warn(`[OllamaProvider] Failed to classify ${b.id}:`, err);
      }
    }
    return results;
  }

  private validateResponse(
    parsed: Record<string, unknown>,
    folders: { id: string; path: string }[]
  ): ClassificationResult {
    const suggestedFolderPath = parsed.suggestedFolderPath || '';
    const matchedFolder = folders.find((f) => f.path === suggestedFolderPath);
    
    return {
      suggestedFolderId: matchedFolder ? matchedFolder.id : 'fallback',
      suggestedFolderPath: matchedFolder ? matchedFolder.path : (suggestedFolderPath as string),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: (parsed.reasoning as string) || '',
      alternativeFolders: Array.isArray(parsed.alternatives)
        ? (parsed.alternatives
            .map((alt: Record<string, unknown>) => {
              const m = folders.find((f) => f.path === alt.path);
              return m
                ? { folderId: m.id, folderPath: m.path, confidence: typeof alt.confidence === 'number' ? alt.confidence : 0 }
                : null;
            })
            .filter(Boolean) as { folderId: string; folderPath: string; confidence: number }[])
        : [],
    };
  }
}
