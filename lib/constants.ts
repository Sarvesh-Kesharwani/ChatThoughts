import type { BaseStore } from '@/lib/base-types';

export const BASE_STATE_CHANGED_EVENT = 'chatthoughts-state-changed';
export const DEFAULT_FEATURE_REQUEST_CATEGORIES = ['low', 'medium', 'high'];

export const DEFAULT_BASE_STORE: BaseStore = {
  thoughts: [],
  insights: [],
  featureRequestCategories: DEFAULT_FEATURE_REQUEST_CATEGORIES,
  featureRequests: [],
};
