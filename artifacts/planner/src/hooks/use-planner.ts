import { useState, useEffect, useCallback } from "react";
import { Entity, PlannerEvent, EventStatus, Goal, Expense, ENTITY_PALETTE } from "../types";

function genId() { return Math.random().toString(36).substring(2, 12); }
function pickColor(i: number) { return ENTITY_PALETTE[i % ENTITY_PALETTE.length]; }

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`/api/planner${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw new Error(`API ${opts?.method ?? "GET"} ${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

export function usePlanner() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [events,   setEvents]   = useState<PlannerEvent[]>([]);
  const [goals,    setGoals]    = useState<Goal[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Entity[]>("/entities"),
      apiFetch<PlannerEvent[]>("/events"),
      apiFetch<Goal[]>("/goals"),
      apiFetch<Expense[]>("/expenses"),
    ]).then(([ents, evts, gls, exps]) => {
      setEntities(ents);
      setEvents(evts.map(e => {
        const s = e.status as string;
        const normalized: EventStatus =
          s === "planned" || s === "confirmed" || s === "pending" ? "upcoming" :
          s === "overdue" ? "past" :
          (s as EventStatus);
        return { ...e, status: normalized } as PlannerEvent;
      }));
      setGoals(gls);
      setExpenses(exps);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  /* ── Entities ── */
  const addEntity = useCallback(async (name: string) => {
    const ent: Entity = { id: genId(), name, color: pickColor(entities.length) };
    setEntities(prev => [...prev, ent]);
    try { await apiFetch("/entities", { method: "POST", body: JSON.stringify(ent) }); }
    catch (e) { console.error(e); }
  }, [entities.length]);

  const deleteEntity = useCallback(async (id: string) => {
    setEntities(prev => prev.filter(e => e.id !== id));
    setEvents(prev => prev.filter(ev => ev.entityId !== id));
    try { await apiFetch(`/entities/${id}`, { method: "DELETE" }); }
    catch (e) { console.error(e); }
  }, []);

  const renameEntity = useCallback(async (id: string, name: string) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, name } : e));
    try { await apiFetch(`/entities/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }); }
    catch (e) { console.error(e); }
  }, []);

  const reorderEntities = useCallback(async (orderedIds: string[]) => {
    setEntities(prev => {
      const map = new Map(prev.map(e => [e.id, e]));
      return orderedIds.map((id, i) => ({ ...map.get(id)!, sortOrder: i }));
    });
    try {
      await Promise.all(orderedIds.map((id, i) =>
        apiFetch(`/entities/${id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: i }) })
      ));
    } catch (e) { console.error(e); }
  }, []);

  /* ── Events ── */
  const addEvent = useCallback(async (ev: PlannerEvent) => {
    setEvents(prev => [...prev, ev]);
    try { await apiFetch("/events", { method: "POST", body: JSON.stringify(ev) }); }
    catch (e) { console.error(e); }
  }, []);

  const updateEvent = useCallback(async (upd: PlannerEvent) => {
    setEvents(prev => prev.map(ev => ev.id === upd.id ? upd : ev));
    try { await apiFetch(`/events/${upd.id}`, { method: "PATCH", body: JSON.stringify(upd) }); }
    catch (e) { console.error(e); }
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    setEvents(prev => prev.filter(ev => ev.id !== id));
    try { await apiFetch(`/events/${id}`, { method: "DELETE" }); }
    catch (e) { console.error(e); }
  }, []);

  const moveEvent = useCallback(async (eventId: string, newEntityId: string, newDate: string) => {
    setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, entityId: newEntityId, date: newDate } : ev));
    try { await apiFetch(`/events/${eventId}`, { method: "PATCH", body: JSON.stringify({ entityId: newEntityId, date: newDate }) }); }
    catch (e) { console.error(e); }
  }, []);

  /* ── Goals ── */
  const addGoal = useCallback(async (name: string, amount: number) => {
    const g: Goal = { id: genId(), name, amount };
    setGoals(prev => [...prev, g]);
    try { await apiFetch("/goals", { method: "POST", body: JSON.stringify(g) }); }
    catch (e) { console.error(e); }
  }, []);

  const updateGoal = useCallback(async (g: Goal) => {
    setGoals(prev => prev.map(gx => gx.id === g.id ? g : gx));
    try { await apiFetch(`/goals/${g.id}`, { method: "PATCH", body: JSON.stringify(g) }); }
    catch (e) { console.error(e); }
  }, []);

  const deleteGoal = useCallback(async (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    try { await apiFetch(`/goals/${id}`, { method: "DELETE" }); }
    catch (e) { console.error(e); }
  }, []);

  /* ── Expenses ── */
  const addExpense = useCallback(async (description: string, amount: number, date: string) => {
    const exp: Expense = { id: genId(), description, amount, date };
    setExpenses(prev => [...prev, exp].sort((a, b) => b.date.localeCompare(a.date)));
    try { await apiFetch("/expenses", { method: "POST", body: JSON.stringify(exp) }); }
    catch (e) { console.error(e); }
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    try { await apiFetch(`/expenses/${id}`, { method: "DELETE" }); }
    catch (e) { console.error(e); }
  }, []);

  /* ── Selectors ── */
  const getEventsForCell       = useCallback((entityId: string, date: string) => events.filter(ev => ev.entityId === entityId && ev.date === date), [events]);
  const getEventCountForEntity = useCallback((entityId: string) => events.filter(ev => ev.entityId === entityId).length, [events]);
  const getAllEventsForDay      = useCallback((date: string) => events.filter(ev => ev.date === date), [events]);

  return {
    entities, events, goals, expenses, loading,
    addEntity, deleteEntity, renameEntity, reorderEntities,
    addEvent, updateEvent, deleteEvent, moveEvent,
    getEventsForCell, getEventCountForEntity, getAllEventsForDay,
    addGoal, updateGoal, deleteGoal,
    addExpense, deleteExpense,
  };
}
