export * from './types';
export * from './delete.action';

import { DeleteAction } from './delete.action';
import type { IAction } from './types';

/**
 * 获取可用的执行动作实例
 */
export function getAction(actionId: string): IAction | undefined {
  const actions: IAction[] = [
    new DeleteAction()
  ];
  return actions.find(a => a.id === actionId);
}
