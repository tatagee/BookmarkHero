import { describe, it, expect, beforeEach } from 'vitest';
import { DeleteAction } from '@/core/actions/delete.action';
import { mockBookmarkStore } from '@/tests/setup';

describe('DeleteAction', () => {
  let action: DeleteAction;

  beforeEach(() => {
    action = new DeleteAction();
  });

  it('应该成功删除普通书签并返回 undoInfo', async () => {
    mockBookmarkStore.set('b1', {
      id: 'b1',
      title: 'Test Bookmark',
      url: 'https://example.com',
      parentId: '1',
      index: 0,
    } as chrome.bookmarks.BookmarkTreeNode);

    const undoInfo = await action.execute({ bookmarkId: 'b1' });

    expect(undoInfo).not.toBeNull();
    expect(undoInfo!.bookmarkId).toBe('b1');
    expect(undoInfo!.previousState.url).toBe('https://example.com');
    expect(undoInfo!.previousState.parentId).toBe('1');
    expect(chrome.bookmarks.remove).toHaveBeenCalledWith('b1', expect.any(Function));
  });

  it('应该成功删除空文件夹', async () => {
    mockBookmarkStore.set('f1', {
      id: 'f1',
      title: 'Empty Folder',
      parentId: '1',
      index: 0,
      children: [],
    } as chrome.bookmarks.BookmarkTreeNode);

    const undoInfo = await action.execute({ bookmarkId: 'f1' });

    expect(undoInfo).not.toBeNull();
    expect(chrome.bookmarks.removeTree).toHaveBeenCalledWith('f1', expect.any(Function));
  });

  it('应该拒绝删除有内容的文件夹', async () => {
    mockBookmarkStore.set('f2', {
      id: 'f2',
      title: 'Non-Empty Folder',
      parentId: '1',
      index: 0,
      children: [
        { id: 'child1', title: 'Child', url: 'https://example.com' } as chrome.bookmarks.BookmarkTreeNode,
      ],
    } as chrome.bookmarks.BookmarkTreeNode);

    await expect(
      action.execute({ bookmarkId: 'f2' })
    ).rejects.toThrow();
  });

  it('已删除的书签应该静默返回 null', async () => {
    const undoInfo = await action.execute({ bookmarkId: 'nonexistent' });
    expect(undoInfo).toBeNull();
  });

  it('undo 应该重新创建被删除的书签', async () => {
    mockBookmarkStore.set('b1', {
      id: 'b1',
      title: 'Will Delete',
      url: 'https://example.com',
      parentId: '1',
      index: 3,
    } as chrome.bookmarks.BookmarkTreeNode);

    const undoInfo = await action.execute({ bookmarkId: 'b1' });
    expect(undoInfo).not.toBeNull();

    await action.undo(undoInfo!);

    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: '1',
      index: 3,
      title: 'Will Delete',
      url: 'https://example.com',
    }, expect.any(Function));
  });
});
