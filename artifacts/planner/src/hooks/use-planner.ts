import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Entity, PlannerEvent } from "../types";

const ENTITIES_KEY = "planner_entities_v2";
const getEventsKey = (date: Date) => `planner_events_v2_${format(date, "yyyy-MM")}`;

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

  const addEntity = (entity: Entity) => updateEntities([...entities, entity]);
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
  };
}
