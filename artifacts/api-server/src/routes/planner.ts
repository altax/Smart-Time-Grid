import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, plannerEntitiesTable, plannerEventsTable, plannerGoalsTable, plannerExpensesTable } from "@workspace/db";

const router = Router();

/* ── Entities ── */
router.get("/entities", async (_req, res) => {
  const rows = await db.select().from(plannerEntitiesTable).orderBy(plannerEntitiesTable.createdAt);
  res.json(rows);
});

router.post("/entities", async (req, res) => {
  const { id, name, color } = req.body as { id: string; name: string; color: string };
  const [row] = await db.insert(plannerEntitiesTable).values({ id, name, color }).returning();
  res.json(row);
});

router.patch("/entities/:id", async (req, res) => {
  const { name, color } = req.body as { name?: string; color?: string };
  const updates: Partial<{ name: string; color: string }> = {};
  if (name !== undefined) updates.name = name;
  if (color !== undefined) updates.color = color;
  const [row] = await db.update(plannerEntitiesTable).set(updates).where(eq(plannerEntitiesTable.id, req.params.id)).returning();
  res.json(row);
});

router.delete("/entities/:id", async (req, res) => {
  await db.delete(plannerEventsTable).where(eq(plannerEventsTable.entityId, req.params.id));
  await db.delete(plannerEntitiesTable).where(eq(plannerEntitiesTable.id, req.params.id));
  res.json({ ok: true });
});

/* ── Events ── */
router.get("/events", async (_req, res) => {
  const rows = await db.select().from(plannerEventsTable).orderBy(plannerEventsTable.date);
  res.json(rows);
});

router.post("/events", async (req, res) => {
  const { id, entityId, date, status, title, notes, earnings } = req.body as {
    id: string; entityId: string; date: string; status: string;
    title?: string; notes?: string; earnings?: number;
  };
  const [row] = await db.insert(plannerEventsTable).values({
    id, entityId, date,
    status: status ?? "upcoming",
    title: title ?? null,
    notes: notes ?? null,
    earnings: earnings != null ? Math.round(earnings) : null,
  }).returning();
  res.json(row);
});

router.patch("/events/:id", async (req, res) => {
  const { status, title, notes, earnings, entityId, date } = req.body as {
    status?: string; title?: string; notes?: string; earnings?: number;
    entityId?: string; date?: string;
  };
  const updates: Record<string, unknown> = {};
  if (status    !== undefined) updates.status   = status;
  if (title     !== undefined) updates.title    = title ?? null;
  if (notes     !== undefined) updates.notes    = notes ?? null;
  if (earnings  !== undefined) updates.earnings = earnings != null ? Math.round(earnings) : null;
  if (entityId  !== undefined) updates.entityId = entityId;
  if (date      !== undefined) updates.date     = date;
  const [row] = await db.update(plannerEventsTable).set(updates).where(eq(plannerEventsTable.id, req.params.id)).returning();
  res.json(row);
});

router.delete("/events/:id", async (req, res) => {
  await db.delete(plannerEventsTable).where(eq(plannerEventsTable.id, req.params.id));
  res.json({ ok: true });
});

/* ── Goals ── */
router.get("/goals", async (_req, res) => {
  const rows = await db.select().from(plannerGoalsTable).orderBy(plannerGoalsTable.createdAt);
  res.json(rows);
});

router.post("/goals", async (req, res) => {
  const { id, name, amount } = req.body as { id: string; name: string; amount: number };
  const [row] = await db.insert(plannerGoalsTable).values({ id, name, amount: Math.round(amount) }).returning();
  res.json(row);
});

router.patch("/goals/:id", async (req, res) => {
  const { name, amount } = req.body as { name?: string; amount?: number };
  const updates: Partial<{ name: string; amount: number }> = {};
  if (name   !== undefined) updates.name   = name;
  if (amount !== undefined) updates.amount = Math.round(amount);
  const [row] = await db.update(plannerGoalsTable).set(updates).where(eq(plannerGoalsTable.id, req.params.id)).returning();
  res.json(row);
});

router.delete("/goals/:id", async (req, res) => {
  await db.delete(plannerGoalsTable).where(eq(plannerGoalsTable.id, req.params.id));
  res.json({ ok: true });
});

/* ── Expenses ── */
router.get("/expenses", async (_req, res) => {
  const rows = await db.select().from(plannerExpensesTable).orderBy(plannerExpensesTable.date);
  res.json(rows);
});

router.post("/expenses", async (req, res) => {
  const { id, description, amount, date } = req.body as { id: string; description: string; amount: number; date: string };
  const [row] = await db.insert(plannerExpensesTable).values({ id, description, amount: Math.round(amount), date }).returning();
  res.json(row);
});

router.delete("/expenses/:id", async (req, res) => {
  await db.delete(plannerExpensesTable).where(eq(plannerExpensesTable.id, req.params.id));
  res.json({ ok: true });
});

export default router;
