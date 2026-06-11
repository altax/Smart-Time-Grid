import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Entity, PlannerEvent, ENTITY_PALETTE } from "../types";

const ENTITIES_KEY = "planner_entities_v3";
const getEventsKey = (date: Date) => `planner_events_v3_${format(date, "yyyy-MM")}`;

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 12);
}

function pickColor(index: number): string {
  return ENTITY_PALETTE[index % ENTITY_PALETTE.length];
}

export function usePlanner(currentMonth: Date) {
  const eventsKey = getEventsKey(currentMonth);

  const [entities, setEntities] = useState<Entity[]>(() =>
    loadFromStorage<Entity[]>(ENTITIES_KEY, [])
  );
  const [events, setEvents] = useState<PlannerEvent[]>([]);

  const loadEvents = useCallback(() => {
    setEvents(loadFromStorage<PlannerEvent[]>(eventsKey, []));
  }, [eventsKey]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const updateEntities = (next: Entity[]) => {
    setEntities(next);
    saveToStorage(ENTITIES_KEY, next);
  };

  const updateEvents = (next: PlannerEvent[]) => {
    setEvents(next);
    saveToStorage(eventsKey, next);
  };

  const addEntity = (name: string) => {
    const entity: Entity = {
      id: generateId(),
      name,
      color: pickColor(entities.length),
    };
    updateEntities([...entities, entity]);
  };

  const deleteEntity = (id: string) => {
    updateEntities(entities.filter(e => e.id !== id));
    updateEvents(events.filter(ev => ev.entityId !== id));
  };

  const renameEntity = (id: string, name: string) =>
    updateEntities(entities.map(e => (e.id === id ? { ...e, name } : e)));

  const addEvent = (event: PlannerEvent) => updateEvents([...events, event]);

  const updateEvent = (updated: PlannerEvent) =>
    updateEvents(events.map(ev => (ev.id === updated.id ? updated : ev)));

  const deleteEvent = (id: string) => updateEvents(events.filter(ev => ev.id !== id));

  const getEventsForCell = (entityId: string, date: string) =>
    events.filter(ev => ev.entityId === entityId && ev.date === date);

  const getEventCountForEntity = (entityId: string) =>
    events.filter(ev => ev.entityId === entityId).length;

  const loadDemoData = () => {
    const today = new Date();
    const m = format(today, "yyyy-MM");
    const newEntities: Entity[] = [
      { id: "demo-1", name: "Ресторан Центр", color: ENTITY_PALETTE[0] },
      { id: "demo-2", name: "Ресторан Север", color: ENTITY_PALETTE[1] },
      { id: "demo-3", name: "Ресторан Запад", color: ENTITY_PALETTE[4] },
      { id: "demo-4", name: "Ресторан Юг", color: ENTITY_PALETTE[8] },
    ];
    const newEvents: PlannerEvent[] = [
      { id: "de1", entityId: "demo-1", date: `${m}-03`, status: "confirmed", title: "Плановый выезд", assignee: "Иванов И." },
      { id: "de2", entityId: "demo-1", date: `${m}-07`, status: "overdue", title: "Проверка оборудования", assignee: "Петров А." },
      { id: "de3", entityId: "demo-1", date: `${m}-14`, status: "pending", title: "Обучение персонала", assignee: "Сидорова М." },
      { id: "de4", entityId: "demo-2", date: `${m}-02`, status: "confirmed", title: "Плановый выезд", assignee: "Козлов Р." },
      { id: "de5", entityId: "demo-2", date: `${m}-09`, status: "pending", title: "Замена фильтров", assignee: "Иванов И." },
      { id: "de6", entityId: "demo-2", date: `${m}-18`, status: "confirmed", title: "Сервисное ТО", assignee: "Петров А." },
      { id: "de7", entityId: "demo-3", date: `${m}-05`, status: "overdue", title: "Проверка оборудования", assignee: "Сидорова М." },
      { id: "de8", entityId: "demo-3", date: `${m}-12`, status: "confirmed", title: "Плановый выезд", assignee: "Козлов Р." },
      { id: "de9", entityId: "demo-3", date: `${m}-20`, status: "pending", title: "Замена расходников", assignee: "Иванов И." },
      { id: "de10", entityId: "demo-4", date: `${m}-06`, status: "pending", title: "Плановый выезд", assignee: "Петров А." },
      { id: "de11", entityId: "demo-4", date: `${m}-15`, status: "confirmed", title: "Сервисное ТО", assignee: "Сидорова М." },
      { id: "de12", entityId: "demo-4", date: `${m}-22`, status: "overdue", title: "Проверка оборудования", assignee: "Козлов Р." },
    ];
    updateEntities(newEntities);
    updateEvents(newEvents);
  };

  return {
    entities,
    events,
    addEntity,
    deleteEntity,
    renameEntity,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventsForCell,
    getEventCountForEntity,
    loadDemoData,
  };
}
