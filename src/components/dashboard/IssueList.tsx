import { useState } from "react";
import type { ScanIssue, ScanResult } from "../../core/scanners";
import { useScannerStore } from "../../stores/scanner.store";
import { useLogStore } from "../../stores/log.store";
import { DeleteAction } from "../../core/actions/delete.action";
import {
  ExternalLink, Trash2, FolderOpen, Copy,
  AlertTriangle, AlertCircle, Info, Loader2, Check
} from "lucide-react";
import { Button } from "../ui/button";

// 重复书签 issue 的 data 结构
interface DuplicateIssueData {
  groupId: number;
  normalizedUrl: string;
  originalId: string;
  folderPath: string;
  originalFolderPath: string;
}

// 死链 issue 的 data 结构
interface DeadLinkIssueData {
  statusCode?: number;
  error?: string;
  folderPath?: string;
}

// 严重度对应的视觉映射
const severityConfig = {
  error: {
    icon: AlertCircle,
    color: "text-destructive",
    bg: "bg-destructive/5",
    border: "border-destructive/20",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-500",
    bg: "bg-yellow-500/5",
    border: "border-yellow-500/20",
  },
  info: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-500/5",
    border: "border-blue-500/20",
  },
};

interface IssueListProps {
  result: ScanResult;
  scannerId: string;
}

export function IssueList({ result, scannerId }: IssueListProps) {
  // 分页加载，每次显示 30 条
  const [displayCount, setDisplayCount] = useState(30);
  const { issues } = result;

  if (issues.length === 0) return null;

  const displayedIssues = issues.slice(0, displayCount);
  const hasMore = displayCount < issues.length;

  return (
    <div className="space-y-2">
      {/* 表头提示 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-1">
        <span>共 {issues.length} 个问题 (显示 {Math.min(displayCount, issues.length)} 条)</span>
        <span className="text-[10px]">💡 点击删除按钮可逐个清理问题书签</span>
      </div>

      {/* 问题列表 */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {displayedIssues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            scannerId={scannerId}
          />
        ))}
      </div>

      {/* 加载更多 */}
      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDisplayCount((c) => c + 30)}
          className="w-full text-xs h-8 mt-2"
        >
          加载更多 (还有 {issues.length - displayCount} 条)
        </Button>
      )}
    </div>
  );
}

