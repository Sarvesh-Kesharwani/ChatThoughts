import 'server-only';

import { findDuplicateThoughts, rankThoughts } from './deepseek';
import { getSupabaseServerClient } from './supabase-server';
import type { ThoughtCard, ThoughtConflict } from './thought-types';

const APP_SCHEMA = 'chatthoughts';
const THOUGHTS_TABLE = 'thoughts';
const CONFLICTS_TABLE = 'thought_conflicts';

interface ThoughtRow {
  id: string;
  need_when: string;
  mantra: string;
  created_at: string;
  updated_at: string;
}

interface ConflictRow {
  id: string;
  existing_thought_id: string | null;
  existing_need_when: string | null;
  existing_mantra: string | null;
  candidate_need_when: string;
  candidate_mantra: string;
  status: 'open' | 'resolved';
  resolved_need_when: string | null;
  resolved_mantra: string | null;
  created_at: string;
  updated_at: string;
}

function mapThought(row: ThoughtRow): ThoughtCard {
  return {
    id: row.id,
    needWhen: row.need_when,
    mantra: row.mantra,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConflict(row: ConflictRow): ThoughtConflict {
  return {
    id: row.id,
    existingThoughtId: row.existing_thought_id,
    existingNeedWhen: row.existing_need_when ?? '',
    existingMantra: row.existing_mantra ?? '',
    candidateNeedWhen: row.candidate_need_when,
    candidateMantra: row.candidate_mantra,
    status: row.status,
    resolvedNeedWhen: row.resolved_need_when,
    resolvedMantra: row.resolved_mantra,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanText(input: unknown, maxLength: number) {
  return String(input ?? '').trim().slice(0, maxLength);
}

export async function listThoughts() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from(THOUGHTS_TABLE)
    .select('id, need_when, mantra, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as ThoughtRow[]).map(mapThought);
}

export async function addThoughtWithConflictCheck(input: { needWhen: unknown; mantra: unknown }) {
  const needWhen = cleanText(input.needWhen, 1000);
  const mantra = cleanText(input.mantra, 1000);
  if (!needWhen || !mantra) {
    throw new Error('Both fields are required.');
  }

  const supabase = getSupabaseServerClient();
  const thoughts = await listThoughts();
  const duplicates = await findDuplicateThoughts({ needWhen, mantra }, thoughts);

  if (duplicates.length) {
    const rows = duplicates.map((thought) => ({
      existing_thought_id: thought.id,
      existing_need_when: thought.needWhen,
      existing_mantra: thought.mantra,
      candidate_need_when: needWhen,
      candidate_mantra: mantra,
      status: 'open',
    }));
    const { data, error } = await supabase
      .schema(APP_SCHEMA)
      .from(CONFLICTS_TABLE)
      .insert(rows)
      .select(
        'id, existing_thought_id, existing_need_when, existing_mantra, candidate_need_when, candidate_mantra, status, resolved_need_when, resolved_mantra, created_at, updated_at',
      );

    if (error) throw new Error(error.message);
    return { status: 'conflict' as const, conflicts: ((data ?? []) as ConflictRow[]).map(mapConflict) };
  }

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from(THOUGHTS_TABLE)
    .insert({ need_when: needWhen, mantra })
    .select('id, need_when, mantra, created_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return { status: 'created' as const, thought: mapThought(data as ThoughtRow) };
}

export async function searchThoughts(query: string) {
  const q = cleanText(query, 1000);
  if (!q) return [];
  return rankThoughts(q, await listThoughts());
}

export async function listOpenConflicts() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from(CONFLICTS_TABLE)
    .select(
      'id, existing_thought_id, existing_need_when, existing_mantra, candidate_need_when, candidate_mantra, status, resolved_need_when, resolved_mantra, created_at, updated_at',
    )
    .eq('status', 'open')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as ConflictRow[]).map(mapConflict);
}

export async function resolveConflict(id: string, input: { needWhen: unknown; mantra: unknown }) {
  const needWhen = cleanText(input.needWhen, 1000);
  const mantra = cleanText(input.mantra, 1000);
  if (!needWhen || !mantra) throw new Error('Merged thought needs both fields.');

  const supabase = getSupabaseServerClient();
  const { data: conflict, error: conflictError } = await supabase
    .schema(APP_SCHEMA)
    .from(CONFLICTS_TABLE)
    .select(
      'id, existing_thought_id, existing_need_when, existing_mantra, candidate_need_when, candidate_mantra, status, resolved_need_when, resolved_mantra, created_at, updated_at',
    )
    .eq('id', id)
    .single();

  if (conflictError) throw new Error(conflictError.message);
  const row = conflict as ConflictRow;

  if (row.existing_thought_id) {
    const { error } = await supabase
      .schema(APP_SCHEMA)
      .from(THOUGHTS_TABLE)
      .update({ need_when: needWhen, mantra, updated_at: new Date().toISOString() })
      .eq('id', row.existing_thought_id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.schema(APP_SCHEMA).from(THOUGHTS_TABLE).insert({ need_when: needWhen, mantra });
    if (error) throw new Error(error.message);
  }

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from(CONFLICTS_TABLE)
    .update({
      status: 'resolved',
      resolved_need_when: needWhen,
      resolved_mantra: mantra,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(
      'id, existing_thought_id, existing_need_when, existing_mantra, candidate_need_when, candidate_mantra, status, resolved_need_when, resolved_mantra, created_at, updated_at',
    )
    .single();

  if (error) throw new Error(error.message);
  return mapConflict(data as ConflictRow);
}
