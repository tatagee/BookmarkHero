import type { 
  IScanner, 
  ScanResult, 
  ScanIssue, 
  ScanProgress, 
  ScanOptions 
} from './types';
import { getT } from '../../i18n';

export class EmptyFolderScanner implements IScanner {
  public id = 'empty-folder-scanner';
  public name = 'scanner.emptyFolder.name';
  public description = 'scanner.emptyFolder.desc';
  
  private isCancelled = false;

  async scan(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    _options?: ScanOptions,
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult> {
    this.isCancelled = false;
    const startTime = Date.now();
    const issues: ScanIssue[] = [];
    let totalScanned = 0;
    const t = getT();

    // 1. 将树结构展平，过滤出所有的 Folder 节点
    const folders: chrome.bookmarks.BookmarkTreeNode[] = [];
    const collectFolders = (trees: chrome.bookmarks.BookmarkTreeNode[]) => {
      for (const node of trees) {
        // url为空则是文件夹。跳过一些Chrome内建的顶层只读根节点 ('0':根, '1':书签栏, '2':其余书签)
        if (!node.url && node.id !== '0' && node.id !== '1' && node.id !== '2') {
          folders.push(node);
        }
        if (node.children) {
          collectFolders(node.children);
        }
      }
    };
    collectFolders(nodes);
    
    // 2. 依次检查每个文件夹
    for (let i = 0; i < folders.length; i++) {
        // 检测到中断信号，提前终止循环
        if (this.isCancelled) {
          break; 
        }
        
        const folder = folders[i];
        totalScanned++;
        
        // 节流处理，避免过多重绘，每 10 个汇报一下进度
        if (onProgress && i % 10 === 0) {
            onProgress({
                scannerId: this.id,
                total: folders.length,
                current: i,
                message: t('scanner.msg.emptyFolder.check', { title: folder.title || '...' })
            });
        }
        
        // 判断条件: 该文件夹下没有任何包含实际 url 链接的节点
        // isSubTreeEmpty 会递归到底层，确认全节点都没 url，如果一个 url 都没有则代表其是"实质空"
        const isEmpty = this.isSubTreeEmpty(folder);
        
        if (isEmpty) {
            issues.push({
                id: `empty-folder-${folder.id}`,
                bookmarkId: folder.id,
                bookmarkTitle: folder.title || '未命名文件夹',
                severity: 'info',
                message: t('scanner.issue.emptyFolder'),
                suggestedAction: 'delete'
            });
        }
    }

    // 3. 补发最后一个 100% 完成进度
    if (onProgress) {
        onProgress({
            scannerId: this.id,
            total: folders.length,
            current: folders.length,
            message: t('scanner.msg.emptyFolder.done')
        });
    }

    return {
      scannerId: this.id,
      issues,
      stats: {
        totalScanned,
        issuesFound: issues.length,
        duration: Date.now() - startTime
      }
    };
  }
  
  /**
   * 递归检查这棵树底下是不是真的一个包含URL的结构都没有
   * @returns true 彻底为空 / false 包含至少一个具体的书签 URL
   */
  private isSubTreeEmpty(node: chrome.bookmarks.BookmarkTreeNode): boolean {
      if (node.url) return false;
      if (!node.children || node.children.length === 0) return true;
      
      for (const child of node.children) {
          if (!this.isSubTreeEmpty(child)) {
              return false;
          }
      }
      return true;
  }

  cancel(): void {
    this.isCancelled = true;
  }
}
