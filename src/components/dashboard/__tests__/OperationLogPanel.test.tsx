import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OperationLogPanel } from '@/components/dashboard/OperationLogPanel';
import type { OperationLog } from '@/core/actions/types';

// --- Mock stores ---
const mockUndoLog = vi.fn();
const mockClearLogs = vi.fn();
const mockRefreshBookmarks = vi.fn().mockResolvedValue(undefined);
let mockLogs: OperationLog[] = [];

vi.mock('@/stores/log.store', () => ({
  useLogStore: vi.fn((selector: (state: unknown) => unknown) => {
    if (typeof selector === 'function') {
      return selector({
        logs: mockLogs,
        clearLogs: mockClearLogs,
        undoLog: mockUndoLog,
      });
    }
    return { logs: mockLogs, clearLogs: mockClearLogs, undoLog: mockUndoLog };
  }),
}));

vi.mock('@/stores/bookmark.store', () => ({
  useBookmarkStore: vi.fn((selector: (state: unknown) => unknown) =>
    selector({ refreshBookmarks: mockRefreshBookmarks })
  ),
}));

function createMockLog(overrides: Partial<OperationLog> = {}): OperationLog {
  return {
    id: 'log-1',
    actionId: 'delete.action',
    timestamp: Date.now(),
    description: '删除了书签「测试书签」',
    status: 'completed',
    undoInfo: {
      actionId: 'delete.action',
      bookmarkId: 'bm-1',
      previousState: { parentId: '1', title: '测试书签', url: 'https://example.com' },
    },
    ...overrides,
  };
}

describe('OperationLogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogs = [];
  });

  it('没有日志时不应渲染任何内容', () => {
    mockLogs = [];
    const { container } = render(<OperationLogPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('应该显示操作历史标题和日志条目', () => {
    mockLogs = [createMockLog()];
    render(<OperationLogPanel />);

    expect(screen.getByText('操作历史')).toBeInTheDocument();
    expect(screen.getByText('删除了书签「测试书签」')).toBeInTheDocument();
  });

  it('应该显示撤销按钮', () => {
    mockLogs = [createMockLog()];
    render(<OperationLogPanel />);

    expect(screen.getByText('撤销')).toBeInTheDocument();
  });

  it('已撤销的日志应显示"已撤销"标记且不显示撤销按钮', () => {
    mockLogs = [createMockLog({ status: 'undone' })];
    render(<OperationLogPanel />);

    expect(screen.getByText('已撤销')).toBeInTheDocument();
    expect(screen.queryByText('撤销')).not.toBeInTheDocument();
  });

  it('应该显示额外的上下文信息（URL 和路径）', () => {
    mockLogs = [
      createMockLog({
        bookmarkUrl: 'https://example.com/page',
        folderPath: '书签栏 / 工作',
      }),
    ];
    render(<OperationLogPanel />);

    expect(screen.getByText(/example.com\/page/)).toBeInTheDocument();
    expect(screen.getByText(/书签栏 \/ 工作/)).toBeInTheDocument();
  });

  it('点击清空记录应调用 clearLogs', async () => {
    const user = userEvent.setup();
    mockLogs = [createMockLog()];
    render(<OperationLogPanel />);

    await user.click(screen.getByText('清空记录'));
    expect(mockClearLogs).toHaveBeenCalled();
  });

  it('点击撤销应调用 undoLog 并刷新书签', async () => {
    const user = userEvent.setup();
    mockUndoLog.mockResolvedValue(undefined);
    mockLogs = [createMockLog({ id: 'log-42' })];
    render(<OperationLogPanel />);

    await user.click(screen.getByText('撤销'));

    expect(mockUndoLog).toHaveBeenCalledWith('log-42');
    // 撤销完成后应刷新书签
    expect(mockRefreshBookmarks).toHaveBeenCalled();
  });
});
