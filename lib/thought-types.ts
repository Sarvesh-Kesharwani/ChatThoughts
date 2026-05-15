export interface ThoughtCard {
  id: string;
  needWhen: string;
  mantra: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThoughtSearchResult {
  thought: ThoughtCard;
  score: number;
  reason: string;
}

export interface ThoughtConflict {
  id: string;
  existingThoughtId: string | null;
  existingNeedWhen: string;
  existingMantra: string;
  candidateNeedWhen: string;
  candidateMantra: string;
  status: 'open' | 'resolved';
  resolvedNeedWhen: string | null;
  resolvedMantra: string | null;
  createdAt: string;
  updatedAt: string;
}
