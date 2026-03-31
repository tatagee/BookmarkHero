import { useState } from 'react';
import { useBookmarkStore } from '../../stores/bookmark.store';
import { ClassificationService } from '../../core/services/classification.service';
import type { ClassificationResult } from '../../core/providers/types';
import { Button } from '../ui/button';
import { Loader2, ArrowRight } from 'lucide-react';
import { moveBookmark, ensureFolderExists } from '../../shared/chrome-api';
import { ConcurrencyQueue } from '../../core/utils/concurrency';
import { useSettingsStore } from '../../stores/settings.store';

interface UnclassifiedItem {
  id: string;
  title: string;
  url: string;
  result?: ClassificationResult;
}

export function AIClassifierPanel() {
  const [isScanning, setIsScanning] = useState(false);
  const [items, setItems] = useState<UnclassifiedItem[]>([]);
  const [includeBookmarksBar, setIncludeBookmarksBar] = useState(false); // 用户设定项
  
  const tree = useBookmarkStore((state) => state.tree);
  const refreshBookmarks = useBookmarkStore((state) => state.refreshBookmarks);
  const maxConcurrency = useSettingsStore((state) => state.maxConcurrency);

  // 1. 查找所有未分类书签（位于特定层级，比如直接在书签栏或根目录下的带 URL 节点）
  const findUnclassified = () => {
    setIsScanning(true);
    const unclassified: UnclassifiedItem[] = [];

    const rootNodes = tree[0]?.children || [];
    for (const root of rootNodes) {
      // 默认的根节点: id="1" 通常是“书签栏”（Bookmarks Bar），id="2"是“其他书签”
      if (!includeBookmarksBar && root.id === '1') {
        continue;
      }

      // 检查一层子节点，如果有 URL 说明没放进任何“有意义的子文件夹”里
      for (const node of root.children || []) {
        if (node.url) {
          unclassified.push({
            id: node.id,
            title: node.title,
            url: node.url,
          });
        }
      }
    }

    setItems(unclassified);
    setIsScanning(false);
  };

  // 2. 批量分类
  const testClassification = async (item: UnclassifiedItem, idx: number) => {
    try {
      // 标记为正在分类中，更新 UI
      const service = new ClassificationService();
      const res = await service.classify({ title: item.title, url: item.url });
      
      setItems((prev) => {
        const next = [...prev];
        next[idx].result = res;
        return next;
      });
    } catch (err) {
      console.error(err);
      alert(`为 ${item.title} 分类失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleClassifyAll = async () => {
    setIsScanning(true);
    const service = new ClassificationService();
    const queue = new ConcurrencyQueue(maxConcurrency);
    
    // 使用并发队列提速
    const tasks = items.map((item, i) => async () => {
        if (!item.result) {
            try {
                const res = await service.classify({ title: item.title, url: item.url });
                setItems((prev) => {
                  const next = [...prev];
                  next[i].result = res;
                  return next;
                });
            } catch (err) {
                console.error(`Classify All 期间出现单项报错 [${item.title}]: `, err);
            }
        }
    });

    await Promise.all(tasks.map(t => queue.run(t)));    
    setIsScanning(false);
  };

  // 3. 接受操作
  const acceptSuggestion = async (item: UnclassifiedItem, idx: number) => {
    if (!item.result) return;
    
    try {
        let targetId = item.result.suggestedFolderId;
        
        // 如果 AI 脑补或匹配不到，执行新建
        if (targetId === 'fallback_id_or_create_new' || targetId === 'fallback') {
            targetId = await ensureFolderExists(item.result.suggestedFolderPath);
        }

        await moveBookmark(item.id, { parentId: targetId });
        // 成功后移除该项
        setItems((prev) => prev.filter((_, i) => i !== idx));
        // 可以触发整树刷新（如果其他组件监听树）
        refreshBookmarks();
    } catch (err) {
        alert('移动归类失败: ' + err);
    }
  };

  return (
    <div className="bg-card border rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            ✨ AI 存量整理
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            发现散落的书签并利用 AI 分析建议合适的归档文件夹。
          </p>
          <label className="flex items-center gap-2 text-sm text-foreground my-2">
            <input 
              type="checkbox" 
              checked={includeBookmarksBar} 
              onChange={(e) => setIncludeBookmarksBar(e.target.checked)} 
              className="rounded border-input text-primary focus:ring-primary"
            />
            包含“书签栏 (Bookmarks Bar)”的根目录项
            <span className="text-xs text-muted-foreground ml-1">(默认跳过，因为它们多为高频快捷访问)</span>
          </label>
        </div>
        <Button onClick={findUnclassified} disabled={isScanning}>
           扫描未分类项
        </Button>
      </div>

      {items.length > 0 && (
         <div className="space-y-4">
            <div className="flex justify-between items-center bg-muted/30 p-3 rounded text-sm">
                <span>发现 {items.length} 个可能需要整理的书签</span>
                <Button variant="secondary" size="sm" onClick={handleClassifyAll} disabled={isScanning}>
                   {isScanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : '开始获取建议'}
                </Button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                {items.map((item, idx) => (
                   <div key={item.id} className="border p-3 rounded flex items-start justify-between gap-4">
                       <div className="flex-1 min-w-0">
                           <p className="font-medium truncate text-sm" title={item.title}>{item.title}</p>
                           <p className="text-xs text-muted-foreground truncate mb-2">{item.url}</p>
                           
                           {item.result ? (
                               <div className="bg-primary/5 p-2 rounded text-sm border border-primary/10">
                                  <div className="flex items-center gap-2 text-primary font-medium mb-1">
                                    <ArrowRight className="h-4 w-4" />
                                    {item.result.suggestedFolderPath}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                     理由: {item.result.reasoning} (置信度 {Math.round(item.result.confidence * 100)}%)
                                  </p>
                               </div>
                           ) : (
                               <span className="text-xs text-muted-foreground italic">尚无分类建议，点击按钮获取</span>
                           )}
                       </div>
                       <div className="shrink-0 flex flex-col gap-2">
                           <Button 
                             size="sm" 
                             variant="outline" 
                             onClick={() => testClassification(item, idx)} 
                             disabled={isScanning || !!item.result}
                           >
                              单条分析
                           </Button>
                           <Button 
                             size="sm" 
                             variant="default"
                             disabled={!item.result}
                             onClick={() => acceptSuggestion(item, idx)}
                           >
                              ✅ 接受
                           </Button>
                       </div>
                   </div>
                ))}
            </div>
         </div>
      )}
    </div>
  );
}
