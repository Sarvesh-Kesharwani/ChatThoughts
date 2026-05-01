import type { BaseStore } from '@/lib/base-types';

export const BASE_STATE_CHANGED_EVENT = 'chatthoughts-state-changed';

export const DEFAULT_BASE_STORE: BaseStore = {
  thoughts: [],
  insights: [],
};
