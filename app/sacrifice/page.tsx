"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";

type BaliCard = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

type VardaanCard = BaliCard & {
  sacrifices: BaliCard[];
};

const STORAGE_KEY = "chatthoughts:sacrifice:v1";

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeCard(text: string): BaliCard {
  const ts = nowIso();
  return {
    id: newId(),
    text,
    createdAt: ts,
    updatedAt: ts,
  };
}

function saveCards(cards: VardaanCard[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

function loadCards(): VardaanCard[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as VardaanCard[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((card) => ({
      ...card,
      sacrifices: Array.isArray(card.sacrifices) ? card.sacrifices : [],
    }));
  } catch {
    return [];
  }
}

export default function SacrificePage() {
  const [cards, setCards] = useState<VardaanCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newVardaan, setNewVardaan] = useState("");
  const [newSacrifice, setNewSacrifice] = useState("");
  const [editingVardaanId, setEditingVardaanId] = useState<string | null>(null);
  const [editingSacrificeId, setEditingSacrificeId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = loadCards();
    setCards(stored);
    setSelectedId(stored[0]?.id ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveCards(cards);
  }, [cards, loaded]);

  const selected = useMemo(
    () => cards.find((card) => card.id === selectedId) ?? null,
    [cards, selectedId]
  );

  function updateCards(next: VardaanCard[]) {
    setCards(next);
    if (selectedId && !next.some((card) => card.id === selectedId)) {
      setSelectedId(next[0]?.id ?? null);
    }
  }

  function addVardaan() {
    const text = newVardaan.trim();
    if (!text) return;
    const card = { ...makeCard(text), sacrifices: [] };
    updateCards([card, ...cards]);
    setSelectedId(card.id);
    setNewVardaan("");
  }

  function startVardaanEdit(card: VardaanCard) {
    setEditingSacrificeId(null);
    setEditingVardaanId(card.id);
    setEditText(card.text);
  }

  function saveVardaanEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    updateCards(
      cards.map((card) =>
        card.id === id ? { ...card, text, updatedAt: nowIso() } : card
      )
    );
    setEditingVardaanId(null);
    setEditText("");
  }

  function deleteVardaan(id: string) {
    if (!confirm("Delete this Vardaan/Goal and its Sacrifice/Bali cards?")) return;
    updateCards(cards.filter((card) => card.id !== id));
  }

  function addSacrifice() {
    const text = newSacrifice.trim();
    if (!text || !selected) return;
    const sacrifice = makeCard(text);
    updateCards(
      cards.map((card) =>
        card.id === selected.id
          ? {
              ...card,
              sacrifices: [sacrifice, ...card.sacrifices],
              updatedAt: nowIso(),
            }
          : card
      )
    );
    setNewSacrifice("");
  }

  function startSacrificeEdit(card: BaliCard) {
    setEditingVardaanId(null);
    setEditingSacrificeId(card.id);
    setEditText(card.text);
  }

  function saveSacrificeEdit(id: string) {
    const text = editText.trim();
    if (!text || !selected) return;
    updateCards(
      cards.map((card) =>
        card.id === selected.id
          ? {
              ...card,
              sacrifices: card.sacrifices.map((sacrifice) =>
                sacrifice.id === id
                  ? { ...sacrifice, text, updatedAt: nowIso() }
                  : sacrifice
              ),
              updatedAt: nowIso(),
            }
          : card
      )
    );
    setEditingSacrificeId(null);
    setEditText("");
  }

  function deleteSacrifice(id: string) {
    if (!selected) return;
    updateCards(
      cards.map((card) =>
        card.id === selected.id
          ? {
              ...card,
              sacrifices: card.sacrifices.filter((sacrifice) => sacrifice.id !== id),
              updatedAt: nowIso(),
            }
          : card
      )
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50">
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">
                  Vardaan/Goals
                </h1>
                <p className="text-sm text-slate-500">
                  Select one card to manage its Sacrifice/Bali list.
                </p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">
                {cards.length} cards
              </span>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addVardaan();
              }}
              className="space-y-2"
            >
              <textarea
                value={newVardaan}
                onChange={(event) => setNewVardaan(event.target.value)}
                placeholder="Create new Vardaan/Goal..."
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button
                disabled={!newVardaan.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Add Vardaan/Goal
              </button>
            </form>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {!loaded && <p className="text-sm text-slate-500">Loading...</p>}
            {loaded && cards.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                No Vardaan/Goal cards yet.
              </div>
            )}
            {cards.map((card) => (
              <article
                key={card.id}
                className={`rounded-xl border bg-white p-4 transition ${
                  selectedId === card.id
                    ? "border-indigo-500 shadow-sm"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {editingVardaanId === card.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      rows={4}
                      className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => saveVardaanEdit(card.id)}
                        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingVardaanId(null)}
                        className="text-sm text-slate-500 hover:text-slate-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setSelectedId(card.id)}
                      className="block w-full text-left"
                    >
                      <p className="whitespace-pre-wrap text-sm text-slate-800">
                        {card.text}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>{card.sacrifices.length} Sacrifice/Bali</span>
                        <span>{new Date(card.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                    <div className="mt-3 flex gap-3 text-xs">
                      <button
                        onClick={() => startVardaanEdit(card)}
                        className="text-slate-500 hover:text-slate-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteVardaan(card.id)}
                        className="text-slate-500 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-white">
          <div className="border-b border-slate-200 p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Sacrifice/Bali
                </h2>
                <p className="text-sm text-slate-500">
                  {selected
                    ? "Cards linked to selected Vardaan/Goal."
                    : "Select or create a Vardaan/Goal first."}
                </p>
              </div>
              {selected && (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                  {selected.sacrifices.length} cards
                </span>
              )}
            </div>

            {selected && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  addSacrifice();
                }}
                className="space-y-2"
              >
                <textarea
                  value={newSacrifice}
                  onChange={(event) => setNewSacrifice(event.target.value)}
                  placeholder="Create Sacrifice/Bali for selected Vardaan/Goal..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
                <button
                  disabled={!newSacrifice.trim()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Add Sacrifice/Bali
                </button>
              </form>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {!selected && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                No Vardaan/Goal selected.
              </div>
            )}
            {selected && (
              <article className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="mb-1 text-xs uppercase tracking-wider text-indigo-700">
                  Selected Vardaan/Goal
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-800">
                  {selected.text}
                </p>
              </article>
            )}
            {selected && selected.sacrifices.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                No Sacrifice/Bali cards for this Vardaan/Goal.
              </div>
            )}
            {selected?.sacrifices.map((sacrifice) => (
              <article
                key={sacrifice.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                {editingSacrificeId === sacrifice.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      rows={4}
                      className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => saveSacrificeEdit(sacrifice.id)}
                        className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingSacrificeId(null)}
                        className="text-sm text-slate-500 hover:text-slate-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">
                      {sacrifice.text}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{new Date(sacrifice.updatedAt).toLocaleDateString()}</span>
                      <div className="flex gap-3">
                        <button
                          onClick={() => startSacrificeEdit(sacrifice)}
                          className="hover:text-slate-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteSacrifice(sacrifice.id)}
                          className="hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
