import { AIProviderFactory } from '../providers';
import type { ClassificationResult } from '../providers/types';
import { useSettingsStore } from '../../stores/settings.store';

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

  async classify(bookmark: { title: string; url: string; currentPath?: string }): Promise<ClassificationResult> {
    const providerId = useSettingsStore.getState().activeAiProvider;
    const provider = AIProviderFactory.createProvider(providerId);

    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      throw new Error(`AI Provider [${provider.name}] is currently not available. Please check settings.`);
    }

    // Grab the current full tree to extract folders
    const tree = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) => {
      chrome.bookmarks.getTree(resolve);
    });

    const folders = extractFolderPaths(tree);

    if (folders.length === 0) {
      throw new Error('No folders found to classify into.');
    }

    // Call the active AI provider
    return provider.classify(bookmark, folders);
  }
}
