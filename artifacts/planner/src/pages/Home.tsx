import { useState, useRef, useEffect, useCallback } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isToday, isWeekend, parseISO,
  startOfWeek, endOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, X, Check,
  Pencil, Trash2, Clock,
  Briefcase, Star, Car, UtensilsCrossed,
  Copy, CalendarDays,
  Wallet, Target, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownRight, Trophy, Receipt,
} from "lucide-react";
import { usePlanner } from "../hooks/use-planner";
import {
  Entity, PlannerEvent, Goal, Expense, EventStatus, EventIcon,
  STATUS_COLORS, STATUS_LABELS, STATUS_CYCLE,
  EVENT_ICON_LABELS,
} from "../types";

/* ── Icon registry ── */
const EVENT_ICONS: Record<EventIcon, React.ReactNode> = {
  none:      null,
  briefcase: <Briefcase className="w-full h-full"/>,
  star:      <Star className="w-full h-full"/>,
  car:       <Car className="w-full h-full"/>,
  food:      <UtensilsCrossed className="w-full h-full"/>,
};

/* ── Inline icon renderer ── */
function EventIconBadge({ icon, size = 10 }: { icon: EventIcon; size?: number }) {
  if (!icon || icon === "none") return null;
  return (
    <span className="text-white/90 flex items-center justify-center"
      style={{ width: size, height: size }}>
      {EVENT_ICONS[icon]}
    </span>
  );
}

function genId() { return Math.random().toString(36).substring(2, 12); }

function fmtMoney(n: number): string {
  if (n === 0) return "0 ₽";
  return n.toLocaleString("ru-RU") + " ₽";
}

function fmtK(n: number): string {
  if (n >= 1000000) return `${(n/1000000).toLocaleString("ru-RU",{maximumFractionDigits:1})} М`;
  if (n >= 1000)    return `${(n/1000).toLocaleString("ru-RU",{maximumFractionDigits:1})} к`;
  return `${n}`;
}

const DAY_SHORT = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

const MONTH_NAMES = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

/* Module-level drag + clipboard state */
let activeDrag: { eventId: string; srcEntityId: string; srcDate: string } | null = null;
let hoveredPasteTarget: { entityId: string; date: string } | null = null;
let hoveredEventForCopy: PlannerEvent | null = null;

type CtxMenu = { x: number; y: number; event: PlannerEvent } | null;
type Popup =
  | { mode: "add";  entityId: string; date: string; anchor: DOMRect }
  | { mode: "view"; event: PlannerEvent; anchor: DOMRect }
  | null;

