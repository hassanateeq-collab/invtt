"use client";
import { useMemo, useState } from "react";
import { NotebookPen, Plus, Pencil, Trash2, Check, X, BellRing, TriangleAlert } from "lucide-react";
import type { ItemStock, Note, Property } from "@/lib/types";
import { deleteNote, upsertNote } from "@/lib/api";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function prettyDate(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function NotesView({ notes, items, properties, onChanged }: {
  notes: Note[]; items: ItemStock[]; properties: Property[]; onChanged: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [newDate, setNewDate] = useState(todayStr());
  const [newBody, setNewBody] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); onChanged(msg); } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  // group notes by date (already sorted newest first)
  const byDate = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) { (m.get(n.note_date) ?? m.set(n.note_date, []).get(n.note_date)!).push(n); }
    return [...m.entries()];
  }, [notes]);

  const branchOf = (pid: string) => properties.find((p) => p.id === pid);
  // reminders = anything in the red (stock at/below zero) → shortage to fix
  const reminders = useMemo(
    () => items.filter((i) => i.current_stock < 0).sort((a, b) => a.current_stock - b.current_stock),
    [items]);

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {/* User notes */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-700"><NotebookPen size={16} className="text-teal-700" /> User notes</h2>

        <div className="mb-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-teal-600" />
            <span className="text-xs text-stone-400">pick a date</span>
          </div>
          <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={2}
            placeholder="Write a note for this date…"
            className="w-full resize-y rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
          <button onClick={() => run(() => upsertNote({ note_date: newDate, body: newBody.trim() }), "Note added").then(() => setNewBody(""))}
            disabled={busy || !newBody.trim()}
            className="mt-2 inline-flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            <Plus size={14} /> Add note
          </button>
        </div>

        {byDate.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">No notes yet.</p>
        ) : (
          <div className="space-y-4">
            {byDate.map(([date, list]) => (
              <div key={date}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">{prettyDate(date)}</p>
                <div className="space-y-2">
                  {list.map((n) => (
                    <div key={n.id} className="rounded-xl border border-stone-200 px-3 py-2">
                      {editId === n.id ? (
                        <div>
                          <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2}
                            className="w-full resize-y rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-600" />
                          <div className="mt-1.5 flex gap-1.5">
                            <button onClick={() => run(() => upsertNote({ id: n.id, body: editBody.trim() }), "Note updated").then(() => setEditId(null))}
                              disabled={busy || !editBody.trim()}
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"><Check size={13} /> Save</button>
                            <button onClick={() => setEditId(null)} className="rounded-lg px-2.5 py-1 text-xs text-stone-500 hover:bg-stone-100">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <p className="whitespace-pre-wrap text-sm text-stone-700">{n.body}</p>
                          <div className="flex shrink-0 gap-0.5">
                            <button onClick={() => { setEditId(n.id); setEditBody(n.body); }} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"><Pencil size={13} /></button>
                            <button onClick={() => { if (confirm("Delete this note?")) run(() => deleteNote(n.id), "Note deleted"); }} className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      )}
                      {n.author_name && <p className="mt-1 text-[11px] text-stone-400">— {n.author_name}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Portal reminders */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-stone-700"><BellRing size={16} className="text-amber-600" /> Portal reminders</h2>
        <p className="mb-3 text-xs text-stone-400">Items in the negative — more was issued/requested than in stock. The number is how much is short. Clears itself once you adjust/receive stock.</p>

        {reminders.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-8 text-center text-sm text-emerald-700">All clear — nothing in the negative. ✅</div>
        ) : (
          <div className="space-y-2">
            {reminders.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5">
                <TriangleAlert size={16} className="shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">{i.name}</p>
                  <p className="text-xs text-stone-500">{[branchOf(i.property_id)?.code].filter(Boolean).join("")} · short by <span className="font-semibold text-red-600">{Math.abs(i.current_stock)} {i.unit}</span></p>
                </div>
                <span className="tnum text-sm font-semibold text-red-600">{i.current_stock}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
