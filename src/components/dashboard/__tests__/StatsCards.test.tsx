import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsCards } from '@/components/dashboard/StatsCards';

// 用变量控制 mock 返回值
let mockStats: Record<string, unknown> | null = null;
let mockResults: Record<string, unknown> = {};

vi.mock('@/stores/bookmark.store', () => ({
  useBookmarkStore: vi.fn((selector: (state: unknown) => unknown) =>
    selector({
      stats: mockStats,
    })
  ),
}));

vi.mock('@/stores/scanner.store', () => ({
  useScannerStore: vi.fn((selector: (state: unknown) => unknown) =>
    selector({
      results: mockResults,
    })
  ),
}));

describe('StatsCards', () => {
  beforeEach(() => {
    mockStats = null;
    mockResults = {};
  });

  it('没有数据时不应渲染任何内容', () => {
    mockStats = null;
    const { container } = render(<StatsCards />);
    // StatsCards returns null when !stats
    expect(container.innerHTML).toBe('');
  });

  it('有数据时应显示书签总量', () => {
    mockStats = {
      totalBookmarks: 256,
      totalFolders: 15,
      maxDepth: 4,
      topDomains: [{ domain: 'github.com', count: 42 }],
      recentlyAdded: 8,
    };

    render(<StatsCards />);
    expect(screen.getByText('256')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('有扫描结果时应显示健康度和问题数', () => {
    mockStats = {
      totalBookmarks: 100,
      totalFolders: 10,
      maxDepth: 3,
      topDomains: [],
      recentlyAdded: 5,
    };
    mockResults = {
      'dead-link-scanner': {
        issues: [{ id: '1' }, { id: '2' }],
      },
    };

    render(<StatsCards />);
    // 2 个问题,应该显示 "2"
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('未扫描时应显示"未体检"', () => {
    mockStats = {
      totalBookmarks: 50,
      totalFolders: 3,
      maxDepth: 2,
      topDomains: [],
      recentlyAdded: 0,
    };
    mockResults = {};

    render(<StatsCards />);
    expect(screen.getByText('未体检')).toBeInTheDocument();
  });
});
