import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { Task } from "../types";

const getStorageKey = (date: Date) => {
  return `planner_tasks_${format(date, "yyyy-MM")}`;
};

export function useTasks(currentMonth: Date) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const storageKey = getStorageKey(currentMonth);

  const loadTasks = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setTasks(JSON.parse(stored));
      } else {
        setTasks([]);
      }
    } catch (e) {
      console.error("Failed to load tasks", e);
      setTasks([]);
    }
  }, [storageKey]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const saveTasks = (newTasks: Task[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(newTasks));
      setTasks(newTasks);
    } catch (e) {
      console.error("Failed to save tasks", e);
    }
  };

  const addTask = (task: Task) => {
    saveTasks([...tasks, task]);
  };

  const updateTask = (updatedTask: Task) => {
    saveTasks(tasks.map(t => (t.id === updatedTask.id ? updatedTask : t)));
  };

  const deleteTask = (taskId: string) => {
    saveTasks(tasks.filter(t => t.id !== taskId));
  };

  return { tasks, addTask, updateTask, deleteTask };
}
