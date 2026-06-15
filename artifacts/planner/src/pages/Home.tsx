import { useState, useRef, useEffect, useCallback } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isToday, isWeekend, parseISO,
  startOfWeek, endOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, X, Check,
  Pencil, Trash2, RotateCcw, Sparkles, Clock,
  Dumbbell, Briefcase, Star, Car, UtensilsCrossed,
  Copy, TrendingUp, CalendarDays, AlertTriangle,
  Wallet, Target, ChevronDown, ChevronUp, BadgeCheck,
  ArrowUpRight, ArrowDownRight, Minus, Trophy,
} from "lucide-react";
import { usePlanner } from "../hooks/use-planner";
import {
  Entity, PlannerEvent, Goal, EventStatus, EventIcon,
  STATUS_COLORS, STATUS_GRADIENTS, STATUS_LABELS, STATUS_CYCLE,
  EVENT_ICON_LABELS,
  calcDuration, calcDurationMins, fmtTime, addMinutes, hasTimeOverlap, timeToMins,
} from "../types";

/* ── Ozon PVZ icon ── */
function OzonIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5" fill="#005BFF"/>
      <text x="12" y="17" textAnchor="middle" fill="white"
        fontSize="13" fontWeight="900" fontFamily="Arial,sans-serif" letterSpacing="-1">O</text>
    </svg>
  );
}

/* ── Icon registry ── */
const EVENT_ICONS: Record<EventIcon, React.ReactNode> = {
  none:      null,
  gym:       <Dumbbell className="w-full h-full"/>,
  ozon:      <OzonIcon size={14}/>,
  briefcase: <Briefcase className="w-full h-full"/>,
  star:      <Star className="w-full h-full"/>,
  car:       <Car className="w-full h-full"/>,
  food:      <UtensilsCrossed className="w-full h-full"/>,
};

const ICON_LIST: EventIcon[] = ["none","gym","ozon","briefcase","star","car","food"];

/* ── Inline icon renderer ── */
function EventIconBadge({ icon, size = 10 }: { icon: EventIcon; size?: number }) {
  if (!icon || icon === "none") return null;
  if (icon === "ozon") return <OzonIcon size={size}/>;
  return (
    <span className="text-white/90 flex items-center justify-center"
      style={{ width: size, height: size }}>
      {EVENT_ICONS[icon]}
    </span>
  );
}

