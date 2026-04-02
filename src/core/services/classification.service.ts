import { AIProviderFactory } from '../providers';
import type { ClassificationResult, ClassifyOptions } from '../providers/types';
import { useSettingsStore } from '../../stores/settings.store';
import { getBookmarkTree } from '../../shared/chrome-api';
import { getT } from '../../i18n';

/**
 * 提取并压缩现有的文件夹树，只返回路径数组
 */
function extractFolderPaths(tree: chrome.bookmarks.BookmarkTreeNode[]): { id: string; path: string }[] {
  const folders: { id: string; path: string }[] = [];

  function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[], currentPath: string) {
    for (const node of nodes) {
      if (!node.url && node.id !== '0') {
        // Build the path string. E.g., "书签栏/开发资源"
        const nextPath = currentPath ? `${currentPath}/${node.title}` : node.title;
        // Don't add structural roots like "书签栏" as classifiable targets if they shouldn't be
        // But for simplicity, we add all folder paths.
        folders.push({ id: node.id, path: nextPath });

        if (node.children) {
          traverse(node.children, nextPath);
        }
      }
    }
  }

  // The 'tree' usually contains a single root node with children representing the different categories
  traverse(tree, '');
  
  return folders; 
}

export class ClassificationService {
  // 缓存已提取的文件夹列表，在一次分析会话中复用，避免 N 次重复 IO
  private cachedFolders: { id: string; path: string }[] | null = null;
  // 缓存服务可用性检测，避免并发执行 N 次 API 请求
  private availabilityPromise: Promise<boolean> | null = null;

  /**
   * 预加载文件夹列表
   * 在批量分析开始前调用一次，后续所有 classify 调用直接复用缓存
   */
  async preloadFolders(): Promise<void> {
    const tree = await getBookmarkTree();
    this.cachedFolders = extractFolderPaths(tree);
    
    // 预热可用性检查
    const providerId = useSettingsStore.getState().activeAiProvider;
    const provider = AIProviderFactory.createProvider(providerId);
    this.availabilityPromise = provider.isAvailable();
    const isAvail = await this.availabilityPromise;
    if (!isAvail) {
      const t = getT();
      throw new Error(t('ai.provider.unavailable', { name: provider.name }));
    }
  }

  /**
   * 针对深度整理模式，提取具有代表性的书签，生成顶层分类大纲
   * @param options.preserveExistingFolders 如果为 true，将现有文件夹作为种子传递给 AI
   */
  async generateTaxonomyBlueprint(
    bookmarks: { title: string; url: string }[],
    options?: { preserveExistingFolders?: boolean }
  ): Promise<void> {
    const state = useSettingsStore.getState();
    const providerId = state.activeAiProvider;
    const provider = AIProviderFactory.createProvider(providerId);

    if (!provider.generateTaxonomy) {
      // 如果 Provider 不支持这个方法，就静默放弃大纲生成
      return;
    }

    // 随机或者截取书签子集用于分析大纲 (最多 300 个，防止上下文爆炸)
    const MAX_SAMPLE = 300;
    const sample = bookmarks.length > MAX_SAMPLE 
      ? [...bookmarks].sort(() => 0.5 - Math.random()).slice(0, MAX_SAMPLE)
      : bookmarks;

    // 如果启用了「保留现有文件夹」，从缓存中提取一级文件夹路径作为种子
    let existingSeedFolders: string[] | undefined;
    if (options?.preserveExistingFolders && this.cachedFolders) {
      // 从缓存的文件夹树中提取用户自建的一级分类路径
      // 排除 Chrome 系统根目录（书签栏、其他书签等 id 为 1 或 2 的节点）
      existingSeedFolders = this.cachedFolders
        .filter(f => {
          // 跳过系统根目录本身
          if (f.id === '1' || f.id === '2') return false;
          // 只保留一级分类（路径格式为 "根/分类名"，恰好两段）
          const parts = f.path.split('/').filter(Boolean);
          return parts.length === 2;
        })
        .map(f => f.path);
    }

    const taxonomyRoots = await provider.generateTaxonomy(
      sample, 
      state.maxCategoryCount, 
      state.categoryLanguage,
      existingSeedFolders
    );

    if (taxonomyRoots && taxonomyRoots.length > 0) {
      // 核心魔改：在大纲一旦生成后，直接以此作为 cachedFolders 的全集，强制接下来的分类仅能在这些项中选择！
      // 为这些被生成的假路径赋予一个负数的假ID，分类保存后会自动变为有效节点
      this.cachedFolders = taxonomyRoots.map((path, idx) => ({
        id: `virtual-${idx}`,
        path
      }));
    }
  }

  async classify(bookmark: { title: string; url: string; currentPath?: string }, options?: ClassifyOptions): Promise<ClassificationResult> {
    const providerId = useSettingsStore.getState().activeAiProvider;
    const provider = AIProviderFactory.createProvider(providerId);

    if (!this.availabilityPromise) {
      this.availabilityPromise = provider.isAvailable();
    }

    const isAvailable = await this.availabilityPromise;
    if (!isAvailable) {
      const t = getT();
      throw new Error(t('ai.provider.unavailable', { name: provider.name }));
    }

    // 优先使用预加载的缓存，没有缓存时才实时拉取
    let folders = this.cachedFolders;
    if (!folders) {
      const tree = await getBookmarkTree();
      folders = extractFolderPaths(tree);
    }

    // Call the active AI provider
    return provider.classify(bookmark, folders, options);
  }
}
