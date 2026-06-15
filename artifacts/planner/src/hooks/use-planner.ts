import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Entity, PlannerEvent, Goal, ENTITY_PALETTE } from "../types";

const ENTITIES_KEY = "planner_entities_v4";
const GOALS_KEY    = "planner_goals_v1";
const getEventsKey = (date: Date) => `planner_events_v4_${format(date, "yyyy-MM")}`;

function load<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch { return fallback; }
}
function save<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function genId() { return Math.random().toString(36).substring(2, 12); }
function pickColor(i: number) { return ENTITY_PALETTE[i % ENTITY_PALETTE.length]; }

export function usePlanner(currentMonth: Date) {
  const eventsKey = getEventsKey(currentMonth);

  const [entities, setEntities] = useState<Entity[]>(() => {
    return load<Entity[]>(ENTITIES_KEY, []);
  });
  const [events,   setEvents]   = useState<PlannerEvent[]>([]);
  const [goals,    setGoals]    = useState<Goal[]>(() => load<Goal[]>(GOALS_KEY, []));

  const loadEvents = useCallback(() => {
    setEvents(load<PlannerEvent[]>(eventsKey, []));
  }, [eventsKey]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const setEnts      = (next: Entity[])       => { setEntities(next); save(ENTITIES_KEY, next); };
  const setEvts      = (next: PlannerEvent[]) => { setEvents(next);   save(eventsKey, next); };
  const setGoalsList = (next: Goal[])         => { setGoals(next);    save(GOALS_KEY, next); };

  const addEntity    = (name: string) => setEnts([...entities, { id: genId(), name, color: pickColor(entities.length) }]);
  const deleteEntity = (id: string)   => { setEnts(entities.filter(e => e.id !== id)); setEvts(events.filter(ev => ev.entityId !== id)); };
  const renameEntity = (id: string, name: string) => setEnts(entities.map(e => e.id === id ? { ...e, name } : e));

  const addEvent    = (ev: PlannerEvent)  => setEvts([...events, ev]);
  const updateEvent = (upd: PlannerEvent) => setEvts(events.map(ev => ev.id === upd.id ? upd : ev));
  const deleteEvent = (id: string)        => setEvts(events.filter(ev => ev.id !== id));

  const moveEvent = (eventId: string, newEntityId: string, newDate: string) =>
    setEvts(events.map(ev => ev.id === eventId ? { ...ev, entityId: newEntityId, date: newDate } : ev));

  const getEventsForCell       = (entityId: string, date: string) => events.filter(ev => ev.entityId === entityId && ev.date === date);
  const getEventCountForEntity = (entityId: string)               => events.filter(ev => ev.entityId === entityId).length;
  const getAllEventsForDay      = (date: string)                   => events.filter(ev => ev.date === date);

  const addGoal    = (name: string, amount: number) => setGoalsList([...goals, { id: genId(), name, amount }]);
  const updateGoal = (g: Goal)    => setGoalsList(goals.map(gx => gx.id === g.id ? g : gx));
  const deleteGoal = (id: string) => setGoalsList(goals.filter(g => g.id !== id));

  const loadDemoData = () => {
    const m = format(new Date(), "yyyy-MM");
    const ents: Entity[] = [
      { id: "d1", name: "Ресторан на Невском",  color: ENTITY_PALETTE[0] },
      { id: "d2", name: "Кафе Садовая",         color: ENTITY_PALETTE[2] },
      { id: "d3", name: "Бар Лиговский",        color: ENTITY_PALETTE[8] },
      { id: "d4", name: "Ресторан Васильевский", color: ENTITY_PALETTE[4] },
    ];
    const todayDate = new Date();
    const todayStr  = format(todayDate, "yyyy-MM-dd");
    const evts: PlannerEvent[] = [
      { id:"s1",  entityId:"d1", date:`${m}-03`, status:"past",      earnings:4800 },
      { id:"s2",  entityId:"d2", date:`${m}-05`, status:"past",      earnings:4200 },
      { id:"s3",  entityId:"d1", date:`${m}-08`, status:"past",      earnings:4800 },
      { id:"s4",  entityId:"d3", date:`${m}-10`, status:"past",      earnings:5200 },
      { id:"s5",  entityId:"d2", date:`${m}-12`, status:"past",      earnings:4200 },
      { id:"s6",  entityId:"d1", date:`${m}-14`, status:"past",      earnings:4800 },
      { id:"s7",  entityId:"d4", date:`${m}-16`, status:"confirmed", earnings:5000, notes:"Взять форму" },
      { id:"s8",  entityId:"d2", date:`${m}-18`, status:"confirmed", earnings:4200 },
      { id:"s9",  entityId:"d1", date:`${m}-20`, status:"planned",   earnings:4800 },
      { id:"s10", entityId:"d3", date:`${m}-22`, status:"planned",   earnings:5200 },
      { id:"s11", entityId:"d4", date:`${m}-24`, status:"planned",   earnings:5000 },
      { id:"s12", entityId:"d2", date:`${m}-26`, status:"planned",   earnings:4200 },
      { id:"s13", entityId:"d1", date:`${m}-28`, status:"planned",   earnings:4800 },
    ];
    setEnts(ents);
    setEvts(evts);
  };

  return {
    entities, events, goals,
    addEntity, deleteEntity, renameEntity,
    addEvent, updateEvent, deleteEvent, moveEvent,
    getEventsForCell, getEventCountForEntity, getAllEventsForDay,
    addGoal, updateGoal, deleteGoal,
    loadDemoData,
  };
}
