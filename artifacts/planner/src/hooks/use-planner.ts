import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Entity, PlannerEvent, Goal, ENTITY_PALETTE } from "../types";

const ENTITIES_KEY = "planner_entities_v3";
const GOALS_KEY    = "planner_goals_v1";
const getEventsKey = (date: Date) => `planner_events_v3_${format(date, "yyyy-MM")}`;

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

  const [entities, setEntities] = useState<Entity[]>(() => load<Entity[]>(ENTITIES_KEY, []));
  const [events,   setEvents]   = useState<PlannerEvent[]>([]);
  const [goals,    setGoals]    = useState<Goal[]>(() => load<Goal[]>(GOALS_KEY, []));

  const loadEvents = useCallback(() => {
    setEvents(load<PlannerEvent[]>(eventsKey, []));
  }, [eventsKey]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const setEnts  = (next: Entity[])       => { setEntities(next); save(ENTITIES_KEY, next); };
  const setEvts  = (next: PlannerEvent[]) => { setEvents(next);   save(eventsKey, next); };
  const setGoalsList = (next: Goal[])     => { setGoals(next);    save(GOALS_KEY, next); };

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

  /* Goals */
  const addGoal    = (name: string, amount: number) => setGoalsList([...goals, { id: genId(), name, amount }]);
  const updateGoal = (g: Goal)  => setGoalsList(goals.map(gx => gx.id === g.id ? g : gx));
  const deleteGoal = (id: string) => setGoalsList(goals.filter(g => g.id !== id));

  const loadDemoData = () => {
    const m = format(new Date(), "yyyy-MM");
    const ents: Entity[] = [
      { id: "demo-1", name: "Ресторан Центр",  color: ENTITY_PALETTE[0] },
      { id: "demo-2", name: "Ресторан Север",  color: ENTITY_PALETTE[1] },
      { id: "demo-3", name: "Ресторан Запад",  color: ENTITY_PALETTE[4] },
      { id: "demo-4", name: "Ресторан Юг",     color: ENTITY_PALETTE[8] },
    ];
    const evts: PlannerEvent[] = [
      { id:"de1",  entityId:"demo-1", date:`${m}-03`, status:"confirmed", title:"Плановый выезд",        assignee:"Иванов И.",   startTime:"09:00", endTime:"11:30", earnings:3500, expenses:400 },
      { id:"de2",  entityId:"demo-1", date:`${m}-07`, status:"overdue",   title:"Проверка оборудования", assignee:"Петров А.",   startTime:"14:00", endTime:"16:00", earnings:2800 },
      { id:"de3",  entityId:"demo-1", date:`${m}-14`, status:"pending",   title:"Обучение персонала",    assignee:"Сидорова М.", startTime:"10:00", endTime:"13:00", earnings:4200, expenses:600 },
      { id:"de4",  entityId:"demo-2", date:`${m}-02`, status:"confirmed", title:"Плановый выезд",        assignee:"Козлов Р.",   startTime:"08:30", endTime:"10:00", earnings:1800 },
      { id:"de5",  entityId:"demo-2", date:`${m}-09`, status:"pending",   title:"Замена фильтров",       assignee:"Иванов И.",   startTime:"11:00", endTime:"12:30", earnings:2200, expenses:300 },
      { id:"de6",  entityId:"demo-2", date:`${m}-18`, status:"confirmed", title:"Сервисное ТО",          assignee:"Петров А.",   startTime:"15:00", endTime:"17:30", earnings:5000, expenses:800 },
      { id:"de7",  entityId:"demo-3", date:`${m}-05`, status:"overdue",   title:"Проверка оборудования", assignee:"Сидорова М.", startTime:"09:00", endTime:"10:30", earnings:1500 },
      { id:"de8",  entityId:"demo-3", date:`${m}-12`, status:"confirmed", title:"Плановый выезд",        assignee:"Козлов Р.",   startTime:"13:00", endTime:"15:00", earnings:3200, expenses:250 },
      { id:"de9",  entityId:"demo-3", date:`${m}-20`, status:"pending",   title:"Замена расходников",    assignee:"Иванов И.",   earnings:2000 },
      { id:"de10", entityId:"demo-4", date:`${m}-06`, status:"pending",   title:"Плановый выезд",        assignee:"Петров А.",   startTime:"08:00", endTime:"10:00", earnings:2400 },
      { id:"de11", entityId:"demo-4", date:`${m}-15`, status:"confirmed", title:"Сервисное ТО",          assignee:"Сидорова М.", startTime:"14:00", endTime:"16:45", earnings:4800, expenses:700, done:true },
      { id:"de12", entityId:"demo-4", date:`${m}-22`, status:"overdue",   title:"Проверка оборудования", assignee:"Козлов Р.",   startTime:"10:00", endTime:"11:00", earnings:1200 },
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
