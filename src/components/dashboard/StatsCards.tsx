import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useBookmarkStore } from "../../stores/bookmark.store";
import { useScannerStore } from "../../stores/scanner.store";
import { Folder, Link2, AlertTriangle, Activity } from "lucide-react";
import { useT } from "../../i18n";

export function StatsCards() {
  const t = useT();
  const stats = useBookmarkStore((state) => state.stats);
  // ✅ 修复：从扫描结果中动态计算健康度和风险数量，而非硬编码
  const results = useScannerStore((state) => state.results);

  if (!stats) return null;

  // 汇总所有扫描器发现的问题总数
  const totalIssues = Object.values(results).reduce((acc, r) => acc + r.issues.length, 0);
  const hasRunAnyScanner = Object.keys(results).length > 0;

  // 根据问题数量给出健康评级
  const getHealthStatus = () => {
    if (!hasRunAnyScanner) return { label: t('stats.health.untested'), color: 'text-muted-foreground' };
    if (totalIssues === 0) return { label: t('stats.health.excellent'), color: 'text-emerald-500' };
    if (totalIssues <= 5) return { label: t('stats.health.good'), color: 'text-yellow-500' };
    if (totalIssues <= 20) return { label: t('stats.health.fair'), color: 'text-orange-500' };
    return { label: t('stats.health.needsAttention'), color: 'text-destructive' };
  };

  const health = getHealthStatus();

  return (
    <div className="grid gap-4 grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('stats.totalBookmarks')}</CardTitle>
          <Link2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalBookmarks}</div>
          <p className="text-xs text-muted-foreground">
            {t('stats.recentlyAdded', { count: stats.recentlyAdded })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('stats.folders')}</CardTitle>
          <Folder className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalFolders}</div>
          <p className="text-xs text-muted-foreground">
            {t('stats.maxDepth', { depth: stats.maxDepth })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('stats.healthAssessment')}</CardTitle>
          <Activity className={`h-4 w-4 ${health.color}`} />
        </CardHeader>
        <CardContent>
          {/* ✅ 修复：根据扫描结果动态显示健康评级 */}
          <div className={`text-2xl font-bold ${health.color}`}>{health.label}</div>
          <p className="text-xs text-muted-foreground">
            {hasRunAnyScanner ? t('stats.healthDesc.tested') : t('stats.healthDesc.untested')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('stats.issues')}</CardTitle>
          <AlertTriangle className={`h-4 w-4 ${totalIssues > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
        </CardHeader>
        <CardContent>
          {/* ✅ 修复：显示实际问题汇总数量 */}
          <div className={`text-2xl font-bold ${totalIssues > 0 ? 'text-destructive' : ''}`}>{totalIssues}</div>
          <p className="text-xs text-muted-foreground">
            {hasRunAnyScanner
              ? totalIssues > 0 ? t('stats.issuesDesc.hasIssue') : t('stats.issuesDesc.noIssue')
              : t('stats.issuesDesc.untested')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
