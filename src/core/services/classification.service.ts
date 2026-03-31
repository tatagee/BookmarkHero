import { AIProviderFactory } from '../providers';
import type { ClassificationResult } from '../providers/types';
import { useSettingsStore } from '../../stores/settings.store';
import { getBookmarkTree } from '../../shared/chrome-api';

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

  /**
   * 预加载文件夹列表
   * 在批量分析开始前调用一次，后续所有 classify 调用直接复用缓存
   */
  async preloadFolders(): Promise<void> {
    const tree = await getBookmarkTree();
    this.cachedFolders = extractFolderPaths(tree);
  }

  async classify(bookmark: { title: string; url: string; currentPath?: string }): Promise<ClassificationResult> {
    const providerId = useSettingsStore.getState().activeAiProvider;
    const provider = AIProviderFactory.createProvider(providerId);

    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      throw new Error(`AI Provider [${provider.name}] is currently not available. Please check settings.`);
    }

    // 优先使用预加载的缓存，没有缓存时才实时拉取
    let folders = this.cachedFolders;
    if (!folders) {
      const tree = await getBookmarkTree();
      folders = extractFolderPaths(tree);
    }

    // Call the active AI provider
    return provider.classify(bookmark, folders);
  }
}
