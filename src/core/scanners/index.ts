export * from './types';
export * from './empty-folder.scanner';
export * from './duplicate.scanner';
export * from './dead-link.scanner';

import { EmptyFolderScanner } from './empty-folder.scanner';
import { DuplicateScanner } from './duplicate.scanner';
import { DeadLinkScanner } from './dead-link.scanner';
import type { IScanner } from './types';

/**
 * 集中获取本工具目前加载的所有系统内置扫描器实例
 * 当增加新的扫描器(如 DeadLinkScanner) 时，在此处进行手动注册
 */
export function getAllScanners(): IScanner[] {
  return [
    new EmptyFolderScanner(),
    new DeadLinkScanner(),
    new DuplicateScanner()
  ];
}
