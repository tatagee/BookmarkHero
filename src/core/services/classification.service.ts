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