/** 单条问题行 */
function IssueRow({
  issue,
  scannerId,
}: {
  issue: ScanIssue;
  scannerId: string;
}) {
  const removeIssue = useScannerStore(state => state.removeIssue);
  const addLog = useLogStore(state => state.addLog);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  // 内联确认状态：替代不可靠的 window.confirm()
  const [showConfirm, setShowConfirm] = useState(false);

  const config = severityConfig[issue.severity];
  const SeverityIcon = config.icon;

  // 执行真实删除
  const handleConfirmDelete = async () => {
    setShowConfirm(false);
    setIsDeleting(true);
    try {
      const action = new DeleteAction();
      const undoInfo = await action.execute({ bookmarkId: issue.bookmarkId });
      
      // 有撤销信息说明执行成功（哪怕只是静默返回已消亡项）
      if (undoInfo) {
        addLog({
          id: `log-${Date.now()}-${issue.bookmarkId}`,
          actionId: action.id,
          description: `删除了${scannerId === 'empty-folder-scanner' ? '文件夹' : '书签'}「${issue.bookmarkTitle}」`,
          undoInfo,
          // 额外的上下文展现字段提取方便前端直观追溯
          bookmarkTitle: issue.bookmarkTitle,
          bookmarkUrl: issue.bookmarkUrl,
          folderPath: (issue.data as Record<string, unknown>)?.folderPath as string | undefined
        });
      }

      setIsDeleted(true);
      setTimeout(() => {
        removeIssue(scannerId, issue.id);
      }, 800);
    } catch (err) {
      console.error("[IssueList] 触发删除失败（受保护）:", err);
      // 弹出警示避免默认静默吞无反应的灾难
      alert(`无法删除该项: ${err instanceof Error ? err.message : String(err)}`);
      setIsDeleting(false);
    }
  };

  // 已删除的视觉反馈
  if (isDeleted) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-600 animate-in fade-in duration-200">
        <Check className="h-4 w-4" />
        <span className="font-medium">「{String(issue.bookmarkTitle)}」已删除</span>
      </div>
    );
  }

  return (
    <div className={`relative rounded-md border text-sm ${config.bg} ${config.border} transition-all hover:shadow-sm overflow-hidden`}>
      <div className={`flex items-start gap-3 p-3 transition-opacity duration-200 ${showConfirm ? 'opacity-30' : 'opacity-100'}`}>
        {/* 严重度图标 */}
        <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />

        {/* 主要内容区 */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="font-medium leading-tight" title={String(issue.bookmarkTitle)}>
            {String(issue.bookmarkTitle)}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {String(issue.message || '')}
          </p>
          
          {/* URL */}
          {!!issue.bookmarkUrl && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3 shrink-0" />
              <a
                href={String(issue.bookmarkUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:text-foreground hover:underline transition-colors"
                title={String(issue.bookmarkUrl)}
              >
                {String(issue.bookmarkUrl)}
              </a>
            </div>
          )}

          {/* 扫描器特有的补充信息 */}
          {scannerId === "duplicate-scanner" && !!issue.data && (
            <DuplicateExtraInfo data={issue.data as DuplicateIssueData} />
          )}

          {scannerId === "dead-link-scanner" && !!issue.data && (
            <DeadLinkExtraInfo data={issue.data as DeadLinkIssueData} />
          )}

          {scannerId === "empty-folder-scanner" && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span>此空文件夹可安全删除</span>
            </div>
          )}
        </div>

        {/* 右侧删除按钮 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowConfirm(true)}
          disabled={isDeleting || showConfirm}
          className="shrink-0 h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              删除
            </>
          )}
        </Button>
      </div>

      {/* 遮罩层内联确认 — 右侧对齐布局，保持操作焦点连贯 */}
      {showConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-end bg-gradient-to-l from-background via-background/95 to-transparent pr-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3 bg-background/50 backdrop-blur-sm p-1.5 rounded-md border shadow-sm">
            <span className="text-xs text-destructive font-medium whitespace-nowrap px-1">
              ⚠️ 确认删除？
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirm(false)}
              className="h-7 cursor-pointer px-3 text-xs shadow-sm font-medium"
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              className="h-7 cursor-pointer px-3 text-xs shadow-sm font-medium"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "确认"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 重复书签的额外信息 - 显示文件夹路径 */
function DuplicateExtraInfo({ data }: { data: DuplicateIssueData }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="flex items-start gap-1.5">
        <FolderOpen className="h-3 w-3 shrink-0 mt-0.5" />
        <span title={data.folderPath}>
          <span className="text-foreground/60 font-medium">此副本位于:</span> {data.folderPath}
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        <Copy className="h-3 w-3 shrink-0 mt-0.5" />
        <span title={data.originalFolderPath}>
          <span className="text-foreground/60 font-medium">原版位于:</span> {data.originalFolderPath}
        </span>
      </div>
    </div>
  );
}

/** 死链的额外信息 */
function DeadLinkExtraInfo({ data }: { data: DeadLinkIssueData }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {/* 文件夹路径 */}
      {data.folderPath && (
        <div className="flex items-start gap-1.5">
          <FolderOpen className="h-3 w-3 shrink-0 mt-0.5" />
          <span title={data.folderPath}>
            <span className="text-foreground/60 font-medium">位于:</span> {data.folderPath}
          </span>
        </div>
      )}
      {/* HTTP 状态 / 错误信息 */}
      <div className="flex items-center gap-1.5">
        {data.statusCode && (
          <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive text-[10px] font-mono font-medium">
            HTTP {data.statusCode}
          </span>
        )}
        {data.error && data.error !== "TIMEOUT" && (
          <span className="truncate">{data.error}</span>
        )}
        {data.error === "TIMEOUT" && (
          <span className="px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600 text-[10px] font-medium">
            请求超时
          </span>
        )}
      </div>
    </div>
  );
}
