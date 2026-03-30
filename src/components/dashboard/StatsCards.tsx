import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useBookmarkStore } from "../../stores/bookmark.store";
import { useScannerStore } from "../../stores/scanner.store";
import { Folder, Link2, AlertTriangle, Activity } from "lucide-react";

export function StatsCards() {
  const stats = useBookmarkStore((state) => state.stats);
  // ✅ 修复：从扫描结果中动态计算健康度和风险数量，而非硬编码
  const results = useScannerStore((state) => state.results);

  if (!stats) return null;

  // 汇总所有扫描器发现的问题总数
  const totalIssues = Object.values(results).reduce((acc, r) => acc + r.issues.length, 0);
  const hasRunAnyScanner = Object.keys(results).length > 0;

  // 根据问题数量给出健康评级
  const getHealthStatus = () => {
    if (!hasRunAnyScanner) return { label: '未体检', color: 'text-muted-foreground' };
    if (totalIssues === 0) return { label: '优秀', color: 'text-emerald-500' };
    if (totalIssues <= 5) return { label: '良好', color: 'text-yellow-500' };
    if (totalIssues <= 20) return { label: '一般', color: 'text-orange-500' };
    return { label: '需关注', color: 'text-destructive' };
  };

  const health = getHealthStatus();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">总计书签</CardTitle>
          <Link2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalBookmarks}</div>
          <p className="text-xs text-muted-foreground">
            + {stats.recentlyAdded} 个新增 (近 30 天)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">所属文件夹</CardTitle>
          <Folder className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalFolders}</div>
          <p className="text-xs text-muted-foreground">
            最大嵌套层级: {stats.maxDepth} 层
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">健康程度评估</CardTitle>
          <Activity className={`h-4 w-4 ${health.color}`} />
        </CardHeader>
        <CardContent>
          {/* ✅ 修复：根据扫描结果动态显示健康评级 */}
          <div className={`text-2xl font-bold ${health.color}`}>{health.label}</div>
          <p className="text-xs text-muted-foreground">
            {hasRunAnyScanner ? '基于最新体检结果' : '请先运行体检工具'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">发现问题</CardTitle>
          <AlertTriangle className={`h-4 w-4 ${totalIssues > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
        </CardHeader>
        <CardContent>
          {/* ✅ 修复：显示实际问题汇总数量 */}
          <div className={`text-2xl font-bold ${totalIssues > 0 ? 'text-destructive' : ''}`}>{totalIssues}</div>
          <p className="text-xs text-muted-foreground">
            {hasRunAnyScanner
              ? totalIssues > 0 ? '需要处理的书签问题' : '太棒了，未发现问题'
              : '暂无数据，等待体检'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
