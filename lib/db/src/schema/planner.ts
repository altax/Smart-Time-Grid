import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const plannerEntitiesTable = pgTable("planner_entities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const plannerEventsTable = pgTable("planner_events", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull().default("upcoming"),
  title: text("title"),
  notes: text("notes"),
  earnings: integer("earnings"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const plannerGoalsTable = pgTable("planner_goals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const plannerExpensesTable = pgTable("planner_expenses", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
