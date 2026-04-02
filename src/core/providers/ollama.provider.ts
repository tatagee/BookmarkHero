import type { ClassificationResult, IAIProvider, ClassifyOptions } from './types';
import { useSettingsStore } from '../../stores/settings.store';

export class OllamaProvider implements IAIProvider {
  id = 'ollama';
  name = 'Ollama (Local)';

  async isAvailable(): Promise<boolean> {
    const { ollamaUrl, ollamaModel } = useSettingsStore.getState();
    try {
      const targetModel = ollamaModel || 'llama3';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!resp.ok) return false;

      const data = await resp.json();
      const models = Array.isArray(data.models) ? data.models : [];
      
      // 检查所需模型是否存在于本地 (支持匹配 :latest 或直接全名匹配)
      const hasModel = models.some((m: { name: string }) => 
        m.name === targetModel || m.name.startsWith(`${targetModel}:`)
      );

      if (!hasModel) {
        throw new Error(`服务连通正常，但未下载模型 '${targetModel}'，请先在终端执行即可：ollama pull ${targetModel}`);
      }
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('未下载模型')) {
        throw error;
      }
      return false;
    }
  }

  async classify(
    bookmark: { title: string; url: string; currentPath?: string },
    existingFolders: { id: string; path: string }[],
    options?: ClassifyOptions
  ): Promise<ClassificationResult> {
    const { ollamaUrl, ollamaModel, categoryLanguage, maxCategoryDepth } = useSettingsStore.getState();

    const folderListStr = existingFolders.map((f) => `- ${f.path}`).join('\n');
    let currentLocation = bookmark.currentPath
      ? `当前所在位置：${bookmark.currentPath}`
      : '当前所在位置：未分类（根目录）';

    const isDeepMode = options?.mode === 'deep';
    let deepModeInstruction = '';
    if (isDeepMode) {
      currentLocation = '注意：当前执行的是强制重组分类任务，请忽略其当前所在位置。';
      deepModeInstruction = categoryLanguage === 'en'
        ? '\nDEEP REORGANIZATION MODE: You must act as the system reorganizer. Ignore the bookmark\'s current nested folder location. You MUST return action "move" and provide the best new root-level or flat category based ONLY on its title and URL. Do NOT return "keep".\n'
        : '\n强制重组模式：这是一个强制打乱重组的任务。无论该书签当前是否已被分类在某个子文件夹中，你都必须忽略原有位置。你必须强行分配一个符合最新分类规划树的全新的、合适的最佳类别，必须返回 action "move"，绝不可返回 "keep"！\n';
    }

    // 语言控制指令
    const langInstruction = categoryLanguage === 'en'
      ? 'LANGUAGE RULE: All new folder names MUST be in English. Existing folder names remain unchanged.'
      : '语言规则：所有新建文件夹名称必须使用中文。已有文件夹的名称保持不变。';

    // 分类数量约束
    const categoryConstraint = categoryLanguage === 'en'
      ? 'CATEGORY RULE: Keep top-level categories within 15-20 broad themes. Avoid granular sub-categories.'
      : '分类规则：总分类应控制在 15-20 个宏观大类之内，避免创建过于琐碎的微分类。';

    // 层数约束指令
    const depthConstraint = maxCategoryDepth === 1
      ? (categoryLanguage === 'en'
        ? 'DEPTH RULE: suggestedFolderPath MUST have ONLY ONE level of folder after the root. NEVER use nested paths like "A/B/C".'
        : '层数规则：suggestedFolderPath 根目录后只允许一层文件夹。禁止使用 "A/B/C" 这样的嵌套路径。')
      : (categoryLanguage === 'en'
        ? 'DEPTH RULE: suggestedFolderPath can be at most 2 levels of folders after the root.'
        : '层数规则：suggestedFolderPath 根目录后最多两层文件夹。');

    const prompt = `你是一个书签分类助手。请根据书签的标题、URL 和当前位置，判断该书签是否放在了合理的位置。
${deepModeInstruction}
${langInstruction}
${categoryConstraint}
${depthConstraint}

用户已有文件夹：
${folderListStr}

待整理书签：
标题：${bookmark.title}
URL：${bookmark.url}
${currentLocation}

判断规则：
${isDeepMode 
  ? '1. 你必须强行分配一个符合分类规则的新路径，action 必须设为 "move"。\n2. suggestedFolderPath 设为你建议的最佳路径。' 
  : '1. 如果当前位置已经合理 → action 设为 "keep"，suggestedFolderPath 设为当前路径\n2. 如果当前位置不合理 → action 设为 "move"，suggestedFolderPath 设为建议路径'}

请严格仅以JSON格式输出，不带markdown块：
{
  "action": "keep 或 move",
  "suggestedFolderPath": "最合适的文件夹路径",
  "confidence": 0.0~1.0,
  "reasoning": "简短判断理由",
  "alternatives": [{"path": "备选1", "confidence": 0.0~1.0}]
}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);

      const resp = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel || 'llama3',
          prompt,
          stream: false,
          format: 'json',
          options: { temperature: 0.2 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`Ollama request failed: ${resp.status}`);
      }

      const data = await resp.json();
      const parsed = JSON.parse(data.response);
      return this.validateResponse(parsed, existingFolders, bookmark.currentPath, options);
    } catch (error) {
      console.error('[OllamaProvider] Classify error:', error);
      throw new Error(`Ollama 分类失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async groupDuplicateFolders(folderNames: string[], language?: string): Promise<string[][]> {
    const { ollamaUrl, ollamaModel } = useSettingsStore.getState();
    if (folderNames.length < 2) return [];

    const prompt = `You are a semantic semantic folder matcher. You are given a list of folder names. 
Group the folder names that have basically the exact same meaning or represent the same category (e.g. "Frontend" and "前端开发", "Design" and "UI/UX"). Consider language combinations like English and Chinese (${language || 'any'}).
You must return your groupings as a JSON array of arrays of strings. Each inner array should contain the exact folder names from the input list that mean the same thing. Do not include folders that don't have duplicates.
Only output valid JSON array, do not output any markdown blocks or other text.

List of folder names:
${JSON.stringify(folderNames, null, 2)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for semantic group

      const resp = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ollamaModel || 'llama3',
          prompt,
          stream: false,
          format: 'json',
          options: { temperature: 0.1 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`Ollama request failed: ${resp.status}`);
      }

      const data = await resp.json();
      const parsed = JSON.parse(data.response);
      if (Array.isArray(parsed)) {
        return parsed as string[][];
      }
      return [];
    } catch (error) {
      console.warn('[OllamaProvider] Semantic grouping failed:', error);
      return [];
    }
  }

  async classifyBatch(
    bookmarks: { id: string; title: string; url: string; currentPath?: string }[],
    existingFolders: { id: string; path: string }[],
    options?: ClassifyOptions
  ): Promise<Map<string, ClassificationResult>> {
    const results = new Map<string, ClassificationResult>();
    for (const b of bookmarks) {
      try {
        const res = await this.classify(b, existingFolders, options);
        results.set(b.id, res);
      } catch (err) {
        console.warn(`[OllamaProvider] Failed to classify ${b.id}:`, err);
      }
    }
    return results;
  }

  private validateResponse(
    parsed: Record<string, unknown>,
    folders: { id: string; path: string }[],
    currentPath?: string,
    options?: ClassifyOptions
  ): ClassificationResult {
    let action: 'keep' | 'move' = parsed.action === 'keep' ? 'keep' : 'move';
    if (options?.mode === 'deep') {
      action = 'move';
    }
    let suggestedFolderPath = (parsed.suggestedFolderPath as string) || '';

    // 层数裁剪兜底
    const { maxCategoryDepth } = useSettingsStore.getState();
    const parts = suggestedFolderPath.split('/');
    if (parts.length > 1 + maxCategoryDepth) {
      suggestedFolderPath = parts.slice(0, 1 + maxCategoryDepth).join('/');
    }

    const matchedFolder = folders.find((f) => f.path === suggestedFolderPath);
    
    let finalFolderId: string;
    if (action === 'keep' && currentPath) {
      const currentFolder = folders.find((f) => f.path === currentPath);
      finalFolderId = currentFolder ? currentFolder.id : 'keep';
    } else {
      finalFolderId = matchedFolder ? matchedFolder.id : 'fallback';
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