/* ─────────────────────── Home ─────────────────────── */
export default function Home() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const {
    entities, events, goals, expenses, loading,
    addEntity, deleteEntity, renameEntity,
    addEvent, updateEvent, deleteEvent, moveEvent,
    getEventsForCell, getEventCountForEntity, getAllEventsForDay,
    addGoal, updateGoal, deleteGoal,
    addExpense, deleteExpense,
  } = usePlanner();

  const [popup,           setPopup]          = useState<Popup>(null);
  const [ctxMenu,         setCtxMenu]        = useState<CtxMenu>(null);
  const [dragOverKey,     setDragOverKey]    = useState<string | null>(null);
  const [newEntityName,   setNewEntityName]  = useState("");
  const [showAddRow,      setShowAddRow]     = useState(false);
  const [copiedEvent,     setCopiedEvent]    = useState<PlannerEvent | null>(null);
  const copiedEventRef = useRef<PlannerEvent | null>(null);

  /* month picker */
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear,      setPickerYear]      = useState(() => new Date().getFullYear());

  /* sidebar sections */
  const [showGoals,    setShowGoals]    = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);

  /* add expense form */
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpDesc,     setNewExpDesc]     = useState("");
  const [newExpAmount,   setNewExpAmount]   = useState("");
  const [newExpDate,     setNewExpDate]     = useState(() => format(new Date(), "yyyy-MM-dd"));

  const addRowRef  = useRef<HTMLInputElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);
  const ctxRef     = useRef<HTMLDivElement>(null);
  const pickerRef  = useRef<HTMLDivElement>(null);
  const todayThRef = useRef<HTMLTableCellElement>(null);
  const gridRef    = useRef<HTMLDivElement>(null);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end:   endOfMonth(currentMonth),
  });

  /* scroll to today */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (todayThRef.current && gridRef.current) {
        const g = gridRef.current;
        const th = todayThRef.current;
        g.scrollTo({ left: th.offsetLeft - g.clientWidth / 2 + th.offsetWidth / 2, behavior: "smooth" });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [currentMonth]);

  /* keep copiedEvent ref in sync */
  useEffect(() => { copiedEventRef.current = copiedEvent; }, [copiedEvent]);

  /* global Escape / outside-click / Ctrl+C / Ctrl+V / month picker close */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isText = tag === "INPUT" || tag === "TEXTAREA";

      if (e.key === "Escape") {
        setPopup(null); setCtxMenu(null); setCopiedEvent(null); setShowMonthPicker(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !isText) {
        const ev = hoveredEventForCopy;
        if (!ev) return;
        e.preventDefault();
        setCopiedEvent({ ...ev });
        copiedEventRef.current = { ...ev };
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !isText) {
        const ev = copiedEventRef.current;
        const target = hoveredPasteTarget;
        if (!ev || !target) return;
        e.preventDefault();
        addEventRef.current({ ...ev, id: genId(), entityId: target.entityId, date: target.date });
        return;
      }
    };
    const onDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null);
      if (ctxRef.current  && !ctxRef.current.contains(e.target as Node))   setCtxMenu(null);
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowMonthPicker(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);

  useEffect(() => { if (showAddRow) addRowRef.current?.focus(); }, [showAddRow]);

  const handleAddEntity = () => {
    const name = newEntityName.trim();
    if (!name) return;
    addEntity(name);
    setNewEntityName("");
    setShowAddRow(false);
  };

  const addEventRef = useRef<(ev: PlannerEvent) => void>(addEvent);
  useEffect(() => { addEventRef.current = addEvent; }, [addEvent]);

  const openAdd  = useCallback((entityId: string, date: string, anchor: DOMRect) => {
    setCtxMenu(null);
    if (copiedEventRef.current) {
      addEventRef.current({ ...copiedEventRef.current, id: genId(), entityId, date });
      setCopiedEvent(null);
      copiedEventRef.current = null;
      return;
    }
    setPopup({ mode: "add", entityId, date, anchor });
  }, []);

  const openView = useCallback((event: PlannerEvent, anchor: DOMRect) => {
    setCtxMenu(null); setPopup({ mode: "view", event, anchor });
  }, []);

  const openCtx = useCallback((e: MouseEvent, event: PlannerEvent) => {
    e.preventDefault(); setPopup(null);
    setCtxMenu({ x: e.clientX, y: e.clientY, event });
  }, []);

  /* marking done = setting status to "past" */
  const handleMarkPast = useCallback((ev: PlannerEvent) => {
    updateEvent({ ...ev, status: ev.status === "past" ? "upcoming" : "past" });
  }, [updateEvent]);

  const handleDragStart = useCallback((eventId: string, srcEntityId: string, srcDate: string) => {
    activeDrag = { eventId, srcEntityId, srcDate };
  }, []);
  const handleDragEnd = useCallback(() => { activeDrag = null; setDragOverKey(null); }, []);
  const handleDragOver = useCallback((key: string, e: React.DragEvent) => { e.preventDefault(); setDragOverKey(key); }, []);
  const handleDrop = useCallback((targetEntityId: string, targetDate: string) => {
    if (!activeDrag) return;
    if (activeDrag.srcEntityId !== targetEntityId || activeDrag.srcDate !== targetDate) {
      moveEvent(activeDrag.eventId, targetEntityId, targetDate);
    }
    activeDrag = null; setDragOverKey(null);
  }, [moveEvent]);

  /* stats */
  const upcomingN     = events.filter(e => e.status === "upcoming").length;
  const pastN         = events.filter(e => e.status === "past").length;
  const totalEarnings = events.reduce((s, e) => s + (e.earnings ?? 0), 0);
  const totalDiaryExp = expenses.reduce((s, e) => s + e.amount, 0);
  const netBalance    = totalEarnings - totalDiaryExp;

  /* Week grouping */
  const weekGroups = (() => {
    const groups: Date[][] = [];
    let cur: Date[] = [];
    days.forEach(d => {
      if (d.getDay() === 1 && cur.length) { groups.push(cur); cur = []; }
      cur.push(d);
    });
    if (cur.length) groups.push(cur);
    return groups;
  })();

  const weekEarnings = (wDays: Date[]): number => {
    const s = format(wDays[0], "yyyy-MM-dd");
    const e = format(wDays[wDays.length - 1], "yyyy-MM-dd");
    return events.filter(ev => ev.date >= s && ev.date <= e).reduce((sum, ev) => sum + (ev.earnings ?? 0), 0);
  };

  /* Week earnings for this week (sidebar) */
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr   = format(weekEnd, "yyyy-MM-dd");
  const thisWeekEarnings = events
    .filter(ev => ev.date >= weekStartStr && ev.date <= weekEndStr)
    .reduce((s, e) => s + (e.earnings ?? 0), 0);

  /* popup position */
  function popupStyle(anchor: DOMRect, w = 300, h = 360): React.CSSProperties {
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = anchor.left + anchor.width / 2 - w / 2;
    let top  = anchor.bottom + 8;
    if (left + w > vw - 8) left = vw - w - 8;
    if (left < 8) left = 8;
    if (top + h > vh - 8) top = anchor.top - h - 8;
    return { position: "fixed", left, top, width: w, zIndex: 50 };
  }

  /* ── Design tokens ── */
  const BASE   = "#0f1219";
  const PANEL  = "#131926";
  const BLUE   = "#5b9cf6";
  const GREEN  = "#3ecf8e";
  const SLATE  = "#546070";
  const RED    = "#ef4444";
  const FG     = "#c2cfdc";
  const FG_MED = "#6d8396";
  const FG_DIM = "#374557";
  const BORDER = "rgba(255,255,255,0.07)";

  /* add expense */
  const handleAddExpense = () => {
    const desc = newExpDesc.trim();
    const amt  = parseFloat(newExpAmount);
    if (!desc || isNaN(amt) || amt <= 0) return;
    addExpense(desc, Math.round(amt), newExpDate);
    setNewExpDesc(""); setNewExpAmount("");
    setNewExpDate(format(new Date(), "yyyy-MM-dd"));
    setShowAddExpense(false);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: BASE, color: FG, fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside style={{
        width: 268, flexShrink: 0,
        background: PANEL,
        borderRight: `1px solid ${BORDER}`,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}>
        {/* ── Header: brand + month nav ── */}
        <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, position: "relative" }}>
          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: BLUE, opacity: 0.9,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <CalendarDays style={{ width: 14, height: 14, color: "#fff" }}/>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: FG, letterSpacing: "-0.02em", lineHeight: 1 }}>
                Мои смены
              </div>
              <div style={{ fontSize: 10, color: FG_DIM, marginTop: 3 }}>
                {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </div>
            </div>
          </div>

          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: `1px solid ${BORDER}`, background: "transparent", cursor: "pointer", color: FG_DIM, flexShrink: 0 }}>
              <ChevronLeft style={{ width: 11, height: 11 }}/>
            </button>
            {/* Clickable month name opens picker */}
            <button
              onClick={() => { setShowMonthPicker(v => !v); setPickerYear(currentMonth.getFullYear()); }}
              style={{ flex: 1, fontSize: 12, fontWeight: 600, color: FG_MED, background: "transparent", border: "none", cursor: "pointer", textAlign: "center", padding: "4px 6px", borderRadius: 6, transition: "background 0.12s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              {MONTH_NAMES[currentMonth.getMonth()]} ▾
            </button>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: `1px solid ${BORDER}`, background: "transparent", cursor: "pointer", color: FG_DIM, flexShrink: 0 }}>
              <ChevronRight style={{ width: 11, height: 11 }}/>
            </button>
          </div>

          {/* Month picker dropdown */}
          {showMonthPicker && (
            <div ref={pickerRef} style={{
              position: "absolute", top: "100%", left: 12, right: 12, zIndex: 100,
              background: "#1a2333", border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}>
              {/* Year nav */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <button onClick={() => setPickerYear(y => y - 1)}
                  style={{ width: 24, height: 24, border: `1px solid ${BORDER}`, borderRadius: 6, background: "transparent", cursor: "pointer", color: FG_MED, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft style={{ width: 11, height: 11 }}/>
                </button>
                <span style={{ fontSize: 13, fontWeight: 700, color: FG }}>{pickerYear}</span>
                <button onClick={() => setPickerYear(y => y + 1)}
                  style={{ width: 24, height: 24, border: `1px solid ${BORDER}`, borderRadius: 6, background: "transparent", cursor: "pointer", color: FG_MED, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronRight style={{ width: 11, height: 11 }}/>
                </button>
              </div>
              {/* Month grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                {MONTH_NAMES.map((name, i) => {
                  const isActive = i === currentMonth.getMonth() && pickerYear === currentMonth.getFullYear();
                  return (
                    <button key={i}
                      onClick={() => { setCurrentMonth(new Date(pickerYear, i, 1)); setShowMonthPicker(false); }}
                      style={{
                        fontSize: 11, fontWeight: isActive ? 700 : 500,
                        padding: "5px 3px", borderRadius: 6, cursor: "pointer", border: "none",
                        background: isActive ? BLUE : "rgba(255,255,255,0.04)",
                        color: isActive ? "#fff" : FG_MED,
                        transition: "all 0.1s",
                      }}>
                      {name.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="sb-thin" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0" }}>

          {/* ── Month earnings ── */}
          {totalEarnings > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: FG_DIM, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                Заработок за месяц
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: GREEN, letterSpacing: "-0.04em", lineHeight: 1 }}>
                {fmtK(totalEarnings)} <span style={{ fontSize: 15, fontWeight: 600 }}>₽</span>
              </div>
              {thisWeekEarnings > 0 && (
                <div style={{ fontSize: 11, color: FG_DIM, marginTop: 4 }}>
                  {fmtK(thisWeekEarnings)} ₽ на этой неделе
                </div>
              )}
              {totalDiaryExp > 0 && (
                <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: FG_DIM }}>Траты:</span>
                    <span style={{ color: RED, fontWeight: 600 }}>−{fmtK(totalDiaryExp)} ₽</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: FG_MED }}>Остаток:</span>
                    <span style={{ color: netBalance >= 0 ? GREEN : RED }}>{fmtK(netBalance)} ₽</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Stats ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: FG_DIM, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Смены в {MONTH_NAMES[currentMonth.getMonth()].toLowerCase()}е
            </div>
            {[
              { n: upcomingN, label: "будущих",   color: BLUE  },
              { n: pastN,     label: "прошедших", color: SLATE },
            ].map(({ n, label, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }}/>
                  <span style={{ fontSize: 12, color: FG_MED }}>{label}</span>
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: "-0.03em" }}>{n}</span>
              </div>
            ))}
          </div>

          {/* divider */}
          <div style={{ height: 1, background: BORDER, marginBottom: 16 }}/>

          {/* ── Upcoming shifts ── */}
          {(() => {
            const todayStr = format(new Date(), "yyyy-MM-dd");
            const upcoming = events
              .filter(e => e.date >= todayStr && e.status === "upcoming")
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 5);
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: FG_DIM, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                  Ближайшие смены
                </div>
                {upcoming.length === 0
                  ? <p style={{ fontSize: 11, color: FG_DIM }}>Нет запланированных смен</p>
                  : upcoming.map(ev => {
                    const d = parseISO(ev.date);
                    const eName = entities.find(e => e.id === ev.entityId)?.name ?? "—";
                    return (
                      <div key={ev.id} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 0", borderBottom: `1px solid ${BORDER}`,
                      }}>
                        <div style={{ flexShrink: 0, minWidth: 32 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: FG, letterSpacing: "-0.03em", lineHeight: 1 }}>{format(d, "d")}</div>
                          <div style={{ fontSize: 9, color: FG_DIM, marginTop: 2, textTransform: "uppercase" }}>{DAY_SHORT[d.getDay()]}</div>
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, color: FG_MED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eName}</div>
                          <div style={{ fontSize: 10, color: FG_DIM, marginTop: 1 }}>09:00 – 21:00</div>
                        </div>
                        {(ev.earnings ?? 0) > 0 && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, flexShrink: 0 }}>{fmtK(ev.earnings!)} ₽</div>
                        )}
                      </div>
                    );
                  })
                }
              </div>
            );
          })()}

          {/* divider */}
          <div style={{ height: 1, background: BORDER, marginBottom: 14 }}/>

          {/* ── Goals section ── */}
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowGoals(v => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer", padding: "0 0 8px 0", marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Target style={{ width: 11, height: 11, color: "#8b5cf6" }}/>
                <span style={{ fontSize: 9, fontWeight: 700, color: FG_DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Цели</span>
                {goals.length > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#8b5cf6", background: "rgba(139,92,246,0.12)", borderRadius: 99, padding: "1px 6px" }}>{goals.length}</span>
                )}
              </div>
              {showGoals ? <ChevronUp style={{ width: 10, height: 10, color: FG_DIM }}/> : <ChevronDown style={{ width: 10, height: 10, color: FG_DIM }}/>}
            </button>

            {showGoals && (
              <GoalsSidebarSection
                goals={goals}
                monthNet={totalEarnings}
                onAddGoal={addGoal}
                onUpdateGoal={updateGoal}
                onDeleteGoal={deleteGoal}
                BLUE={BLUE} BORDER={BORDER} FG={FG} FG_MED={FG_MED} FG_DIM={FG_DIM}
              />
            )}
          </div>

          {/* divider */}
          <div style={{ height: 1, background: BORDER, marginBottom: 14 }}/>

          {/* ── Expenses diary ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <button
                onClick={() => setShowExpenses(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                <Receipt style={{ width: 11, height: 11, color: RED }}/>
                <span style={{ fontSize: 9, fontWeight: 700, color: FG_DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Траты</span>
                {expenses.length > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: RED, background: "rgba(239,68,68,0.1)", borderRadius: 99, padding: "1px 6px" }}>{expenses.length}</span>
                )}
                {showExpenses ? <ChevronUp style={{ width: 10, height: 10, color: FG_DIM }}/> : <ChevronDown style={{ width: 10, height: 10, color: FG_DIM }}/>}
              </button>
              <button
                onClick={() => setShowAddExpense(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: FG_DIM, cursor: "pointer", background: "transparent", border: "none", padding: "2px 4px", borderRadius: 4, transition: "color 0.1s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BLUE; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = FG_DIM; }}>
                <Plus style={{ width: 9, height: 9 }}/> Добавить
              </button>
            </div>

            {/* Add expense form */}
            {showAddExpense && (
              <div style={{ marginBottom: 10, padding: "10px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.02)" }}>
                <input
                  placeholder="Описание траты..."
                  value={newExpDesc}
                  onChange={e => setNewExpDesc(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddExpense(); if (e.key === "Escape") setShowAddExpense(false); }}
                  style={{ width: "100%", fontSize: 12, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 8px", color: FG, outline: "none", marginBottom: 6, boxSizing: "border-box" }}
                  autoFocus
                />
                <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: RED }}>₽</span>
                    <input
                      type="number" min="0" step="100"
                      placeholder="Сумма"
                      value={newExpAmount}
                      onChange={e => setNewExpAmount(e.target.value)}
                      style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 6px 5px 20px", color: FG, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <input
                    type="date"
                    value={newExpDate}
                    onChange={e => setNewExpDate(e.target.value)}
                    style={{ flex: 1, fontSize: 10, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 5px", color: FG_MED, outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={handleAddExpense}
                    disabled={!newExpDesc.trim() || !newExpAmount}
                    style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "5px", borderRadius: 6, background: BLUE, color: "#fff", border: "none", cursor: "pointer", opacity: (newExpDesc.trim() && newExpAmount) ? 1 : 0.4 }}>
                    Добавить
                  </button>
                  <button onClick={() => { setShowAddExpense(false); setNewExpDesc(""); setNewExpAmount(""); }}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: "transparent", border: `1px solid ${BORDER}`, color: FG_DIM, cursor: "pointer" }}>
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {showExpenses && expenses.length > 0 && (
              <div>
                {expenses.slice(0, 6).map(exp => (
                  <div key={exp.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 0", borderBottom: `1px solid ${BORDER}`,
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, color: FG_MED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exp.description}</div>
                      <div style={{ fontSize: 9, color: FG_DIM, marginTop: 1 }}>{exp.date}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>−{fmtK(exp.amount)} ₽</span>
                      <button onClick={() => deleteExpense(exp.id)}
                        style={{ width: 16, height: 16, border: "none", background: "transparent", cursor: "pointer", color: FG_DIM, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <X style={{ width: 10, height: 10 }}/>
                      </button>
                    </div>
                  </div>
                ))}
                {expenses.length > 6 && (
                  <div style={{ fontSize: 10, color: FG_DIM, paddingTop: 6, textAlign: "center" }}>
                    + ещё {expenses.length - 6} трат
                  </div>
                )}
              </div>
            )}
          </div>

          {/* bottom padding */}
          <div style={{ height: 16 }}/>
        </div>

        {/* ── Footer: Add location ── */}
        <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {showAddRow ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                ref={addRowRef}
                value={newEntityName}
                onChange={e => setNewEntityName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleAddEntity();
                  if (e.key === "Escape") { setNewEntityName(""); setShowAddRow(false); }
                }}
                placeholder="Название объекта..."
                style={{
                  flex: 1, minWidth: 0, fontSize: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${BLUE}66`,
                  borderRadius: 7, padding: "7px 10px",
                  color: FG, outline: "none",
                }}
              />
              <button onClick={handleAddEntity} disabled={!newEntityName.trim()}
                style={{ padding: "7px 12px", borderRadius: 7, background: BLUE, color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0, opacity: newEntityName.trim() ? 1 : 0.4 }}>
                OK
              </button>
              <button onClick={() => { setNewEntityName(""); setShowAddRow(false); }}
                style={{ width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: FG_DIM, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X style={{ width: 12, height: 12 }}/>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddRow(true)}
              style={{
                width: "100%", padding: "8px 0", borderRadius: 8,
                background: "transparent",
                border: `1px dashed ${BORDER}`,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 7, color: FG_DIM, fontSize: 12, transition: "all 0.15s",
              }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = BLUE; b.style.color = BLUE; }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = BORDER; b.style.color = FG_DIM; }}>
              <Plus style={{ width: 12, height: 12 }}/> Добавить объект
            </button>
          )}
        </div>
      </aside>

      {/* ═══════════════ MAIN ═══════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── Topbar ── */}
        <div style={{
          height: 44, flexShrink: 0,
          display: "flex", alignItems: "center",
          padding: "0 18px", gap: 0,
          position: "relative", zIndex: 10,
          background: PANEL,
          borderBottom: `1px solid ${BORDER}`,
        }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ fontSize: 12, color: FG_MED }}>
              <span style={{ fontWeight: 700, color: FG }}>{entities.length}</span>{" "}
              {entities.length === 1 ? "объект" : entities.length < 5 ? "объекта" : "объектов"}
            </span>
            <span style={{ width: 1, height: 12, background: BORDER, flexShrink: 0 }}/>
            <span style={{ fontSize: 12, color: FG_MED }}>
              <span style={{ fontWeight: 700, color: BLUE }}>{upcomingN}</span>{" "}будущих
            </span>
            <span style={{ width: 1, height: 12, background: BORDER, flexShrink: 0 }}/>
            <span style={{ fontSize: 12, color: FG_MED }}>
              <span style={{ fontWeight: 700, color: SLATE }}>{pastN}</span>{" "}прошедших
            </span>
            {totalEarnings > 0 && (
              <>
                <span style={{ width: 1, height: 12, background: BORDER, flexShrink: 0 }}/>
                <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>{fmtK(totalEarnings)} ₽</span>
              </>
            )}
          </div>
        </div>

        {/* ── Grid ── */}
        <div ref={gridRef} className="sb-thin" style={{ flex: 1, overflow: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: FG_DIM, fontSize: 13 }}>
              Загрузка…
            </div>
          ) : (
            <table style={{
              tableLayout: "fixed", borderCollapse: "separate", borderSpacing: "2px",
              background: BASE, width: "100%",
            }}>
              <colgroup>
                <col style={{ width: 220, minWidth: 180 }}/>
                {days.map(d => <col key={d.toISOString()}/>)}
              </colgroup>

              <thead style={{ position: "sticky", top: 0, zIndex: 20, background: BASE }}>
                {/* Week earning badges row */}
                <tr>
                  <th style={{ background: BASE, position: "sticky", left: 0, zIndex: 30, padding: "8px 10px 2px 12px" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: FG_DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Объект
                    </span>
                  </th>
                  {weekGroups.map((wDays, wi) => {
                    const earn = weekEarnings(wDays);
                    return (
                      <th key={wi} colSpan={wDays.length}
                        style={{
                          background: BASE, padding: "8px 0 2px", textAlign: "center", verticalAlign: "middle",
                          borderLeft: wi > 0 ? `4px solid ${BASE}` : undefined,
                        }}>
                        {earn > 0 ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center",
                            fontSize: 9, fontWeight: 700, color: GREEN,
                            background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)",
                            borderRadius: 99, padding: "2px 7px",
                          }}>
                            {fmtK(earn)} ₽
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, color: FG_DIM, opacity: 0.4 }}>—</span>
                        )}
                      </th>
                    );
                  })}
                </tr>

                {/* Day labels row */}
                <tr>
                  <th style={{ background: BASE, position: "sticky", left: 0, zIndex: 30, padding: "2px 10px 6px 12px" }}/>
                  {days.map(day => {
                    const tod = isToday(day), wknd = isWeekend(day);
                    return (
                      <th key={day.toISOString()}
                        ref={tod ? todayThRef : undefined}
                        style={{
                          background: "transparent",
                          padding: "2px 0 6px",
                          textAlign: "center", verticalAlign: "bottom",
                          borderLeft: day.getDay() === 1 ? `4px solid ${BASE}` : undefined,
                        }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <span style={{
                            fontSize: 8, fontWeight: 500,
                            color: wknd ? "rgba(226,232,240,0.14)" : "rgba(226,232,240,0.28)",
                            letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1,
                          }}>
                            {DAY_SHORT[day.getDay()]}
                          </span>
                          <span style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: tod ? 22 : 18, height: tod ? 22 : 18,
                            borderRadius: tod ? 8 : 5,
                            fontSize: tod ? 10 : 9,
                            fontWeight: tod ? 700 : 500,
                            background: tod ? BLUE : "transparent",
                            color: tod ? "#fff" : wknd ? FG_DIM : FG_MED,
                            transition: "all 0.2s",
                          }}>
                            {format(day, "d")}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {entities.length === 0 && (
                  <tr>
                    <td colSpan={days.length + 1}
                      style={{ background: "transparent", padding: "80px 0", textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: 16,
                          background: `${BLUE}14`, border: `1px solid ${BLUE}33`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <CalendarDays style={{ width: 22, height: 22, color: BLUE }}/>
                        </div>
                        <p style={{ fontSize: 14, color: FG_MED, fontWeight: 600 }}>Нет объектов</p>
                        <p style={{ fontSize: 12, color: FG_DIM }}>Добавьте объект через кнопку в левой панели</p>
                      </div>
                    </td>
                  </tr>
                )}

                {entities.map(entity => (
                  <EntityRow
                    key={entity.id}
                    entity={entity}
                    days={days}
                    eventCount={getEventCountForEntity(entity.id)}
                    getEventsForCell={getEventsForCell}
                    dragOverKey={dragOverKey}
                    onCellClick={openAdd}
                    onEventClick={openView}
                    onContextMenu={openCtx}
                    onShiftClick={ev => {
                      const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(ev.status as EventStatus) + 1) % STATUS_CYCLE.length] as EventStatus;
                      updateEvent({ ...ev, status: next });
                    }}
                    onMarkPast={handleMarkPast}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDeleteEntity={deleteEntity}
                    onRenameEntity={renameEntity}
                    copiedEventId={copiedEvent?.id ?? null}
                    onCopyEvent={ev => { setCopiedEvent(ev); copiedEventRef.current = ev; }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ═══ Popup ═══ */}
      {popup && (
        <div ref={popupRef} style={popupStyle(popup.anchor)}>
          {popup.mode === "add" && (
            <AddEventPopup entityId={popup.entityId} date={popup.date}
              onClose={() => setPopup(null)}
              onAdd={ev => { addEvent(ev); setPopup(null); }}/>
          )}
          {popup.mode === "view" && (
            <ViewPopup event={popup.event}
              onClose={() => setPopup(null)}
              onStatusChange={status => { updateEvent({ ...popup.event, status }); setPopup(null); }}
              onDelete={() => { deleteEvent(popup.event.id); setPopup(null); }}
              onSave={upd => { updateEvent(upd); setPopup(null); }}/>
          )}
        </div>
      )}

      {/* ═══ Context menu ═══ */}
      {ctxMenu && (
        <div ref={ctxRef}
          style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 60 }}
          className="w-44 rounded-lg border border-border bg-popover shadow-2xl overflow-hidden py-1"
          onClick={e => e.stopPropagation()}>
          <div className="px-3 py-1.5 border-b border-border mb-1">
            <p className="text-[11px] font-semibold text-foreground truncate">{ctxMenu.event.date}</p>
          </div>
          {/* Status options — only 2 real statuses */}
          {STATUS_CYCLE.map(s => (
            <button key={s}
              onClick={() => { updateEvent({ ...ctxMenu.event, status: s }); setCtxMenu(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left ${ctxMenu.event.status === s ? "bg-accent/50 font-medium" : ""}`}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }}/>
              {STATUS_LABELS[s]}
              {ctxMenu.event.status === s && <Check className="w-3 h-3 ml-auto text-primary"/>}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={() => { setCopiedEvent(ctxMenu.event); copiedEventRef.current = ctxMenu.event; setCtxMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left text-sky-300/80 hover:text-sky-300">
              <Copy className="w-3 h-3"/> Копировать <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">Ctrl+C</span>
            </button>
            <button
              onClick={() => {
                const el = document.querySelector(`[data-event-id="${ctxMenu.event.id}"]`);
                const rect = el?.getBoundingClientRect() ?? new DOMRect(ctxMenu.x, ctxMenu.y, 0, 0);
                setPopup({ mode: "view", event: ctxMenu.event, anchor: rect });
                setCtxMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left">
              <Pencil className="w-3 h-3 text-muted-foreground"/> Редактировать
            </button>
            <button
              onClick={() => { deleteEvent(ctxMenu.event.id); setCtxMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left text-destructive">
              <Trash2 className="w-3 h-3"/> Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── GoalsSidebarSection ─────────────────────── */
function GoalsSidebarSection({
  goals, monthNet,
  onAddGoal, onUpdateGoal, onDeleteGoal,
  BLUE, BORDER, FG, FG_MED, FG_DIM,
}: {
  goals: Goal[]; monthNet: number;
  onAddGoal: (name: string, amount: number) => void;
  onUpdateGoal: (g: Goal) => void;
  onDeleteGoal: (id: string) => void;
  BLUE: string; BORDER: string; FG: string; FG_MED: string; FG_DIM: string;
}) {
  const [showAdd,    setShowAdd]    = useState(false);
  const [newName,    setNewName]    = useState("");
  const [newAmount,  setNewAmount]  = useState("");
  const [editId,     setEditId]     = useState<string | null>(null);
  const [editName,   setEditName]   = useState("");
  const [editAmount, setEditAmount] = useState("");

  const handleAdd = () => {
    const name = newName.trim();
    const amt  = parseFloat(newAmount);
    if (!name || isNaN(amt) || amt <= 0) return;
    onAddGoal(name, amt);
    setNewName(""); setNewAmount(""); setShowAdd(false);
  };

  const handleSaveEdit = (id: string) => {
    const name = editName.trim();
    const amt  = parseFloat(editAmount);
    if (!name || isNaN(amt) || amt <= 0) return;
    onUpdateGoal({ id, name, amount: amt });
    setEditId(null);
  };

  return (
    <div>
      <button
        onClick={() => setShowAdd(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: FG_DIM, cursor: "pointer", background: "transparent", border: "none", padding: "0 0 6px 0", transition: "color 0.1s" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = BLUE; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = FG_DIM; }}>
        <Plus style={{ width: 9, height: 9 }}/> Добавить цель
      </button>

      {showAdd && (
        <div style={{ marginBottom: 8, padding: 8, borderRadius: 7, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.02)" }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Название цели"
            style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "4px 7px", color: FG, outline: "none", marginBottom: 5, boxSizing: "border-box" }}/>
          <div style={{ position: "relative", marginBottom: 5 }}>
            <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: "#8b5cf6" }}>₽</span>
            <input type="number" min="0" step="1000" value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              placeholder="Сумма цели"
              style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "4px 6px 4px 20px", color: FG, outline: "none", boxSizing: "border-box" }}/>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={handleAdd}
              style={{ flex: 1, fontSize: 10, fontWeight: 600, padding: "4px", borderRadius: 5, background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer" }}>
              Сохранить
            </button>
            <button onClick={() => { setShowAdd(false); setNewName(""); setNewAmount(""); }}
              style={{ fontSize: 10, padding: "4px 8px", borderRadius: 5, background: "transparent", border: `1px solid ${BORDER}`, color: FG_DIM, cursor: "pointer" }}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {goals.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <Trophy style={{ width: 20, height: 20, color: FG_DIM, margin: "0 auto 6px", opacity: 0.3 }}/>
          <p style={{ fontSize: 11, color: FG_DIM, opacity: 0.5 }}>Нет целей</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {goals.map(goal => {
          const progress = monthNet > 0 ? Math.min(1, monthNet / goal.amount) : 0;
          const reached  = monthNet >= goal.amount;
          const isEditing = editId === goal.id;

          return (
            <div key={goal.id} style={{
              borderRadius: 8, border: `1px solid ${reached ? "rgba(16,185,129,0.25)" : BORDER}`,
              background: reached ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.02)",
              padding: "8px 10px",
            }}>
              {isEditing ? (
                <div>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "3px 7px", color: FG, outline: "none", marginBottom: 5, boxSizing: "border-box" }}/>
                  <div style={{ position: "relative", marginBottom: 5 }}>
                    <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: "#8b5cf6" }}>₽</span>
                    <input type="number" min="0" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(goal.id); }}
                      style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "3px 6px 3px 20px", color: FG, outline: "none", boxSizing: "border-box" }}/>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => handleSaveEdit(goal.id)}
                      style={{ flex: 1, fontSize: 10, fontWeight: 600, padding: "3px", borderRadius: 4, background: BLUE, color: "#fff", border: "none", cursor: "pointer" }}>
                      <Check style={{ width: 10, height: 10, display: "inline", marginRight: 2 }}/>Сохранить
                    </button>
                    <button onClick={() => setEditId(null)}
                      style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "transparent", border: `1px solid ${BORDER}`, color: FG_DIM, cursor: "pointer" }}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
                      {reached
                        ? <Trophy style={{ width: 11, height: 11, color: "#3ecf8e", flexShrink: 0 }}/>
                        : <Target style={{ width: 11, height: 11, color: "#8b5cf670", flexShrink: 0 }}/>
                      }
                      <span style={{ fontSize: 12, fontWeight: 600, color: FG, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{goal.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0, marginLeft: 4 }}>
                      <button onClick={() => { setEditId(goal.id); setEditName(goal.name); setEditAmount(String(goal.amount)); }}
                        style={{ width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", color: FG_DIM, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil style={{ width: 9, height: 9 }}/>
                      </button>
                      <button onClick={() => onDeleteGoal(goal.id)}
                        style={{ width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", color: FG_DIM, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <X style={{ width: 9, height: 9 }}/>
                      </button>
                    </div>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3, color: FG_DIM }}>
                      <span>{fmtK(Math.max(0, monthNet))} / {fmtK(goal.amount)} ₽</span>
                      <span style={{ fontWeight: 700, color: reached ? "#3ecf8e" : "#8b5cf6" }}>{Math.round(progress * 100)}%</span>
                    </div>
                    <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 99, transition: "width 0.3s",
                        width: `${progress * 100}%`,
                        background: reached ? "#10b981" : "linear-gradient(90deg, #8b5cf6, #6366f1)",
                      }}/>
                    </div>
                  </div>
                  {reached && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#3ecf8e" }}>🎉 Цель достигнута!</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────── EntityRow ─────────────────────── */
interface EntityRowProps {
  entity: Entity;
  days: Date[];
  eventCount: number;
  dragOverKey: string | null;
  getEventsForCell: (eId: string, date: string) => PlannerEvent[];
  onCellClick: (eId: string, date: string, rect: DOMRect) => void;
  onEventClick: (ev: PlannerEvent, rect: DOMRect) => void;
  onContextMenu: (e: MouseEvent, ev: PlannerEvent) => void;
  onShiftClick: (ev: PlannerEvent) => void;
  onMarkPast: (ev: PlannerEvent) => void;
  onDragStart: (evId: string, srcEId: string, srcDate: string) => void;
  onDragEnd: () => void;
  onDragOver: (key: string, e: React.DragEvent) => void;
  onDrop: (tgtEId: string, tgtDate: string) => void;
  onDeleteEntity: (id: string) => void;
  onRenameEntity: (id: string, name: string) => void;
  copiedEventId: string | null;
  onCopyEvent: (ev: PlannerEvent) => void;
}

function EntityRow({
  entity, days, eventCount: _eventCount, dragOverKey,
  getEventsForCell, onCellClick, onEventClick, onContextMenu, onShiftClick, onMarkPast,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onDeleteEntity, onRenameEntity, copiedEventId, onCopyEvent: _onCopyEvent,
}: EntityRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(entity.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setEditName(entity.name); }, [entity.name]);

  const commit = () => {
    const n = editName.trim();
    if (n && n !== entity.name) onRenameEntity(entity.id, n);
    else setEditName(entity.name);
    setEditing(false);
  };

  const BASE_R  = "#0f1219";
  const BLUE_R  = "#5b9cf6";
  const SLATE_R = "#546070";
  const FG_R    = "#c2cfdc";
  const FG_D_R  = "#374557";

  const CELL_UPCOMING_BG = "rgba(91,156,246,0.22)";
  const CELL_PAST_BG     = "rgba(84,96,112,0.22)";
  const CELL_DRAG_BG     = "rgba(91,156,246,0.3)";

  return (
    <tr className="entity-row">
      {/* ── Entity name cell ── */}
      <td style={{
        background: BASE_R, position: "sticky", left: 0, zIndex: 10,
        padding: "0 6px 0 0", height: 44, verticalAlign: "middle",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, height: "100%", padding: "0 0 0 10px" }}>
          <div style={{
            width: 4, height: 26, borderRadius: 2,
            background: entity.color,
            flexShrink: 0,
          }}/>

          {editing ? (
            <input ref={inputRef} value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setEditName(entity.name); setEditing(false); }
              }}
              style={{ flex: 1, fontSize: 12, background: "transparent", outline: "none", borderBottom: `1px solid ${BLUE_R}`, color: FG_R, minWidth: 0, letterSpacing: "-0.01em" }}/>
          ) : (
            <span className="entity-name"
              onDoubleClick={() => setEditing(true)}
              title={entity.name}
              style={{
                fontSize: 12, fontWeight: 500,
                color: "rgba(226,232,240,0.65)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                flex: 1, cursor: "default", letterSpacing: "-0.01em",
              }}>
              {entity.name}
            </span>
          )}

          {!editing && (
            <div className="entity-actions"
              style={{ display: "flex", gap: 2, opacity: 0, transition: "opacity 0.15s", flexShrink: 0, marginRight: 2 }}>
              <button onClick={() => setEditing(true)} title="Переименовать"
                style={{ width: 20, height: 20, border: "none", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5, color: FG_D_R }}>
                <Pencil style={{ width: 9, height: 9 }}/>
              </button>
              <button onClick={() => onDeleteEntity(entity.id)} title="Удалить"
                style={{ width: 20, height: 20, border: "none", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5, color: FG_D_R }}>
                <Trash2 style={{ width: 9, height: 9 }}/>
              </button>
            </div>
          )}
        </div>
      </td>

      {/* ── Day cells ── */}
      {days.map(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        const cellEvents = getEventsForCell(entity.id, dateStr);
        const wknd = isWeekend(day);
        const tod  = isToday(day);
        const key  = `${entity.id}-${dateStr}`;
        const isDragTarget = dragOverKey === key;
        const firstEv = cellEvents[0];

        let cellBg: string | undefined;
        let leftBorderColor: string | undefined;

        if (isDragTarget) {
          cellBg = CELL_DRAG_BG;
          leftBorderColor = BLUE_R;
        } else if (firstEv) {
          const isPast = firstEv.status === "past";
          cellBg = isPast ? CELL_PAST_BG : CELL_UPCOMING_BG;
          leftBorderColor = isPast ? SLATE_R : BLUE_R;
        }

        const isWeekStart = day.getDay() === 1;
        const cellClass = !firstEv && !isDragTarget ? (wknd ? "cell-weekend" : tod ? "today-col" : "cell-empty") : "";

        return (
          <td key={dateStr}
            className={cellClass}
            style={{
              ...(cellBg ? { background: cellBg } : {}),
              borderRadius: 5,
              padding: 0,
              height: 44,
              verticalAlign: "middle",
              transition: "background 0.12s",
              borderLeft: isWeekStart ? `4px solid ${BASE_R}` : leftBorderColor ? `3px solid ${leftBorderColor}55` : undefined,
              position: "relative",
            }}
            onDragOver={e => onDragOver(key, e)}
            onDragLeave={() => {}}
            onDrop={e => { e.preventDefault(); onDrop(entity.id, dateStr); }}>
            <GridCell
              events={cellEvents}
              entityId={entity.id}
              date={dateStr}
              onAddClick={onCellClick}
              onEventClick={onEventClick}
              onContextMenu={onContextMenu}
              onShiftClick={onShiftClick}
              onMarkPast={onMarkPast}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              copiedEventId={copiedEventId}
            />
          </td>
        );
      })}
    </tr>
  );
}

/* ─────────────────────── GridCell ─────────────────────── */
interface GridCellProps {
  events: PlannerEvent[];
  entityId: string;
  date: string;
  onAddClick: (eId: string, date: string, rect: DOMRect) => void;
  onEventClick: (ev: PlannerEvent, rect: DOMRect) => void;
  onContextMenu: (e: MouseEvent, ev: PlannerEvent) => void;
  onShiftClick: (ev: PlannerEvent) => void;
  onMarkPast: (ev: PlannerEvent) => void;
  onDragStart: (evId: string, srcEId: string, srcDate: string) => void;
  onDragEnd: () => void;
  copiedEventId: string | null;
}

function GridCell({
  events, entityId, date,
  onAddClick, onEventClick, onContextMenu, onShiftClick, onMarkPast,
  onDragStart, onDragEnd, copiedEventId,
}: GridCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverCard, setHoverCard] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCellEnter = () => { hoveredPasteTarget = { entityId, date }; };
  const onCellLeave = () => { if (hoveredPasteTarget?.entityId === entityId && hoveredPasteTarget?.date === date) hoveredPasteTarget = null; };
  const showCard = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHoverCard(true); };
  const hideCard = () => { hoverTimer.current = setTimeout(() => setHoverCard(false), 80); };

  if (events.length === 0) {
    return (
      <div ref={ref}
        onMouseEnter={onCellEnter}
        onMouseLeave={onCellLeave}
        onClick={() => ref.current && onAddClick(entityId, date, ref.current.getBoundingClientRect())}
        className="group/empty"
        style={{ width: "100%", height: "100%", cursor: "pointer", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="absolute inset-0 opacity-0 group-hover/empty:opacity-100 transition-opacity duration-100"
          style={{ backgroundColor: "rgba(255,255,255,0.07)", borderRadius: "3px" }}/>
        <Plus className="w-2.5 h-2.5 opacity-0 group-hover/empty:opacity-35 transition-opacity duration-100 relative z-10" style={{ color: "#fff" }}/>
      </div>
    );
  }

  const first = events[0];
  const earn  = first.earnings ?? 0;
  const isPast = first.status === "past";

  return (
    <>
      <div ref={ref}
        data-event-id={first.id}
        draggable
        onMouseEnter={e => { onCellEnter(); hoveredEventForCopy = first; showCard(); (e.currentTarget as HTMLElement).style.filter = "brightness(1.3)"; }}
        onMouseLeave={e => { onCellLeave(); hoveredEventForCopy = null; hideCard(); (e.currentTarget as HTMLElement).style.filter = ""; }}
        onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(first.id, entityId, date); setHoverCard(false); }}
        onDragEnd={onDragEnd}
        onClick={e => {
          if (e.shiftKey) { onShiftClick(first); return; }
          ref.current && onEventClick(first, ref.current.getBoundingClientRect());
        }}
        onContextMenu={e => onContextMenu(e.nativeEvent, first)}
        style={{
          width: "100%", height: "100%",
          cursor: "grab",
          transition: "filter 0.08s",
          outline: copiedEventId === first.id ? "2px solid rgba(125,211,252,0.6)" : "none",
          outlineOffset: "-2px",
          borderRadius: "2px",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 2,
          opacity: isPast ? 0.85 : 1,
        }}>
        {/* Show earnings badge if present */}
        {earn > 0 && (
          <span style={{
            fontSize: 8, fontWeight: 700, lineHeight: 1,
            color: isPast ? "rgba(255,255,255,0.45)" : "rgba(62,207,142,0.85)",
            letterSpacing: "-0.02em",
            pointerEvents: "none", userSelect: "none",
          }}>
            {fmtK(earn)}
          </span>
        )}
        {events.length > 1 && (
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.45)", flexShrink: 0 }}/>
        )}
      </div>

      {hoverCard && (
        <EventInfoCard
          event={first}
          anchorEl={ref.current}
          onEnter={showCard}
          onLeave={hideCard}
          onMarkPast={onMarkPast}
        />
      )}
    </>
  );
}