/* ── Icon picker row ── */
function IconPicker({ value, onChange }: { value: EventIcon; onChange: (v: EventIcon) => void }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-1.5">Иконка</p>
      <div className="flex flex-wrap gap-1.5">
        {ICON_LIST.map(ic => (
          <button key={ic} onClick={() => onChange(ic)}
            title={EVENT_ICON_LABELS[ic]}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all
              ${value === ic ? "border-primary bg-primary/15 scale-110" : "border-border hover:border-border/80 hover:bg-accent"}`}>
            {ic === "none"
              ? <span className="text-[10px] text-muted-foreground font-medium">—</span>
              : ic === "ozon"
                ? <OzonIcon size={16}/>
                : <span className="text-foreground w-4 h-4 flex items-center justify-center">
                    {EVENT_ICONS[ic]}
                  </span>
            }
          </button>
        ))}
      </div>
    </div>
  );
}

function genId() { return Math.random().toString(36).substring(2, 12); }

function fmtMoney(n: number): string {
  if (n === 0) return "0 ₽";
  return n.toLocaleString("ru-RU") + " ₽";
}

/** Convert "HH:MM" to 0–100% within a 6:00–22:00 window */
function workPct(t: string): number {
  try {
    const [h, m] = t.split(":").map(Number);
    const min = h * 60 + m;
    return Math.max(0, Math.min(100, ((min - 360) / 960) * 100));
  } catch { return 0; }
}

const DAY_ABBR: Record<number, string> = {
  0:"ВС", 1:"ПН", 2:"ВТ", 3:"СР", 4:"ЧТ", 5:"ПТ", 6:"СБ",
};
const MONTH_NAMES = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

/* Module-level drag + clipboard state */
let activeDrag: { eventId: string; srcEntityId: string; srcDate: string } | null = null;
/** Tracks the cell the cursor is currently over — updated by every GridCell */
let hoveredPasteTarget: { entityId: string; date: string } | null = null;
/** Tracks the event the cursor is over — for Ctrl+C copy */
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
    entities, events, goals,
    addEntity, deleteEntity, renameEntity,
    addEvent, updateEvent, deleteEvent, moveEvent,
    getEventsForCell, getEventCountForEntity, getAllEventsForDay,
    addGoal, updateGoal, deleteGoal,
    loadDemoData,
  } = usePlanner(currentMonth);

  const [popup,        setPopup]        = useState<Popup>(null);
  const [ctxMenu,      setCtxMenu]      = useState<CtxMenu>(null);
  const [dragOverKey,  setDragOverKey]  = useState<string | null>(null);
  const [newEntityName, setNewEntityName] = useState("");
  const [showAddRow,   setShowAddRow]   = useState(false);
  const [dayPanel,     setDayPanel]     = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [ctxDupMode,   setCtxDupMode]   = useState(false);
  const [ctxDupDate,   setCtxDupDate]   = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [showFinance,  setShowFinance]  = useState(false);
  const [tlCollapsed,  setTlCollapsed]  = useState(false);
  const [copiedEvent,  setCopiedEvent]  = useState<PlannerEvent | null>(null);
  const copiedEventRef = useRef<PlannerEvent | null>(null); // always fresh in keyboard handler

  const addRowRef  = useRef<HTMLInputElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);
  const ctxRef     = useRef<HTMLDivElement>(null);
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

  /* keep ref in sync with state so keyboard handler always sees latest */
  useEffect(() => { copiedEventRef.current = copiedEvent; }, [copiedEvent]);

  /* global Escape / outside-click / Ctrl+C / Ctrl+V */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* skip if focus is inside a text field */
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isText = tag === "INPUT" || tag === "TEXTAREA";

      if (e.key === "Escape") {
        setPopup(null); setCtxMenu(null); setShowFinance(false); setCopiedEvent(null);
        return;
      }
      /* Ctrl+C — copy hovered event */
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !isText) {
        const ev = hoveredEventForCopy;
        if (!ev) return;
        e.preventDefault();
        setCopiedEvent({ ...ev });
        copiedEventRef.current = { ...ev };
        return;
      }
      /* Ctrl+V — paste to hovered cell */
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !isText) {
        const ev = copiedEventRef.current;
        const target = hoveredPasteTarget;
        if (!ev || !target) return;
        e.preventDefault();
        addEventRef.current({
          ...ev,
          id: genId(),
          entityId: target.entityId,
          date: target.date,
          done: false,
        });
        return;
      }
    };
    const onDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null);
      if (ctxRef.current  && !ctxRef.current.contains(e.target as Node))   setCtxMenu(null);
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

  /* stable ref so the keyboard handler (which runs in a closure) can always call addEvent */
  const addEventRef = useRef<(ev: PlannerEvent) => void>(addEvent);
  useEffect(() => { addEventRef.current = addEvent; }, [addEvent]);

  const openAdd  = useCallback((entityId: string, date: string, anchor: DOMRect) => {
    setCtxMenu(null);
    /* paste-on-click: if clipboard has an event, paste it instead of opening the add dialog */
    if (copiedEventRef.current) {
      addEventRef.current({ ...copiedEventRef.current, id: genId(), entityId, date, done: false });
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

  const handleDoneToggle = useCallback((ev: PlannerEvent) => {
    updateEvent({ ...ev, done: !ev.done, status: !ev.done ? "confirmed" : ev.status });
  }, [updateEvent]);

  /* drag handlers */
  const handleDragStart = useCallback((eventId: string, srcEntityId: string, srcDate: string) => {
    activeDrag = { eventId, srcEntityId, srcDate };
  }, []);

  const handleDragEnd = useCallback(() => {
    activeDrag = null;
    setDragOverKey(null);
  }, []);

  const handleDragOver = useCallback((key: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(key);
  }, []);

  const handleDrop = useCallback((targetEntityId: string, targetDate: string) => {
    if (!activeDrag) return;
    if (activeDrag.srcEntityId !== targetEntityId || activeDrag.srcDate !== targetDate) {
      moveEvent(activeDrag.eventId, targetEntityId, targetDate);
    }
    activeDrag = null;
    setDragOverKey(null);
  }, [moveEvent]);

  /* stats */
  const pastN         = events.filter(e => e.status === "past"      || e.status === "overdue").length;
  const confirmedN    = events.filter(e => e.status === "confirmed").length;
  const plannedN      = events.filter(e => e.status === "planned"   || e.status === "pending").length;
  const overdueN      = 0; // unused — kept for FinancePanel compat
  const pendingN      = plannedN; // alias
  const totalEarnings = events.reduce((s, e) => s + (e.earnings ?? 0), 0);
  const totalExpenses = events.reduce((s, e) => s + (e.expenses ?? 0), 0);
  const dayEarnings   = events.filter(e => e.date === dayPanel).reduce((s, e) => s + (e.earnings ?? 0), 0);

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

  const weekExpenses = (wDays: Date[]): number => {
    const s = format(wDays[0], "yyyy-MM-dd");
    const e = format(wDays[wDays.length - 1], "yyyy-MM-dd");
    return events.filter(ev => ev.date >= s && ev.date <= e).reduce((sum, ev) => sum + (ev.expenses ?? 0), 0);
  };

  /* Current week earnings/expenses for finance panel */
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr   = format(weekEnd, "yyyy-MM-dd");
  const thisWeekEvents   = events.filter(ev => ev.date >= weekStartStr && ev.date <= weekEndStr);
  const thisWeekEarnings = thisWeekEvents.reduce((s, e) => s + (e.earnings ?? 0), 0);
  const thisWeekExpenses = thisWeekEvents.reduce((s, e) => s + (e.expenses ?? 0), 0);

  /* popup position */
  function popupStyle(anchor: DOMRect, w = 300, h = 380): React.CSSProperties {
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = anchor.left + anchor.width / 2 - w / 2;
    let top  = anchor.bottom + 8;
    if (left + w > vw - 8) left = vw - w - 8;
    if (left < 8) left = 8;
    if (top + h > vh - 8) top = anchor.top - h - 8;
    return { position: "fixed", left, top, width: w, zIndex: 50 };
  }

  /* ── Design tokens ── */
  const BASE    = "#0f1219";
  const PANEL   = "#131926";
  const BLUE    = "#5b9cf6";
  const GREEN   = "#3ecf8e";
  const SLATE   = "#546070";
  const FG      = "#c2cfdc";
  const FG_MED  = "#6d8396";
  const FG_DIM  = "#374557";
  const BORDER  = "rgba(255,255,255,0.07)";
  const DAY_SHORT = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

  function fmtK(n: number): string {
    if (n >= 1000000) return `${(n/1000000).toLocaleString("ru-RU",{maximumFractionDigits:1})} М`;
    if (n >= 1000)    return `${(n/1000).toLocaleString("ru-RU",{maximumFractionDigits:1})} к`;
    return `${n}`;
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: BASE, color: FG, fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside style={{
        width: 264, flexShrink: 0,
        background: PANEL,
        borderRight: `1px solid ${BORDER}`,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}>
        {/* ── Header: brand + month nav ── */}
        <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
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
            <button data-testid="btn-prev-month" onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: `1px solid ${BORDER}`, background: "transparent", cursor: "pointer", color: FG_DIM, flexShrink: 0 }}>
              <ChevronLeft style={{ width: 11, height: 11 }}/>
            </button>
            <button data-testid="btn-today" onClick={() => setCurrentMonth(new Date())}
              style={{ flex: 1, fontSize: 12, fontWeight: 600, color: FG_MED, background: "transparent", border: "none", cursor: "pointer", textAlign: "center" }}>
              {MONTH_NAMES[currentMonth.getMonth()]}
            </button>
            <button data-testid="btn-next-month" onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: `1px solid ${BORDER}`, background: "transparent", cursor: "pointer", color: FG_DIM, flexShrink: 0 }}>
              <ChevronRight style={{ width: 11, height: 11 }}/>
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="sb-thin" style={{ flex: 1, overflowY: "auto", padding: "18px 16px 0" }}>

          {/* ── Month earnings ── */}
          {totalEarnings > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: FG_DIM, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                Заработок за месяц
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: GREEN, letterSpacing: "-0.04em", lineHeight: 1 }}>
                {fmtK(totalEarnings)} <span style={{ fontSize: 16, fontWeight: 600 }}>₽</span>
              </div>
              {thisWeekEarnings > 0 && (
                <div style={{ fontSize: 11, color: FG_DIM, marginTop: 5 }}>
                  {fmtK(thisWeekEarnings)} ₽ на этой неделе
                </div>
              )}
            </div>
          )}

          {/* ── 3 stats ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: FG_DIM, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Смены в {MONTH_NAMES[currentMonth.getMonth()].toLowerCase()}е
            </div>
            {[
              { n: plannedN,   label: "запланировано",  color: BLUE  },
              { n: confirmedN, label: "подтверждено",   color: GREEN },
              { n: pastN,      label: "прошедших",      color: SLATE },
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
          <div style={{ height: 1, background: BORDER, marginBottom: 18 }}/>

          {/* ── Upcoming shifts ── */}
          {(() => {
            const todayStr = format(new Date(), "yyyy-MM-dd");
            const upcoming = events
              .filter(e => e.date >= todayStr && (e.status === "planned" || e.status === "pending" || e.status === "confirmed"))
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 5);
            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: FG_DIM, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                  Ближайшие смены
                </div>
                {upcoming.length === 0
                  ? <p style={{ fontSize: 11, color: FG_DIM }}>Нет запланированных смен</p>
                  : upcoming.map(ev => {
                    const d = parseISO(ev.date);
                    const eName = entities.find(e => e.id === ev.entityId)?.name ?? "—";
                    const dotColor = ev.status === "confirmed" ? GREEN : BLUE;
                    return (
                      <div key={ev.id} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 0", borderBottom: `1px solid ${BORDER}`,
                      }}>
                        <div style={{
                          flexShrink: 0, minWidth: 32,
                        }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: FG, letterSpacing: "-0.03em", lineHeight: 1 }}>{format(d, "d")}</div>
                          <div style={{ fontSize: 9, color: FG_DIM, marginTop: 2, textTransform: "uppercase" }}>
                            {DAY_SHORT[d.getDay()]}
                          </div>
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, color: FG_MED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {eName}
                          </div>
                          <div style={{ fontSize: 10, color: FG_DIM, marginTop: 1 }}>09:00 – 21:00</div>
                        </div>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }}/>
                      </div>
                    );
                  })
                }
              </div>
            );
          })()}
        </div>

        {/* ── Footer: Add location ── */}
        <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <button
            onClick={() => setShowAddRow(true)}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 8,
              background: "transparent",
              border: `1px dashed ${BORDER}`,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              gap: 7, color: FG_DIM, fontSize: 12, transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = BLUE;
              b.style.color = BLUE;
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = BORDER;
              b.style.color = FG_DIM;
            }}>
            <Plus style={{ width: 12, height: 12 }}/>
            Добавить объект
          </button>
        </div>
      </aside>

      {/* ═══════════════ MAIN ═══════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── Topbar ── */}
        <div style={{
          height: 48, flexShrink: 0,
          display: "flex", alignItems: "center",
          padding: "0 18px", gap: 0,
          position: "relative", zIndex: 10,
          background: PANEL,
          borderBottom: `1px solid ${BORDER}`,
        }}>
          {/* Stats */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ fontSize: 12, color: FG_MED }}>
              <span style={{ fontWeight: 700, color: FG }}>{entities.length}</span>{" "}
              объект{entities.length === 1 ? "" : entities.length < 5 ? "а" : "ов"}
            </span>
            <span style={{ width: 1, height: 12, background: BORDER, flexShrink: 0 }}/>
            <span style={{ fontSize: 12, color: FG_MED }}>
              <span style={{ fontWeight: 700, color: BLUE }}>{plannedN}</span>{" "}запланировано
            </span>
            <span style={{ width: 1, height: 12, background: BORDER, flexShrink: 0 }}/>
            <span style={{ fontSize: 12, color: FG_MED }}>
              <span style={{ fontWeight: 700, color: GREEN }}>{confirmedN}</span>{" "}подтверждено
            </span>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowFinance(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 7, fontSize: 12,
                border: `1px solid ${showFinance ? BLUE + "55" : BORDER}`,
                background: showFinance ? BLUE + "14" : "transparent",
                color: showFinance ? BLUE : FG_MED, cursor: "pointer", transition: "all 0.15s",
              }}>
              <Wallet style={{ width: 12, height: 12 }}/>
              Финансы
            </button>
            <button onClick={() => setTlCollapsed(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 7, fontSize: 12,
                border: `1px solid ${!tlCollapsed ? BLUE + "55" : BORDER}`,
                background: !tlCollapsed ? BLUE + "14" : "transparent",
                color: !tlCollapsed ? BLUE : FG_MED, cursor: "pointer", transition: "all 0.15s",
              }}>
              <Clock style={{ width: 12, height: 12 }}/>
              Таймлайн
            </button>
          </div>
        </div>

        {/* ── Grid + optional Finance panel ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── Grid column ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Scrollable grid */}
            <div ref={gridRef} className="sb-thin" style={{ flex: 1, overflow: "auto" }}>
              <table style={{
                tableLayout: "fixed", borderCollapse: "separate", borderSpacing: "2px",
                background: BASE, minWidth: "100%",
              }}>
                <colgroup>
                  <col style={{ width: 210, minWidth: 210 }}/>
                  {days.map(d => <col key={d.toISOString()} style={{ minWidth: 28 }}/>)}
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
                            background: BASE,
                            padding: "8px 0 2px",
                            textAlign: "center",
                            verticalAlign: "middle",
                            borderLeft: wi > 0 ? `4px solid ${BASE}` : undefined,
                          }}>
                          {earn > 0 ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center",
                              fontSize: 9, fontWeight: 700,
                              color: GREEN,
                              background: "rgba(16,185,129,0.07)",
                              border: "1px solid rgba(16,185,129,0.15)",
                              borderRadius: 99, padding: "2px 8px",
                              letterSpacing: "-0.01em",
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
                    <th style={{ background: BASE, position: "sticky", left: 0, zIndex: 30, padding: "2px 10px 8px 12px" }}/>
                    {days.map(day => {
                      const tod = isToday(day), wknd = isWeekend(day);
                      return (
                        <th key={day.toISOString()}
                          ref={tod ? todayThRef : undefined}
                          style={{
                            background: tod ? "rgba(139,92,246,0.06)" : "transparent",
                            padding: "2px 0 8px",
                            textAlign: "center",
                            verticalAlign: "bottom",
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
                            <span
                              style={{
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
                            background: `${BLUE}14`,
                            border: `1px solid ${BLUE}33`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <CalendarDays style={{ width: 22, height: 22, color: BLUE }}/>
                          </div>
                          <p style={{ fontSize: 14, color: FG_MED, fontWeight: 600 }}>Нет объектов</p>
                          <button data-testid="btn-demo" onClick={loadDemoData}
                            style={{
                              fontSize: 12, padding: "7px 18px", borderRadius: 8, fontWeight: 600,
                              background: `${BLUE}18`, color: BLUE,
                              border: `1px solid ${BLUE}44`, cursor: "pointer",
                            }}>
                            Загрузить демо-данные
                          </button>
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
                        const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(ev.status) + 1) % STATUS_CYCLE.length];
                        updateEvent({ ...ev, status: next });
                      }}
                      onDoneToggle={handleDoneToggle}
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

                  {/* Add entity row */}
                  {showAddRow && (
                    <tr>
                      <td style={{
                        background: BASE, position: "sticky", left: 0, zIndex: 10,
                        padding: "0 6px 0 0", height: 34, verticalAlign: "middle",
                      }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8,
                          height: "100%", paddingLeft: 12,
                          borderLeft: `2px solid ${BLUE}`,
                        }}>
                          <input ref={addRowRef} data-testid="input-new-entity"
                            value={newEntityName}
                            onChange={e => setNewEntityName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleAddEntity();
                              if (e.key === "Escape") { setNewEntityName(""); setShowAddRow(false); }
                            }}
                            placeholder="Название объекта..."
                            style={{ flex: 1, minWidth: 0, fontSize: 12, background: "transparent", outline: "none", border: "none", color: FG, letterSpacing: "-0.01em" }}/>
                          <button onClick={handleAddEntity} disabled={!newEntityName.trim()}
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 7, background: BLUE, color: "#fff", border: "none", cursor: "pointer", flexShrink: 0, opacity: newEntityName.trim() ? 1 : 0.35, fontWeight: 600 }}>
                            Добавить
                          </button>
                          <button onClick={() => { setNewEntityName(""); setShowAddRow(false); }}
                            style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: FG_DIM, marginRight: 4 }}>
                            <X style={{ width: 11, height: 11 }}/>
                          </button>
                        </div>
                      </td>
                      {days.map(day => (
                        <td key={format(day, "yyyy-MM-dd")}
                          className={isWeekend(day) ? "cell-weekend" : "cell-empty"}
                          style={{ borderRadius: 5, height: 34, borderLeft: day.getDay() === 1 ? `4px solid ${BASE}` : undefined }}/>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Timeline */}
            <HorizontalTimeline
              date={dayPanel}
              entities={entities}
              getEventsForCell={getEventsForCell}
              onDayReset={() => setDayPanel(format(new Date(), "yyyy-MM-dd"))}
              collapsed={tlCollapsed}
              onToggleCollapse={() => setTlCollapsed(v => !v)}
            />
          </div>

          {/* Finance panel */}
          {showFinance && (
            <FinancePanel
              events={events}
              goals={goals}
              totalEarnings={totalEarnings}
              totalExpenses={totalExpenses}
              thisWeekEarnings={thisWeekEarnings}
              thisWeekExpenses={thisWeekExpenses}
              onClose={() => setShowFinance(false)}
              onAddGoal={addGoal}
              onUpdateGoal={updateGoal}
              onDeleteGoal={deleteGoal}
            />
          )}
        </div>
      </div>

      {/* ═══ Popup ═══ */}
      {popup && (
        <div ref={popupRef} style={popupStyle(popup.anchor)}>
          {popup.mode === "add" && (
            <AddEventPopup entityId={popup.entityId} date={popup.date}
              existingEvents={getAllEventsForDay(popup.date)}
              onClose={() => setPopup(null)}
              onAdd={ev => { addEvent(ev); setPopup(null); }}/>
          )}
          {popup.mode === "view" && (
            <ViewPopup event={popup.event}
              existingEvents={getAllEventsForDay(popup.event.date)}
              onClose={() => setPopup(null)}
              onStatusChange={status => { updateEvent({ ...popup.event, status }); setPopup(null); }}
              onDelete={() => { deleteEvent(popup.event.id); setPopup(null); }}
              onSave={upd => { updateEvent(upd); setPopup(null); }}
              onDuplicate={date => { addEvent({ ...popup.event, id: genId(), date }); setPopup(null); }}/>
          )}
        </div>
      )}

      {/* ═══ Context menu ═══ */}
      {ctxMenu && (
        <div ref={ctxRef}
          style={{ position:"fixed", left:ctxMenu.x, top:ctxMenu.y, zIndex:60 }}
          className="w-48 rounded-lg border border-border bg-popover shadow-2xl overflow-hidden py-1"
          onClick={e => e.stopPropagation()}>
          <div className="px-3 py-1.5 border-b border-border mb-1">
            <p className="text-[11px] font-semibold text-foreground truncate">{ctxMenu.event.title}</p>
            <p className="text-[10px] text-muted-foreground">{ctxMenu.event.date}</p>
          </div>
          <button
            onClick={() => { handleDoneToggle(ctxMenu.event); setCtxMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left">
            <BadgeCheck className={`w-3 h-3 ${ctxMenu.event.done ? "text-emerald-400" : "text-muted-foreground"}`}/>
            {ctxMenu.event.done ? "Снять отметку выполнения" : "Отметить выполненным"}
          </button>
          <div className="border-t border-border/50 my-1"/>
          {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
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
            {!ctxDupMode ? (
              <button
                onClick={() => { setCtxDupMode(true); setCtxDupDate(format(new Date(), "yyyy-MM-dd")); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left">
                <Copy className="w-3 h-3 text-muted-foreground"/> Дублировать на день...
              </button>
            ) : (
              <div className="px-3 py-2 space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-medium">Выберите дату</p>
                <input type="date" value={ctxDupDate} onChange={e => setCtxDupDate(e.target.value)}
                  className="w-full text-xs bg-accent/60 border border-border rounded-md px-2 py-1 outline-none focus:border-primary text-foreground"/>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      if (!ctxDupDate) return;
                      addEvent({ ...ctxMenu.event, id: genId(), date: ctxDupDate });
                      setCtxDupMode(false); setCtxMenu(null);
                    }}
                    className="flex-1 text-[10px] font-semibold py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                    Скопировать
                  </button>
                  <button onClick={() => setCtxDupMode(false)}
                    className="px-2 py-1 text-[10px] rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors">
                    Отмена
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                const el = document.querySelector(`[data-event-id="${ctxMenu.event.id}"]`);
                const rect = el?.getBoundingClientRect() ?? new DOMRect(ctxMenu.x, ctxMenu.y, 0, 0);
                setPopup({ mode:"view", event:ctxMenu.event, anchor:rect });
                setCtxMenu(null); setCtxDupMode(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left">
              <Pencil className="w-3 h-3 text-muted-foreground"/> Редактировать
            </button>
            <button
              onClick={() => { deleteEvent(ctxMenu.event.id); setCtxMenu(null); setCtxDupMode(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left text-destructive">
              <Trash2 className="w-3 h-3"/> Удалить
            </button>
          </div>
        </div>
      )}
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
  onDoneToggle: (ev: PlannerEvent) => void;
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
  entity, days, eventCount, dragOverKey,
  getEventsForCell, onCellClick, onEventClick, onContextMenu, onShiftClick, onDoneToggle,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onDeleteEntity, onRenameEntity, copiedEventId, onCopyEvent,
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
  const GREEN_R = "#3ecf8e";
  const SLATE_R = "#546070";
  const FG_R    = "#c2cfdc";
  const FG_D_R  = "#374557";

  const CELL_PLANNED_BG   = "rgba(91,156,246,0.13)";
  const CELL_CONFIRMED_BG = "rgba(62,207,142,0.1)";
  const CELL_PAST_BG      = "rgba(84,96,112,0.14)";
  const CELL_DRAG_BG      = "rgba(91,156,246,0.22)";

  const STATUS_TOP: Record<string, string> = {
    planned:   BLUE_R,
    confirmed: GREEN_R,
    past:      SLATE_R,
    // compat
    pending:   BLUE_R,
    overdue:   SLATE_R,
  };

  return (
    <tr className="entity-row">
      {/* ── Entity name cell ── */}
      <td style={{
        background: BASE_R, position: "sticky", left: 0, zIndex: 10,
        padding: "0 6px 0 0", height: 34, verticalAlign: "middle",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 9,
          height: "100%", padding: "0 0 0 10px",
        }}>
          {/* Color square */}
          <div style={{
            width: 8, height: 22, borderRadius: 3,
            background: entity.color,
            boxShadow: `0 0 8px ${entity.color}55`,
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
                color: "rgba(226,232,240,0.62)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                flex: 1, cursor: "default", letterSpacing: "-0.01em",
                transition: "color 0.15s",
              }}>
              {entity.name}
            </span>
          )}

          {/* Action buttons */}
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

        let cellClass = "cell-empty";
        let cellBg: string | undefined;
        let topBorder: string | undefined;
        let topShadow: string | undefined;

        if (isDragTarget) {
          cellBg = CELL_DRAG_BG;
          topBorder = BLUE_R;
        } else if (firstEv) {
          const s = firstEv.status;
          cellBg = s === "confirmed" ? CELL_CONFIRMED_BG
                 : s === "past" || s === "overdue" ? CELL_PAST_BG
                 : CELL_PLANNED_BG;
          topBorder = STATUS_TOP[s] ?? BLUE_R;
          topShadow = s === "confirmed"
            ? "inset 0 2px 0 rgba(62,207,142,0.4)"
            : s === "past" || s === "overdue"
            ? "inset 0 2px 0 rgba(84,96,112,0.4)"
            : "inset 0 2px 0 rgba(91,156,246,0.4)";
          cellClass = "";
        } else if (tod) {
          cellClass = "today-col";
        } else if (wknd) {
          cellClass = "cell-weekend";
        }

        const isWeekStart = day.getDay() === 1;

        return (
          <td key={dateStr}
            className={cellClass}
            style={{
              ...(cellBg ? { background: cellBg } : {}),
              borderRadius: 6,
              padding: 0,
              height: 34,
              verticalAlign: "middle",
              opacity: (firstEv?.done && !isDragTarget) ? 0.28 : 1,
              transition: "background 0.12s, opacity 0.12s",
              borderLeft: isWeekStart ? `4px solid ${BASE_R}` : undefined,
              position: "relative",
              boxShadow: topShadow,
              outline: tod ? "1px solid rgba(139,92,246,0.15)" : undefined,
              outlineOffset: "-1px",
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
              onDoneToggle={onDoneToggle}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              copiedEventId={copiedEventId}
              onCopyEvent={onCopyEvent}
            />
          </td>
        );
      })}
    </tr>
  );
}

/* ─────────────────────── HorizontalTimeline ─────────────────────── */
function HorizontalTimeline({
  date, entities, getEventsForCell, onDayReset, collapsed, onToggleCollapse,
}: {
  date: string;
  entities: Entity[];
  getEventsForCell: (entityId: string, date: string) => PlannerEvent[];
  onDayReset: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const now      = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const isToday  = date === todayStr;
  const nowPct   = isToday ? ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100 : null;

  const dateLabel = (() => {
    try {
      const d = parseISO(date);
      if (isToday) return "Сегодня";
      return format(d, "d MMMM, EEEE", { locale: ru });
    } catch { return date; }
  })();

  function pct(t: string) {
    try {
      const [h, m] = t.split(":").map(Number);
      return ((h * 60 + m) / 1440) * 100;
    } catch { return 0; }
  }

  function busyMins(entity: Entity) {
    return getEventsForCell(entity.id, date)
      .filter(ev => ev.startTime && ev.endTime)
      .reduce((acc, ev) => {
        const [sh, sm] = ev.startTime!.split(":").map(Number);
        const [eh, em] = ev.endTime!.split(":").map(Number);
        return acc + (eh * 60 + em) - (sh * 60 + sm);
      }, 0);
  }

  const LABEL_W = 160;

  return (
    <div className="border-t-2 border-border bg-card flex-shrink-0 select-none">
      {/* ── Collapse toggle bar ── */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-primary/60 flex-shrink-0"/>
          <button
            onClick={onDayReset}
            className={`text-[11px] font-bold uppercase tracking-wide transition-colors
              ${isToday ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
            title="Вернуться к сегодня">
            {dateLabel}
          </button>
        </div>
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-accent">
          {collapsed ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
          {collapsed ? "Развернуть" : "Свернуть"}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 pt-2 pb-2">
          {/* ── Header row: 24-h axis ── */}
          <div className="flex items-center mb-2" style={{ gap: 0 }}>
            <div className="flex-shrink-0" style={{ width: LABEL_W }}/>
            <div className="flex-1 relative h-6">
              {Array.from({ length: 25 }, (_, h) => {
                const isEven  = h % 2 === 0;
                const isMajor = h % 6 === 0;
                const isMid   = h % 2 === 0 && !isMajor;
                return (
                  <div key={h} className="absolute flex flex-col items-center -translate-x-1/2"
                    style={{ left: `${(h / 24) * 100}%`, top: 0 }}>
                    <span
                      className={`font-mono leading-none ${isMajor ? "text-muted-foreground/80 text-[9px]" : "text-muted-foreground/45 text-[7px]"}`}
                      style={{ marginTop: isEven ? 0 : 9 }}>
                      {h < 24 ? h : ""}
                    </span>
                    <div className={`w-px mt-0.5 ${isMajor ? "h-2.5 bg-border/60" : isMid ? "h-1.5 bg-border/35" : "h-1 bg-border/20"}`}/>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Entity rows ── */}
          <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
            {entities.map(entity => {
              const evs        = getEventsForCell(entity.id, date);
              const timedEvs   = evs.filter(ev => ev.startTime && ev.endTime);
              const untimedEvs = evs.filter(ev => !ev.startTime);
              const busy       = busyMins(entity);
              const busyLabel  = busy > 0
                ? `${Math.floor(busy / 60)}ч${busy % 60 > 0 ? ` ${busy % 60}м` : ""} занято`
                : null;
              const freeLabel  = busy > 0
                ? `${Math.floor((960 - Math.min(busy, 960)) / 60)}ч св.`
                : "свободен";

              return (
                <div key={entity.id} className="flex items-center mb-2" style={{ gap: 0 }}>
                  <div className="flex items-center gap-2 flex-shrink-0 pr-3" style={{ width: LABEL_W }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entity.color }}/>
                    <span className="text-[11px] font-medium text-foreground/80 truncate leading-none">{entity.name}</span>
                    <div className="ml-auto flex-shrink-0 text-right">
                      {busyLabel ? (
                        <span className="text-[9px] font-semibold block" style={{ color: entity.color }}>{busyLabel}</span>
                      ) : (
                        <span className="text-[9px] text-muted-foreground/40 block">{freeLabel}</span>
                      )}
                      {untimedEvs.length > 0 && (
                        <span className="text-[8px] text-muted-foreground/40 block">+{untimedEvs.length} без вр.</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 relative h-8 rounded-md overflow-hidden"
                    style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                    {Array.from({ length: 23 }, (_, i) => i + 1).map(h => (
                      <div key={h} className="absolute top-0 bottom-0 w-px pointer-events-none"
                        style={{
                          left: `${(h / 24) * 100}%`,
                          backgroundColor: h % 6 === 0
                            ? "rgba(255,255,255,0.12)"
                            : h % 3 === 0
                              ? "rgba(255,255,255,0.07)"
                              : "rgba(255,255,255,0.03)"
                        }}/>
                    ))}

                    {(() => {
                      const WORK_S = 6 * 60, WORK_E = 22 * 60;
                      const sorted = [...timedEvs].sort((a, b) => timeToMins(a.startTime!) - timeToMins(b.startTime!));
                      const gaps: { s: number; e: number }[] = [];
                      let cur = WORK_S;
                      for (const ev of sorted) {
                        const es = timeToMins(ev.startTime!), ee = timeToMins(ev.endTime!);
                        if (es > cur) gaps.push({ s: cur, e: es });
                        cur = Math.max(cur, ee);
                      }
                      if (cur < WORK_E) gaps.push({ s: cur, e: WORK_E });
                      return gaps.map((g, i) => {
                        const l = (g.s / 1440) * 100, w = ((g.e - g.s) / 1440) * 100;
                        const mins = g.e - g.s;
                        const label = mins >= 60
                          ? `${Math.floor(mins / 60)}ч${mins % 60 > 0 ? `\u00a0${mins % 60}м` : ""}`
                          : `${mins}м`;
                        return (
                          <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center overflow-hidden"
                            style={{ left: `${l}%`, width: `${w}%`, background: "rgba(74,222,128,0.08)" }}>
                            <div className="absolute inset-x-0 top-1/2 h-px bg-emerald-400/20"/>
                            {w > 2.5 && (
                              <span className="relative z-10 text-[8px] font-semibold text-emerald-400/55 px-0.5 leading-none select-none">
                                {label}
                              </span>
                            )}
                          </div>
                        );
                      });
                    })()}

                    {timedEvs.map(ev => {
                      const l   = pct(ev.startTime!);
                      const w   = Math.max(pct(ev.endTime!) - l, 0.4);
                      const dur = calcDuration(ev.startTime!, ev.endTime!);
                      return (
                        <div key={ev.id}
                          className="absolute top-0.5 bottom-0.5 rounded-sm overflow-hidden flex flex-col justify-center px-1.5 cursor-default"
                          style={{ left: `${l}%`, width: `${w}%`, backgroundColor: STATUS_COLORS[ev.status], opacity: ev.done ? 0.5 : 1 }}>
                          {w > 3.5 && (
                            <span className="text-white text-[10px] font-bold leading-tight truncate drop-shadow-sm">
                              {ev.title}
                            </span>
                          )}
                          {w > 2 && (
                            <span className="text-white/80 text-[9px] font-mono leading-none truncate">
                              {fmtTime(ev.startTime!)}–{fmtTime(ev.endTime!)}
                              {w > 5 && ` · ${dur}`}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {nowPct !== null && (
                      <div className="absolute top-0 bottom-0 w-0.5 rounded-full bg-red-400 z-10 pointer-events-none"
                        style={{ left: `${nowPct}%` }}>
                        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-400"/>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
  onDoneToggle: (ev: PlannerEvent) => void;
  onDragStart: (evId: string, srcEId: string, srcDate: string) => void;
  onDragEnd: () => void;
  copiedEventId: string | null;
  onCopyEvent: (ev: PlannerEvent) => void;
}

function durSpan(start: string, end: string): number {
  const mins = calcDurationMins(start, end);
  return Math.min(1, Math.max(0.12, mins / 480));
}

function GridCell({
  events, entityId, date,
  onAddClick, onEventClick, onContextMenu, onShiftClick, onDoneToggle,
  onDragStart, onDragEnd, copiedEventId, onCopyEvent,
}: GridCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverCard, setHoverCard] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCellEnter = () => { hoveredPasteTarget = { entityId, date }; };
  const onCellLeave = () => { if (hoveredPasteTarget?.entityId === entityId && hoveredPasteTarget?.date === date) hoveredPasteTarget = null; };

  const showCard = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHoverCard(true); };
  const hideCard = () => { hoverTimer.current = setTimeout(() => setHoverCard(false), 80); };

  /* ── Empty cell — td is the dark tile, hover overlay shows on top ── */
  if (events.length === 0) {
    return (
      <div ref={ref} data-testid={`cell-empty-${entityId}-${date}`}
        onMouseEnter={onCellEnter}
        onMouseLeave={onCellLeave}
        onClick={() => ref.current && onAddClick(entityId, date, ref.current.getBoundingClientRect())}
        className="group/empty"
        style={{ width: "100%", height: "100%", cursor: "pointer", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="absolute inset-0 opacity-0 group-hover/empty:opacity-100 transition-opacity duration-100"
          style={{ backgroundColor: "rgba(255,255,255,0.09)", borderRadius: "3px" }}/>
        <Plus className="w-2 h-2 opacity-0 group-hover/empty:opacity-40 transition-opacity duration-100 relative z-10"
          style={{ color: "#fff" }}/>
      </div>
    );
  }

  /* ── Multi-event cell — pure color square, small dot badge, details on hover ── */
  if (events.length > 1) {
    const first = events[0];
    return (
      <>
        <div ref={ref} data-testid={`cell-event-${entityId}-${date}`}
          data-event-id={first.id}
          draggable
          onMouseEnter={e => { onCellEnter(); hoveredEventForCopy = first; showCard(); (e.currentTarget as HTMLElement).style.filter = "brightness(1.35)"; }}
          onMouseLeave={e => { onCellLeave(); hoveredEventForCopy = null; hideCard(); (e.currentTarget as HTMLElement).style.filter = ""; }}
          onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(first.id, entityId, date); setHoverCard(false); }}
          onDragEnd={onDragEnd}
          onClick={e => {
            if (e.shiftKey) { onShiftClick(first); return; }
            ref.current && onEventClick(first, ref.current.getBoundingClientRect());
          }}
          onContextMenu={e => onContextMenu(e.nativeEvent, first)}
          style={{ width: "100%", height: "100%", cursor: "grab", position: "relative", borderRadius: "2px", transition: "filter 0.08s" }}>
          <span style={{ position: "absolute", top: 1, right: 1, width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.55)" }}/>
        </div>
        {hoverCard && (
          <EventInfoCard event={first} anchorEl={ref.current}
            onEnter={showCard} onLeave={hideCard} onDoneToggle={onDoneToggle}/>
        )}
      </>
    );
  }

  /* ── Single event — pure color square, details on hover ── */
  const first = events[0];

  return (
    <>
      <div ref={ref}
        data-testid={`cell-event-${entityId}-${date}`}
        data-event-id={first.id}
        draggable
        onMouseEnter={e => { onCellEnter(); hoveredEventForCopy = first; showCard(); (e.currentTarget as HTMLElement).style.filter = "brightness(1.35)"; }}
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
        }}
      />

      {/* ── Hover Info Card ── */}
      {hoverCard && (
        <EventInfoCard
          event={first}
          anchorEl={ref.current}
          onEnter={showCard}
          onLeave={hideCard}
          onDoneToggle={onDoneToggle}
        />
      )}
    </>
  );
}

/* ─────────────────────── EventInfoCard (replaces tooltip) ─────────────────────── */
function EventInfoCard({
  event, anchorEl, onEnter, onLeave, onDoneToggle,
}: {
  event: PlannerEvent;
  anchorEl: HTMLElement | null;
  onEnter: () => void;
  onLeave: () => void;
  onDoneToggle: (ev: PlannerEvent) => void;
}) {
  const color = STATUS_COLORS[event.status];
  const earn  = event.earnings ?? 0;
  const exp     = event.expenses ?? 0;
  const net     = earn - exp;

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
      {/* Status stripe */}
      <div className="h-1" style={{ backgroundColor: color }}/>

      <div className="p-3 space-y-2">
        {/* Title row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {event.icon && event.icon !== "none" && (
                <span className="flex-shrink-0">
                  <EventIconBadge icon={event.icon} size={12}/>
                </span>
              )}
              <p className={`text-xs font-semibold text-foreground leading-tight ${event.done ? "line-through opacity-60" : ""}`}>
                {event.title}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}/>
              <p className="text-[10px] text-muted-foreground">{STATUS_LABELS[event.status]}</p>
              {event.done && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-400">
                  <BadgeCheck className="w-3 h-3"/>Выполнено
                </span>
              )}
            </div>
          </div>
        </div>

          {/* Fixed time info */}
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

        {/* Earnings / Expenses */}
        {(earn > 0 || exp > 0) && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
            {earn > 0 && (
              <div className="flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-emerald-400"/>
                <span className="text-[11px] font-bold text-emerald-400 tabular-nums">{fmtMoney(earn)}</span>
              </div>
            )}
            {exp > 0 && (
              <div className="flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3 text-rose-400"/>
                <span className="text-[11px] font-bold text-rose-400 tabular-nums">{fmtMoney(exp)}</span>
              </div>
            )}
            {earn > 0 && exp > 0 && (
              <div className="flex items-center gap-1 ml-auto">
                <Minus className="w-2.5 h-2.5 text-muted-foreground/60"/>
                <span className={`text-[11px] font-bold tabular-nums ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {fmtMoney(net)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Done button */}
        <button
          onClick={() => onDoneToggle(event)}
          className={`w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold py-1.5 rounded-lg border transition-all
            ${event.done
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              : "border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/10"}`}>
          <BadgeCheck className="w-3 h-3"/>
          {event.done ? "Снять выполнение" : "Отметить выполненным"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────── TimePicker ─────────────────────── */
const QUICK_DURATIONS = [
  { label: "30 м", mins: 30 },
  { label: "1 ч",  mins: 60 },
  { label: "2 ч",  mins: 120 },
  { label: "4 ч",  mins: 240 },
  { label: "8 ч",  mins: 480 },
  { label: "12 ч", mins: 720 },
];

function TimeSpinner({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [h, m] = value ? value.split(":").map(Number) : [9, 0];

  const setH = (nh: number) => {
    const clamped = ((nh % 24) + 24) % 24;
    onChange(`${String(clamped).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  };
  const setM = (nm: number) => {
    const clamped = ((nm % 60) + 60) % 60;
    onChange(`${String(h).padStart(2,"0")}:${String(clamped).padStart(2,"0")}`);
  };

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
      <div className="flex items-center gap-1 bg-accent/50 rounded-lg px-2 py-1.5 border border-border">
        <div className="flex flex-col items-center gap-0.5">
          <button type="button" onClick={() => setH(h + 1)}
            className="w-5 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">
            <ChevronLeft className="w-3 h-3 rotate-90"/>
          </button>
          <span className="text-base font-bold text-foreground tabular-nums w-7 text-center leading-none">
            {String(h).padStart(2,"0")}
          </span>
          <button type="button" onClick={() => setH(h - 1)}
            className="w-5 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">
            <ChevronLeft className="w-3 h-3 -rotate-90"/>
          </button>
        </div>
        <span className="text-base font-bold text-muted-foreground/60 mb-0.5">:</span>
        <div className="flex flex-col items-center gap-0.5">
          <button type="button" onClick={() => setM(m + 15)}
            className="w-5 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">
            <ChevronLeft className="w-3 h-3 rotate-90"/>
          </button>
          <span className="text-base font-bold text-foreground tabular-nums w-7 text-center leading-none">
            {String(m).padStart(2,"0")}
          </span>
          <button type="button" onClick={() => setM(m - 15)}
            className="w-5 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">
            <ChevronLeft className="w-3 h-3 -rotate-90"/>
          </button>
        </div>
      </div>
    </div>
  );
}

function TimePicker({ startTime, endTime, onStartChange, onEndChange }: {
  startTime: string; endTime: string;
  onStartChange: (v: string) => void; onEndChange: (v: string) => void;
}) {
  const dur     = startTime && endTime ? calcDuration(startTime, endTime) : "";
  const durMins = startTime && endTime ? calcDurationMins(startTime, endTime) : 0;
  const span    = durMins > 0 ? Math.min(1, durMins / 480) : 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <TimeSpinner value={startTime} onChange={onStartChange} label="Начало"/>
        <div className="flex flex-col items-center pt-7 flex-shrink-0">
          <div className="w-4 h-px bg-border/60"/>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 mt-0.5"/>
        </div>
        <TimeSpinner value={endTime} onChange={onEndChange} label="Конец"/>
      </div>

      <div>
        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mb-1.5">Быстрая длительность</p>
        <div className="flex flex-wrap gap-1">
          {QUICK_DURATIONS.map(({ label, mins }) => {
            const isActive = durMins === mins;
            return (
              <button key={label} type="button"
                onClick={() => onEndChange(addMinutes(startTime, mins))}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-md border transition-all
                  ${isActive
                    ? "bg-primary text-primary-foreground border-transparent scale-105"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {dur && (
        <div className="rounded-lg bg-accent/40 border border-border p-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-foreground flex items-center gap-1">
              <Clock className="w-3 h-3 text-primary"/> {startTime} → {endTime}
            </span>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
              {dur}
            </span>
          </div>
          <div className="w-full h-2 bg-background/60 rounded-full overflow-hidden border border-border/40">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all"
              style={{ width: `${Math.max(5, span * 100)}%` }}/>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── AddEventPopup ─────────────────────── */
function AddEventPopup({ entityId, date, existingEvents: _existingEvents, onClose, onAdd }: {
  entityId: string; date: string;
  existingEvents: PlannerEvent[];
  onClose: () => void;
  onAdd: (ev: PlannerEvent) => void;
}) {
  const [title,    setTitle]    = useState("");
  const [status,   setStatus]   = useState<EventStatus>("planned");
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
        {/* Header */}
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
          {/* Fixed time display */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/40 border border-border/60">
            <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0"/>
            <span className="text-xs font-medium text-foreground">09:00 – 21:00</span>
            <span className="ml-auto text-[10px] font-bold text-primary">12 ч</span>
          </div>

          {/* Title (optional) */}
          <input ref={titleRef} data-testid="input-event-title"
            value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
            placeholder="Заметка к смене (необязательно)"
            className="w-full text-sm bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"/>

          {/* Status */}
          <div className="flex gap-1.5">
            {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
              <button key={s} data-testid={`btn-status-${s}`}
                onClick={() => setStatus(s)}
                className={`flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-all border
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
          <textarea data-testid="input-event-notes"
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Примечания..." rows={2}
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors resize-none"/>
        </div>

        <button data-testid="btn-save-event" onClick={submit}
          className="w-full mt-3 text-xs font-semibold py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          Добавить смену
        </button>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">Enter — сохранить · Esc — закрыть</p>
      </div>
    </div>
  );
}

/* ─────────────────────── ViewPopup ─────────────────────── */
function ViewPopup({ event, existingEvents: _existingEvents, onClose, onStatusChange, onDelete, onSave, onDuplicate }: {
  event: PlannerEvent;
  existingEvents: PlannerEvent[];
  onClose: () => void;
  onStatusChange: (s: EventStatus) => void;
  onDelete: () => void;
  onSave: (upd: PlannerEvent) => void;
  onDuplicate: (date: string) => void;
}) {
  const [editTitle,    setEditTitle]    = useState(event.title ?? "");
  const [editNotes,    setEditNotes]    = useState(event.notes ?? "");
  const [editEarnings, setEditEarnings] = useState<string>(event.earnings != null ? String(event.earnings) : "");
  const [dupMode,      setDupMode]      = useState(false);
  const [dupDate,      setDupDate]      = useState<string>(format(new Date(), "yyyy-MM-dd"));
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
        {/* Header */}
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
          {/* Status row */}
          <div className="flex gap-1.5">
            {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
              <button key={s}
                onClick={() => onStatusChange(s)}
                className={`flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-all border
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
            placeholder="Примечания..."
            rows={2}
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors resize-none"/>
        </div>

        {/* Save / Delete row */}
        <div className="flex items-center gap-2 mb-2">
          {dirty ? (
            <button onClick={save}
              className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1">
              <Check className="w-3 h-3"/> Сохранить
            </button>
          ) : (
            <button onClick={() => onStatusChange("planned")}
              className="flex-1 text-xs py-1.5 rounded-lg border border-border text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1">
              <RotateCcw className="w-3 h-3"/> Запланировать снова
            </button>
          )}
          <button onClick={onDelete}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5"/>
          </button>
        </div>

        {/* Duplicate */}
        <div className="border-t border-border pt-2">
          {!dupMode ? (
            <button onClick={() => setDupMode(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg py-1.5 transition-colors">
              <Copy className="w-3 h-3"/> Дублировать на другой день
            </button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground font-medium">Выберите дату для копии</p>
              <input type="date" value={dupDate} onChange={e => setDupDate(e.target.value)}
                className="w-full text-xs bg-accent/60 border border-border rounded-md px-2 py-1 outline-none focus:border-primary text-foreground"/>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { if (dupDate) { onDuplicate(dupDate); setDupMode(false); } }}
                  className="flex-1 text-[10px] font-semibold py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1">
                  <Copy className="w-3 h-3"/> Скопировать
                </button>
                <button onClick={() => setDupMode(false)}
                  className="px-2 py-1 text-[10px] rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors">
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── FinancePanel ─────────────────────── */
function FinancePanel({
  events, goals,
  totalEarnings, totalExpenses,
  thisWeekEarnings, thisWeekExpenses,
  onClose, onAddGoal, onUpdateGoal, onDeleteGoal,
}: {
  events: PlannerEvent[];
  goals: Goal[];
  totalEarnings: number;
  totalExpenses: number;
  thisWeekEarnings: number;
  thisWeekExpenses: number;
  onClose: () => void;
  onAddGoal: (name: string, amount: number) => void;
  onUpdateGoal: (g: Goal) => void;
  onDeleteGoal: (id: string) => void;
}) {
  const [newGoalName,   setNewGoalName]   = useState("");
  const [newGoalAmount, setNewGoalAmount] = useState("");
  const [showAddGoal,   setShowAddGoal]   = useState(false);
  const [editGoalId,    setEditGoalId]    = useState<string | null>(null);
  const [editGoalName,  setEditGoalName]  = useState("");
  const [editGoalAmt,   setEditGoalAmt]   = useState("");

  const monthNet     = totalEarnings - totalExpenses;
  const weekNet      = thisWeekEarnings - thisWeekExpenses;

  /* Average net per working day this month */
  const workingDates = [...new Set(
    events.filter(e => (e.earnings ?? 0) > 0).map(e => e.date)
  )];
  const avgDailyEarnings = workingDates.length > 0 ? totalEarnings / workingDates.length : 0;
  const avgDailyExpenses = workingDates.length > 0 ? totalExpenses / workingDates.length : 0;
  const avgDailyNet      = avgDailyEarnings - avgDailyExpenses;

  function daysToGoal(goalAmount: number): number | null {
    if (avgDailyNet <= 0) return null;
    const remaining = goalAmount - monthNet;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / avgDailyNet);
  }

  const handleAddGoal = () => {
    const name = newGoalName.trim();
    const amount = parseFloat(newGoalAmount);
    if (!name || isNaN(amount) || amount <= 0) return;
    onAddGoal(name, amount);
    setNewGoalName("");
    setNewGoalAmount("");
    setShowAddGoal(false);
  };

  const handleSaveGoalEdit = (id: string) => {
    const name = editGoalName.trim();
    const amount = parseFloat(editGoalAmt);
    if (!name || isNaN(amount) || amount <= 0) return;
    onUpdateGoal({ id, name, amount });
    setEditGoalId(null);
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-violet-400"/>
          <span className="text-sm font-semibold">Финансы и цели</span>
        </div>
        <button onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <X className="w-3.5 h-3.5"/>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* ── This week ── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Эта неделя</p>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Заработок" value={thisWeekEarnings} color="emerald" icon={<ArrowUpRight className="w-3 h-3"/>}/>
            <StatCard label="Траты"     value={thisWeekExpenses} color="rose"    icon={<ArrowDownRight className="w-3 h-3"/>}/>
            <StatCard label="Чистые"    value={weekNet}          color={weekNet >= 0 ? "emerald" : "rose"} icon={<Wallet className="w-3 h-3"/>} highlight/>
          </div>
        </div>

        {/* ── This month ── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Этот месяц</p>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Заработок" value={totalEarnings} color="emerald" icon={<ArrowUpRight className="w-3 h-3"/>}/>
            <StatCard label="Траты"     value={totalExpenses} color="rose"    icon={<ArrowDownRight className="w-3 h-3"/>}/>
            <StatCard label="Чистые"    value={monthNet}      color={monthNet >= 0 ? "emerald" : "rose"} icon={<TrendingUp className="w-3 h-3"/>} highlight/>
          </div>
          {workingDates.length > 0 && avgDailyNet > 0 && (
            <p className="text-[10px] text-muted-foreground/50 mt-2">
              Рабочих дней: <strong className="text-foreground/70">{workingDates.length}</strong> · Среднее в день: <strong className="text-emerald-400/80">{fmtMoney(Math.round(avgDailyNet))}</strong>
            </p>
          )}
        </div>

        {/* ── Goals ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-violet-400"/>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Цели</p>
            </div>
            <button
              onClick={() => setShowAddGoal(v => !v)}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors px-1.5 py-0.5 rounded hover:bg-primary/10">
              <Plus className="w-3 h-3"/> Добавить
            </button>
          </div>

          {showAddGoal && (
            <div className="mb-3 p-2.5 rounded-lg border border-border bg-accent/20 space-y-2">
              <input
                value={newGoalName}
                onChange={e => setNewGoalName(e.target.value)}
                placeholder="Название цели"
                className="w-full text-xs bg-accent/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"/>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-violet-400 text-xs font-bold">₽</span>
                <input
                  type="number" min="0" step="1000"
                  value={newGoalAmount}
                  onChange={e => setNewGoalAmount(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddGoal(); }}
                  placeholder="Сумма цели"
                  className="w-full text-xs bg-accent/40 border border-border rounded-md pl-6 pr-2 py-1.5 outline-none focus:border-violet-500/60 text-foreground placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleAddGoal}
                  className="flex-1 text-[10px] font-semibold py-1 rounded-md bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 border border-violet-500/30 transition-colors">
                  Сохранить
                </button>
                <button onClick={() => { setShowAddGoal(false); setNewGoalName(""); setNewGoalAmount(""); }}
                  className="px-2 py-1 text-[10px] rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {goals.length === 0 && !showAddGoal && (
            <div className="text-center py-4">
              <Trophy className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2"/>
              <p className="text-[11px] text-muted-foreground/40">Нет целей. Добавьте первую!</p>
            </div>
          )}

          <div className="space-y-2">
            {goals.map(goal => {
              const days = daysToGoal(goal.amount);
              const progress = monthNet > 0 ? Math.min(1, monthNet / goal.amount) : 0;
              const reached  = monthNet >= goal.amount;
              const isEditing = editGoalId === goal.id;

              return (
                <div key={goal.id}
                  className={`rounded-xl border p-3 space-y-2 ${reached ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background/40"}`}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <input value={editGoalName} onChange={e => setEditGoalName(e.target.value)}
                        className="w-full text-xs bg-accent/40 border border-border rounded-md px-2 py-1 outline-none focus:border-primary text-foreground"/>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-violet-400 text-xs font-bold">₽</span>
                        <input type="number" min="0" value={editGoalAmt} onChange={e => setEditGoalAmt(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleSaveGoalEdit(goal.id); }}
                          className="w-full text-xs bg-accent/40 border border-border rounded-md pl-6 pr-2 py-1 outline-none focus:border-violet-500/60 text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleSaveGoalEdit(goal.id)}
                          className="flex-1 text-[10px] font-semibold py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                          <Check className="w-3 h-3 inline mr-1"/>Сохранить
                        </button>
                        <button onClick={() => setEditGoalId(null)}
                          className="px-2 text-[10px] rounded border border-border text-muted-foreground hover:bg-accent transition-colors">
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {reached
                            ? <Trophy className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0"/>
                            : <Target className="w-3.5 h-3.5 text-violet-400/70 flex-shrink-0"/>
                          }
                          <span className="text-[12px] font-semibold text-foreground truncate">{goal.name}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => { setEditGoalId(goal.id); setEditGoalName(goal.name); setEditGoalAmt(String(goal.amount)); }}
                            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                            <Pencil className="w-2.5 h-2.5"/>
                          </button>
                          <button onClick={() => onDeleteGoal(goal.id)}
                            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors">
                            <X className="w-2.5 h-2.5"/>
                          </button>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground/60">
                            {fmtMoney(Math.max(0, monthNet))} / {fmtMoney(goal.amount)}
                          </span>
                          <span className={`font-bold ${reached ? "text-emerald-400" : "text-violet-400"}`}>
                            {Math.round(progress * 100)}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-accent/40 rounded-full overflow-hidden border border-border/40">
                          <div className="h-full rounded-full transition-all"
                            style={{
                              width: `${progress * 100}%`,
                              background: reached
                                ? "linear-gradient(90deg, #10b981, #059669)"
                                : "linear-gradient(90deg, #8b5cf6, #6366f1)"
                            }}/>
                        </div>
                      </div>

                      {/* Days to goal */}
                      {reached ? (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <Trophy className="w-3 h-3 text-emerald-400 flex-shrink-0"/>
                          <span className="text-[11px] font-bold text-emerald-400">Цель достигнута! 🎉</span>
                        </div>
                      ) : days !== null ? (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                          <CalendarDays className="w-3 h-3 text-violet-400 flex-shrink-0"/>
                          <span className="text-[11px] text-violet-300">
                            Нужно ещё <strong className="text-violet-400">{days} раб. дн.</strong>
                            {avgDailyNet > 0 && (
                              <span className="text-muted-foreground/60"> · {fmtMoney(Math.round(avgDailyNet))}/день</span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <div className="px-2 py-1.5 rounded-lg bg-accent/40 border border-border/40">
                          <p className="text-[10px] text-muted-foreground/50">Добавьте события с заработком для расчёта</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stat card helper ── */
function StatCard({ label, value, color, icon, highlight }: {
  label: string; value: number;
  color: "emerald" | "rose" | string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
    rose:    { bg: "bg-rose-500/10",    text: "text-rose-400",    border: "border-rose-500/20" },
  };
  const c = colors[color] ?? colors.emerald;

  return (
    <div className={`rounded-lg border p-2 ${highlight ? `${c.bg} ${c.border}` : "border-border bg-background/30"}`}>
      <div className={`flex items-center gap-1 mb-1 ${c.text}`}>
        {icon}
        <span className="text-[9px] font-medium opacity-70">{label}</span>
      </div>
      <p className={`text-[12px] font-bold tabular-nums leading-none ${value === 0 ? "text-muted-foreground/30" : c.text}`}>
        {value === 0 ? "—" : fmtMoney(value)}
      </p>
    </div>
  );
}
