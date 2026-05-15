'use client';

import { useEffect, useRef, useState } from 'react';
import type { BaseStore, FeatureRequestItem } from '@/lib/base-types';
import { BASE_STATE_CHANGED_EVENT } from '@/lib/constants';

export function FeatureRequestMenu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeatureRequestItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['low', 'medium', 'high']);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('low');
  const [activeCategory, setActiveCategory] = useState('high');
  const [newCategory, setNewCategory] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setConfirmDeleteId(null);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadItems();
  }, [open]);

  async function loadItems() {
    const res = await fetch('/api/base/state', { cache: 'no-store' });
    if (!res.ok) return;
    const store = (await res.json()) as BaseStore;
    const nextCategories = store.featureRequestCategories ?? ['low', 'medium', 'high'];
    setCategories(nextCategories);
    if (!nextCategories.includes(activeCategory)) setActiveCategory('high');
    setItems(store.featureRequests ?? []);
  }

  async function persist(body: Record<string, unknown>) {
    setPending(true);
    try {
      const res = await fetch('/api/base/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const store = (await res.json()) as BaseStore;
      const nextCategories = store.featureRequestCategories ?? ['low', 'medium', 'high'];
      setCategories(nextCategories);
      if (!nextCategories.includes(activeCategory)) setActiveCategory('high');
      setItems(store.featureRequests ?? []);
      window.dispatchEvent(new CustomEvent(BASE_STATE_CHANGED_EVENT));
    } finally {
      setPending(false);
    }
  }

  async function addRequest() {
    const value = description.trim();
    if (!value) return;
    await persist({ action: 'add_feature_request', description: value, category });
    setDescription('');
  }

  async function addCategory() {
    const value = newCategory.trim().toLowerCase();
    if (!value) return;
    await persist({ action: 'add_feature_category', category: value });
    setCategory(value);
    setActiveCategory(value);
    setNewCategory('');
  }

  async function toggleRequest(id: string, complete: boolean) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, complete } : item)));
    await persist({ action: 'toggle_feature_request', id, complete });
  }

  async function moveRequest(id: string, nextCategory: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, category: nextCategory } : item)));
    await persist({ action: 'move_feature_request', id, category: nextCategory });
  }

  async function deleteRequest(id: string) {
    setConfirmDeleteId(null);
    await persist({ action: 'delete_feature_request', id });
  }

  async function copyRequest(item: FeatureRequestItem) {
    try {
      await navigator.clipboard.writeText(item.description);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = item.description;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1200);
  }

  const customCategories = categories.filter((itemCategory) => !['high', 'medium', 'low'].includes(itemCategory));
  const orderedCategories = ['high', 'medium', ...customCategories, 'low'].filter(
    (itemCategory, index, list) => categories.includes(itemCategory) && list.indexOf(itemCategory) === index,
  );
  const activeItems = items.filter((item) => item.category === activeCategory);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className="btn w-full whitespace-nowrap sm:w-auto"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Requests
      </button>

      {open ? (
        <div className="fixed left-4 right-4 top-24 z-30 rounded-2xl border border-brand-soft bg-white p-3 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem]">
          <form
            className="grid gap-2 border-b border-brand-soft pb-3"
            onSubmit={(event) => {
              event.preventDefault();
              void addRequest();
            }}
          >
            <input
              className="w-full rounded-xl border border-brand-soft px-3 py-2 text-sm outline-none focus:border-blue-400"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Feature or bug request..."
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                className="min-w-0 rounded-xl border border-brand-soft bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {orderedCategories.map((itemCategory) => (
                  <option key={itemCategory} value={itemCategory}>
                    {itemCategory}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-accent" disabled={pending || !description.trim()}>
                Add Request
              </button>
            </div>
          </form>

          <form
            className="mt-3 grid grid-cols-[1fr_auto] gap-2 border-b border-brand-soft pb-3"
            onSubmit={(event) => {
              event.preventDefault();
              void addCategory();
            }}
          >
            <input
              className="min-w-0 rounded-xl border border-brand-soft px-3 py-2 text-sm outline-none focus:border-blue-400"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="New category..."
            />
            <button type="submit" className="btn" disabled={pending || !newCategory.trim()}>
              Add Category
            </button>
          </form>

          <div className="mt-3 border-b border-brand-soft">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {orderedCategories.map((itemCategory) => {
                const active = activeCategory === itemCategory;
                const count = items.filter((item) => item.category === itemCategory).length;

                return (
                  <button
                    key={itemCategory}
                    type="button"
                    className={[
                      'whitespace-nowrap rounded-pill border px-3 py-1.5 text-xs font-bold capitalize',
                      active ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-brand-soft bg-white text-slate-600',
                    ].join(' ')}
                    onClick={() => setActiveCategory(itemCategory)}
                  >
                    {itemCategory} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {activeItems.length ? (
              activeItems.map((item) => (
                <article key={item.id} className="rounded-xl border border-brand-soft bg-slate-50 p-3">
                  <label className="flex items-start gap-3 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-brand-soft"
                      checked={item.complete}
                      disabled={pending}
                      onChange={(event) => void toggleRequest(item.id, event.target.checked)}
                    />
                    <span className={item.complete ? 'break-words text-slate-500 line-through' : 'break-words'}>
                      {item.description}
                    </span>
                  </label>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <select
                      className="min-w-0 rounded-pill border border-brand-soft bg-white px-3 py-1.5 text-xs font-semibold"
                      value={item.category}
                      disabled={pending}
                      onChange={(event) => void moveRequest(item.id, event.target.value)}
                    >
                      {orderedCategories.map((option) => (
                        <option key={option} value={option}>
                          Move to {option}
                        </option>
                      ))}
                    </select>
                    {confirmDeleteId === item.id ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-pill border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                          disabled={pending}
                          onClick={() => void deleteRequest(item.id)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="rounded-pill border border-brand-soft bg-white px-3 py-1.5 text-xs font-semibold"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-pill border border-brand-soft bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                          onClick={() => void copyRequest(item)}
                        >
                          {copiedId === item.id ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          className="rounded-pill border border-brand-soft bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                          onClick={() => setConfirmDeleteId(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No {activeCategory} requests.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