/* ─────────────────────── EventInfoCard ─────────────────────── */
function EventInfoCard({
  event, anchorEl, onEnter, onLeave, onMarkPast,
}: {
  event: PlannerEvent;
  anchorEl: HTMLElement | null;
  onEnter: () => void;
  onLeave: () => void;
  onMarkPast: (ev: PlannerEvent) => void;
}) {
  const color = STATUS_COLORS[event.status];
  const earn  = event.earnings ?? 0;
  const isPast = event.status === "past";

  const style = (() => {
    if (!anchorEl) return { display: "none" } as React.CSSProperties;
    const r  = anchorEl.getBoundingClientRect();
    const W  = 240;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = r.right + 8;
    let top  = r.top;
    if (left + W > vw - 8) left = r.left - W - 8;
    if (left < 8) left = 8;
    if (top + 200 > vh - 8) top = vh - 208;
    if (top < 8) top = 8;
    return { position: "fixed" as const, left, top, width: W, zIndex: 9999 };
  })();

  return (
    <div style={style}
      className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}>
      <div className="h-1" style={{ backgroundColor: color }}/>
      <div className="p-3 space-y-2">
        {/* Status + label */}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}/>
          <p className="text-[10px] text-muted-foreground">{STATUS_LABELS[event.status]}</p>
        </div>

        {/* Title if present */}
        {event.title && (
          <p className="text-xs font-semibold text-foreground leading-tight">{event.title}</p>
        )}

        {/* Fixed time */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-accent/40 border border-border/40">
          <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0"/>
          <span className="text-[11px] font-semibold text-foreground">09:00 – 21:00</span>
          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">12 ч</span>
        </div>

        {/* Notes */}
        {event.notes && (
          <p className="text-[10px] text-muted-foreground/70 leading-relaxed italic border-l-2 pl-2"
            style={{ borderColor: `${color}60` }}>
            {event.notes.slice(0, 80)}{event.notes.length > 80 ? "…" : ""}
          </p>
        )}

        {/* Earnings */}
        {earn > 0 && (
          <div className="flex items-center gap-1 pt-1 border-t border-border/40">
            <ArrowUpRight className="w-3 h-3 text-emerald-400"/>
            <span className="text-[11px] font-bold text-emerald-400 tabular-nums">{fmtMoney(earn)}</span>
          </div>
        )}

        {/* Mark past/upcoming button */}
        <button
          onClick={() => onMarkPast(event)}
          className={`w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold py-1.5 rounded-lg border transition-all
            ${isPast
              ? "border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
              : "border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/10"}`}>
          {isPast ? "↑ Перевести в будущие" : "✓ Отметить выполненной"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────── AddEventPopup ─────────────────────── */
function AddEventPopup({ entityId, date, onClose, onAdd }: {
  entityId: string; date: string;
  onClose: () => void;
  onAdd: (ev: PlannerEvent) => void;
}) {
  const [title,    setTitle]    = useState("");
  const [status,   setStatus]   = useState<EventStatus>("upcoming");
  const [notes,    setNotes]    = useState("");
  const [earnings, setEarnings] = useState<string>("");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  const dateLabel = (() => {
    try { return format(parseISO(date), "d MMMM yyyy", { locale: ru }); } catch { return date; }
  })();

  const submit = () => {
    onAdd({
      id: genId(), entityId, date, status,
      title:    title.trim() || undefined,
      notes:    notes.trim() || undefined,
      earnings: earnings ? parseFloat(earnings) : undefined,
    } as PlannerEvent);
  };

  return (
    <div className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="h-0.5 transition-colors" style={{ backgroundColor: STATUS_COLORS[status] }}/>
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Новая смена</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{dateLabel}</p>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>

        <div className="space-y-2.5">
          {/* Fixed time */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/40 border border-border/60">
            <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0"/>
            <span className="text-xs font-medium text-foreground">09:00 – 21:00</span>
            <span className="ml-auto text-[10px] font-bold text-primary">12 ч</span>
          </div>

          {/* Title */}
          <input ref={titleRef}
            value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
            placeholder="Заметка к смене (необязательно)"
            className="w-full text-sm bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"/>

          {/* Status — 2 options */}
          <div className="flex gap-1.5">
            {STATUS_CYCLE.map(s => (
              <button key={s}
                onClick={() => setStatus(s)}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all border
                  ${status === s ? "text-white border-transparent" : "border-border text-muted-foreground hover:border-border/80"}`}
                style={status === s ? { backgroundColor: STATUS_COLORS[s] } : {}}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Earnings */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 text-xs font-bold">₽</span>
            <input
              type="number" min="0" step="100"
              value={earnings} onChange={e => setEarnings(e.target.value)}
              placeholder="Заработок за смену"
              className="w-full text-xs bg-accent/40 border border-border rounded-lg pl-7 pr-3 py-1.5 outline-none focus:border-emerald-500/60 text-foreground placeholder:text-muted-foreground transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
          </div>

          {/* Notes */}
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Примечания..." rows={2}
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors resize-none"/>
        </div>

        <button onClick={submit}
          className="w-full mt-3 text-xs font-semibold py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          Добавить смену
        </button>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">Enter — сохранить · Esc — закрыть</p>
      </div>
    </div>
  );
}

/* ─────────────────────── ViewPopup ─────────────────────── */
function ViewPopup({ event, onClose, onStatusChange, onDelete, onSave }: {
  event: PlannerEvent;
  onClose: () => void;
  onStatusChange: (s: EventStatus) => void;
  onDelete: () => void;
  onSave: (upd: PlannerEvent) => void;
}) {
  const [editTitle,    setEditTitle]    = useState(event.title ?? "");
  const [editNotes,    setEditNotes]    = useState(event.notes ?? "");
  const [editEarnings, setEditEarnings] = useState<string>(event.earnings != null ? String(event.earnings) : "");
  const [dirty,        setDirty]        = useState(false);

  const dateLabel = (() => {
    try { return format(parseISO(event.date), "d MMMM yyyy", { locale: ru }); } catch { return event.date; }
  })();

  const mark = () => setDirty(true);

  const save = () => {
    onSave({
      ...event,
      title:    editTitle.trim() || undefined,
      notes:    editNotes.trim() || undefined,
      earnings: editEarnings ? parseFloat(editEarnings) : undefined,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="h-0.5" style={{ backgroundColor: STATUS_COLORS[event.status] }}/>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{dateLabel}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">09:00 – 21:00 · 12 ч</p>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0">
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>

        <div className="space-y-2.5 mb-3">
          {/* Status — 2 options */}
          <div className="flex gap-1.5">
            {STATUS_CYCLE.map(s => (
              <button key={s}
                onClick={() => onStatusChange(s)}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all border
                  ${event.status === s ? "text-white border-transparent" : "border-border text-muted-foreground hover:border-border/80"}`}
                style={event.status === s ? { backgroundColor: STATUS_COLORS[s] } : {}}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Title */}
          <input value={editTitle} onChange={e => { setEditTitle(e.target.value); mark(); }}
            placeholder="Заметка к смене (необязательно)"
            className="w-full text-sm bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"/>

          {/* Earnings */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 text-xs font-bold">₽</span>
            <input
              type="number" min="0" step="100"
              value={editEarnings} onChange={e => { setEditEarnings(e.target.value); mark(); }}
              placeholder="Заработок за смену"
              className="w-full text-xs bg-accent/40 border border-border rounded-lg pl-7 pr-3 py-1.5 outline-none focus:border-emerald-500/60 text-foreground placeholder:text-muted-foreground transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
          </div>

          {/* Notes */}
          <textarea value={editNotes} onChange={e => { setEditNotes(e.target.value); mark(); }}
            placeholder="Примечания..." rows={2}
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors resize-none"/>
        </div>

        <div className="flex items-center gap-2">
          {dirty ? (
            <button onClick={save}
              className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1">
              <Check className="w-3 h-3"/> Сохранить
            </button>
          ) : (
            <div className="flex-1 flex items-center gap-1.5 text-xs text-muted-foreground/50 px-1">
              <Wallet className="w-3 h-3"/>
              <span>Изменения сохраняются</span>
            </div>
          )}
          <button onClick={onDelete}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>
    </div>
  );
}
