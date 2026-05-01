export interface ThoughtCard {
  id: string;
  content: string;
  createdAt: string;
}

export interface InsightCard {
  id: string;
  thoughtId: string;
  problem: string;
  solution: string;
  tags: string[];
  createdAt: string;
}

export interface BaseStore {
  thoughts: ThoughtCard[];
  insights: InsightCard[];
}
