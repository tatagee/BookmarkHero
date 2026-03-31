import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssueList } from '@/components/dashboard/IssueList';
import type { ScanResult, ScanIssue } from '@/core/scanners/types';

// Mock 依赖的 stores
vi.mock('@/stores/scanner.store', () => ({
  useScannerStore: vi.fn((selector: (state: unknown) => unknown) =>
    selector({
      removeIssue: vi.fn(),
    })
  ),
}));

vi.mock('@/stores/log.store', () => ({
  useLogStore: vi.fn((selector: (state: unknown) => unknown) =>
    selector({
      addLog: vi.fn(),
    })
  ),
}));

// Mock DeleteAction
vi.mock('@/core/actions/delete.action', () => ({
  DeleteAction: vi.fn().mockImplementation(() => ({
    id: 'delete.action',
    execute: vi.fn().mockResolvedValue({
      actionId: 'delete.action',
      bookmarkId: 'test-id',
      previousState: { parentId: '1', title: 'test' },
    }),
  })),
}));

function createMockResult(issues: ScanIssue[]): ScanResult {
  return {
    scannerId: 'test-scanner',
    issues,
    stats: { totalScanned: issues.length, issuesFound: issues.length, duration: 100 },
  };
}

function createMockIssue(overrides: Partial<ScanIssue> = {}): ScanIssue {
  return {
    id: overrides.id ?? 'issue-1',
    bookmarkId: overrides.bookmarkId ?? 'bm-1',
    bookmarkTitle: overrides.bookmarkTitle ?? '测试书签',
    bookmarkUrl: overrides.bookmarkUrl ?? 'https://example.com',
    severity: overrides.severity ?? 'error',
    message: overrides.message ?? '链接失效',
    suggestedAction: overrides.suggestedAction ?? 'delete',
    ...overrides,
  };
}

describe('IssueList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('没有 issue 时不应渲染任何内容', () => {
    const result = createMockResult([]);
    const { container } = render(
      <IssueList result={result} scannerId="test-scanner" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('应该显示 issue 数量统计', () => {
    const issues = [createMockIssue({ id: 'i1' }), createMockIssue({ id: 'i2' })];
    const result = createMockResult(issues);

    render(<IssueList result={result} scannerId="test-scanner" />);
    expect(screen.getByText(/共 2 个问题/)).toBeInTheDocument();
  });

  it('应该渲染每条 issue 的标题和消息', () => {
    const result = createMockResult([
      createMockIssue({ bookmarkTitle: '我的书签', message: '链接已失效 (HTTP 404)' }),
    ]);

    render(<IssueList result={result} scannerId="dead-link-scanner" />);
    expect(screen.getByText('我的书签')).toBeInTheDocument();
    expect(screen.getByText('链接已失效 (HTTP 404)')).toBeInTheDocument();
  });

  it('应该显示书签的 URL', () => {
    const result = createMockResult([
      createMockIssue({ bookmarkUrl: 'https://dead-link.com/page' }),
    ]);

    render(<IssueList result={result} scannerId="dead-link-scanner" />);
    expect(screen.getByText('https://dead-link.com/page')).toBeInTheDocument();
  });

  it('点击删除按钮应展示内联确认', async () => {
    const user = userEvent.setup();
    const result = createMockResult([createMockIssue()]);

    render(<IssueList result={result} scannerId="test-scanner" />);

    const deleteBtn = screen.getByText('删除');
    await user.click(deleteBtn);

    expect(screen.getByText(/确认删除？/)).toBeInTheDocument();
    expect(screen.getByText('确认')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
  });

  it('点击取消应收起确认条', async () => {
    const user = userEvent.setup();
    const result = createMockResult([createMockIssue()]);

    render(<IssueList result={result} scannerId="test-scanner" />);
    await user.click(screen.getByText('删除'));
    await user.click(screen.getByText('取消'));

    expect(screen.queryByText(/确认删除？/)).not.toBeInTheDocument();
  });

  it('超过 30 条时应显示"加载更多"按钮', () => {
    const issues = Array.from({ length: 40 }, (_, i) =>
      createMockIssue({ id: `issue-${i}`, bookmarkId: `bm-${i}` })
    );
    const result = createMockResult(issues);

    render(<IssueList result={result} scannerId="test-scanner" />);
    expect(screen.getByText(/加载更多/)).toBeInTheDocument();
    expect(screen.getByText(/还有 10 条/)).toBeInTheDocument();
  });
});
