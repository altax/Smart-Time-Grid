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
    setCtxMenu(null); setPopup({ mode: "add", entityId, date, anchor });
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
  const overdueN      = events.filter(e => e.status === "overdue").length;
  const confirmedN    = events.filter(e => e.status === "confirmed").length;
  const pendingN      = events.filter(e => e.status === "pending").length;
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

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0 gap-4">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5 text-primary">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">Планировщик</span>
        </div>

        <div className="flex items-center gap-1">
          <button data-testid="btn-prev-month"
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <ChevronLeft className="w-3.5 h-3.5"/>
          </button>
          <button data-testid="btn-today"
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 h-7 rounded text-xs font-medium hover:bg-accent transition-colors min-w-[130px] text-center">
            {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </button>
          <button data-testid="btn-next-month"
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <ChevronRight className="w-3.5 h-3.5"/>
          </button>
        </div>

        {/* Earnings badge */}
        {events.length > 0 && (
          <div className="flex items-center gap-3 px-3 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <TrendingUp className="w-3 h-3"/>
              {fmtMoney(totalEarnings)}
            </span>
            {totalExpenses > 0 && (
              <>
                <div className="w-px h-3.5 bg-emerald-500/30"/>
                <span className="flex items-center gap-1 text-[10px] text-rose-400/80">
                  <ArrowDownRight className="w-3 h-3"/>
                  {fmtMoney(totalExpenses)}
                </span>
              </>
            )}
            {dayEarnings > 0 && (
              <>
                <div className="w-px h-3.5 bg-emerald-500/30"/>
                <span className="flex items-center gap-1 text-[10px] text-emerald-400/70">
                  <CalendarDays className="w-3 h-3"/>
                  {fmtMoney(dayEarnings)}
                </span>
              </>
            )}
          </div>
        )}

        {/* Clipboard badge */}
        {copiedEvent && (
          <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 flex-shrink-0 max-w-[160px]">
            <Copy className="w-3 h-3 flex-shrink-0 animate-pulse"/>
            <span className="text-[10px] font-semibold truncate">{copiedEvent.title}</span>
            <button onClick={() => setCopiedEvent(null)} className="flex-shrink-0 ml-0.5 hover:text-white transition-colors">
              <X className="w-2.5 h-2.5"/>
            </button>
          </div>
        )}

        {/* Finance panel toggle */}
        <button
          onClick={() => setShowFinance(v => !v)}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 h-7 rounded-md transition-colors flex-shrink-0
            ${showFinance ? "bg-violet-500/20 text-violet-400 border border-violet-500/30" : "bg-accent text-muted-foreground hover:text-foreground hover:bg-accent/80"}`}>
          <Wallet className="w-3.5 h-3.5"/> Финансы
        </button>

        <button data-testid="btn-add-row-header"
          onClick={() => setShowAddRow(true)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 h-7 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0">
          <Plus className="w-3.5 h-3.5"/> Добавить строку
        </button>
      </header>

      {/* ── Main content area ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Grid ── */}
        <div ref={gridRef} className="flex-1 overflow-auto" style={{ scrollbarWidth: "none" }}>
          <table className="border-collapse" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 210, minWidth: 210 }}/>
              {days.map(d => <col key={d.toISOString()} style={{ width: 58, minWidth: 58 }}/>)}
              <col style={{ width: 44, minWidth: 44 }}/>
            </colgroup>

            <thead className="sticky top-0 z-20">
              {/* ── Week labels row ── */}
              <tr>
                <th className="bg-card border-b border-border/30 border-r border-border px-3"/>
                {weekGroups.map(wDays => {
                  const isFirst = wDays === weekGroups[0];
                  const wEarn   = weekEarnings(wDays);
                  const wExp    = weekExpenses(wDays);
                  const label   = `${format(wDays[0], "d")}–${format(wDays[wDays.length - 1], "d MMM", { locale: ru })}`;
                  return (
                    <th key={wDays[0].toISOString()} colSpan={wDays.length}
                      className={`bg-card border-b border-border/30 py-1.5 px-1 text-center
                        ${!isFirst ? "border-l-2 border-l-border/50" : ""}`}>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground/60 font-semibold">{label}</span>
                        {wEarn > 0 && (
                          <span className="text-[10px] font-bold text-emerald-400">
                            +{fmtMoney(wEarn)}
                          </span>
                        )}
                        {wExp > 0 && (
                          <span className="text-[9px] font-semibold text-rose-400/70">
                            -{fmtMoney(wExp)}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="bg-card border-b border-border/30 border-l border-border"/>
              </tr>

              {/* ── Day numbers row ── */}
              <tr>
                <th className="bg-card border-b border-r border-border px-3 py-1.5 text-left align-bottom">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Объект</span>
                </th>
                {days.map(day => {
                  const tod   = isToday(day), wknd = isWeekend(day);
                  const isMon = day.getDay() === 1;
                  const ds    = format(day, "yyyy-MM-dd");
                  const active = dayPanel === ds;
                  return (
                    <th key={day.toISOString()}
                      ref={tod ? todayThRef : undefined}
                      onClick={() => setDayPanel(active ? format(new Date(), "yyyy-MM-dd") : ds)}
                      className={`border-b border-border py-1 text-center align-bottom cursor-pointer transition-colors
                        hover:bg-primary/10
                        ${isMon ? "border-l-2 border-l-border/60" : ""}
                        ${wknd ? "bg-background" : "bg-card"} ${tod ? "bg-primary/10" : ""} ${active ? "bg-primary/20 border-b-2 border-b-primary" : ""}`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full
                          ${tod ? "bg-primary text-primary-foreground" : wknd ? "text-muted-foreground/70" : "text-foreground"}`}>
                          {format(day, "d")}
                        </span>
                        <span className={`text-[8px] font-medium ${wknd ? "text-muted-foreground/50" : "text-muted-foreground/70"}`}>
                          {DAY_ABBR[day.getDay()]}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="bg-card border-b border-l border-border py-1 text-center">
                  <span className="text-[9px] text-muted-foreground/50 uppercase">∑</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {entities.length === 0 && (
                <tr>
                  <td colSpan={days.length + 2} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-primary"/>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Нет данных</p>
                        <p className="text-xs text-muted-foreground">Добавьте строку или загрузите демо</p>
                      </div>
                      <button data-testid="btn-demo" onClick={loadDemoData}
                        className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
                        <Sparkles className="w-3.5 h-3.5"/> Загрузить демо-данные
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
                />
              ))}

              {/* ── Add entity row ── */}
              {showAddRow ? (
                <tr>
                  <td colSpan={days.length + 2}
                    className="border-t-2 border-primary/30 bg-primary/5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Plus className="w-3.5 h-3.5 text-primary"/>
                      </div>
                      <input ref={addRowRef} data-testid="input-new-entity"
                        value={newEntityName}
                        onChange={e => setNewEntityName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleAddEntity();
                          if (e.key === "Escape") { setNewEntityName(""); setShowAddRow(false); }
                        }}
                        placeholder="Название объекта (Enter для добавления)..."
                        className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50"/>
                      <button onClick={handleAddEntity} disabled={!newEntityName.trim()}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground
                          hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                        Добавить
                      </button>
                      <button onClick={() => { setNewEntityName(""); setShowAddRow(false); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        <X className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={days.length + 2}
                    onClick={() => setShowAddRow(true)}
                    className="border-t border-dashed border-border/40 cursor-pointer group/add hover:bg-primary/5 transition-colors">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="w-5 h-5 rounded-md border-2 border-dashed border-border/40
                        group-hover/add:border-primary/50 flex items-center justify-center transition-colors">
                        <Plus className="w-3 h-3 text-muted-foreground/30 group-hover/add:text-primary/70 transition-colors"/>
                      </div>
                      <span className="text-xs text-muted-foreground/40 group-hover/add:text-primary/70 transition-colors">
                        Добавить объект
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Finance panel (right side) ── */}
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

      {/* ── Day schedule panel ── */}
      {entities.length > 0 && (
        <HorizontalTimeline
          date={dayPanel}
          entities={entities}
          getEventsForCell={getEventsForCell}
          onDayReset={() => setDayPanel(format(new Date(), "yyyy-MM-dd"))}
          collapsed={tlCollapsed}
          onToggleCollapse={() => setTlCollapsed(v => !v)}
        />
      )}

      {/* ── Status bar ── */}
      <footer className="border-t border-border flex-shrink-0">
        {totalEarnings > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {(() => {
              const maxW = Math.max(...weekGroups.map(w => weekEarnings(w)), 1);
              return weekGroups.map((wDays, i) => {
                const earn    = weekEarnings(wDays);
                const exp     = weekExpenses(wDays);
                const net     = earn - exp;
                const pctFill = (earn / maxW) * 100;
                const label   = `${format(wDays[0], "d")}–${format(wDays[wDays.length - 1], "d MMM", { locale: ru })}`;
                return (
                  <div key={i} className="flex-shrink-0 relative rounded-lg border border-border/40 bg-background/50 overflow-hidden"
                    style={{ minWidth: 96 }}>
                    <div className="absolute bottom-0 left-0 h-0.5 rounded-full transition-all"
                      style={{ width: `${pctFill}%`, backgroundColor: earn > 0 ? "rgb(52,211,153)" : "transparent" }}/>
                    <div className="px-3 py-1.5">
                      <p className="text-[10px] text-muted-foreground/60 leading-none mb-1">{label}</p>
                      <p className={`text-[13px] font-bold leading-none tabular-nums ${earn > 0 ? "text-emerald-400" : "text-muted-foreground/25"}`}>
                        {earn > 0 ? fmtMoney(earn) : "—"}
                      </p>
                      {exp > 0 && (
                        <p className="text-[9px] text-rose-400/70 leading-none mt-0.5 tabular-nums">
                          -{fmtMoney(exp)} · чист. {fmtMoney(net)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              });
            })()}

            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 ml-auto">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0"/>
              <div>
                <p className="text-[9px] text-emerald-400/60 leading-none mb-0.5">За месяц</p>
                <p className="text-[14px] font-bold text-emerald-400 leading-none tabular-nums">{fmtMoney(totalEarnings)}</p>
                {totalExpenses > 0 && (
                  <p className="text-[9px] text-rose-400/70 leading-none mt-0.5 tabular-nums">
                    -{fmtMoney(totalExpenses)} = {fmtMoney(totalEarnings - totalExpenses)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-5 px-5 py-2 text-xs text-muted-foreground">
          {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS[s] }}/>
              <span>{STATUS_LABELS[s]}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-4">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.overdue }}/>{overdueN}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.confirmed }}/>{confirmedN}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.pending }}/>{pendingN}</span>
            <span className="border-l border-border pl-4">Всего: <strong className="text-foreground">{events.length}</strong></span>
          </div>
          <span className="text-[10px] text-muted-foreground/40 ml-2 hidden lg:block">Shift+клик = статус · ПКМ = меню · Перетащи = перенести · ✓ = выполнить</span>
        </div>
      </footer>

      {/* ── Popup ── */}
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

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div ref={ctxRef}
          style={{ position:"fixed", left:ctxMenu.x, top:ctxMenu.y, zIndex:60 }}
          className="w-48 rounded-lg border border-border bg-popover shadow-2xl overflow-hidden py-1"
          onClick={e => e.stopPropagation()}>
          <div className="px-3 py-1.5 border-b border-border mb-1">
            <p className="text-[11px] font-semibold text-foreground truncate">{ctxMenu.event.title}</p>
            <p className="text-[10px] text-muted-foreground">{ctxMenu.event.date}</p>
          </div>
          {/* Done toggle */}
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
}

function EntityRow({
  entity, days, eventCount, dragOverKey,
  getEventsForCell, onCellClick, onEventClick, onContextMenu, onShiftClick, onDoneToggle,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onDeleteEntity, onRenameEntity, copiedEventId,
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

  return (
    <tr className="group border-b border-border/30 hover:bg-white/[0.02] transition-colors">
      {/* Name */}
      <td className="border-r border-border/30 px-2.5 py-1 sticky left-0 bg-background z-10 group-hover:bg-[#1e2535] transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entity.color }}/>
          {editing ? (
            <input ref={inputRef} value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setEditName(entity.name); setEditing(false); }
              }}
              className="text-[13px] bg-transparent border-b border-primary outline-none flex-1 min-w-0 text-foreground"/>
          ) : (
            <span className="text-[13px] truncate cursor-default" onDoubleClick={() => setEditing(true)} title={entity.name}>
              {entity.name}
            </span>
          )}
          {!editing && (
            <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button onClick={() => setEditing(true)} title="Переименовать"
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
                <Pencil className="w-2.5 h-2.5"/>
              </button>
              <button onClick={() => onDeleteEntity(entity.id)} title="Удалить"
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent">
                <Trash2 className="w-2.5 h-2.5"/>
              </button>
            </div>
          )}
        </div>
      </td>

      {/* Day cells */}
      {days.map(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        const cellEvents = getEventsForCell(entity.id, dateStr);
        const wknd = isWeekend(day), tod = isToday(day);
        const key = `${entity.id}-${dateStr}`;
        const isDragTarget = dragOverKey === key;
        const isMon = day.getDay() === 1;
        return (
          <td key={dateStr}
            className={`px-0.5 py-0.5 transition-all align-top h-[56px]
              ${isMon ? "border-l-2 border-l-border/40" : ""}
              ${wknd ? "bg-white/[0.012]" : ""}
              ${tod  ? "bg-primary/[0.07]" : ""}
              ${isDragTarget ? "bg-primary/20 ring-1 ring-inset ring-primary/40 rounded" : ""}`}
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
            />
          </td>
        );
      })}

      {/* Summary */}
      <td className="border-l border-border/30 text-center py-1">
        {eventCount > 0
          ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor:`${entity.color}25`, color:entity.color }}>{eventCount}</span>
          : <span className="text-[10px] text-muted-foreground/30">—</span>
        }
      </td>
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
}

function durSpan(start: string, end: string): number {
  const mins = calcDurationMins(start, end);
  return Math.min(1, Math.max(0.12, mins / 480));
}

function GridCell({
  events, entityId, date,
  onAddClick, onEventClick, onContextMenu, onShiftClick, onDoneToggle,
  onDragStart, onDragEnd, copiedEventId,
}: GridCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverCard, setHoverCard] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* always keep module-level target in sync with this cell's hover state */
  const onCellEnter = () => { hoveredPasteTarget = { entityId, date }; };
  const onCellLeave = () => { if (hoveredPasteTarget?.entityId === entityId && hoveredPasteTarget?.date === date) hoveredPasteTarget = null; };

  const showCard = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverCard(true);
  };
  const hideCard = () => {
    hoverTimer.current = setTimeout(() => setHoverCard(false), 80);
  };

  /* ── Empty cell ── */
  if (events.length === 0) {
    return (
      <div ref={ref} data-testid={`cell-empty-${entityId}-${date}`}
        onMouseEnter={onCellEnter}
        onMouseLeave={onCellLeave}
        onClick={() => ref.current && onAddClick(entityId, date, ref.current.getBoundingClientRect())}
        className={`group/c w-full h-full min-h-[48px] flex items-center justify-center cursor-pointer rounded-md transition-all border
          ${copiedEventId ? "border-sky-500/30 hover:bg-sky-500/10 hover:border-sky-500/50" : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.04]"}`}>
        {copiedEventId
          ? <Copy className="w-3 h-3 text-sky-500/40 group-hover/c:text-sky-400/70 transition-colors"/>
          : <Plus className="w-3 h-3 text-transparent group-hover/c:text-muted-foreground/30 transition-colors"/>
        }
      </div>
    );
  }

  /* ── Multi-event cell ── */
  if (events.length > 1) {
    const timedEvs = events.filter(e => e.startTime && e.endTime);
    const totalBusy = timedEvs.reduce((s, e) => s + calcDurationMins(e.startTime!, e.endTime!), 0);
    const freeWorkMins = Math.max(0, 960 - totalBusy);
    const freeLabel = freeWorkMins > 0
      ? (freeWorkMins >= 60
          ? `${Math.floor(freeWorkMins / 60)}ч${freeWorkMins % 60 > 0 ? ` ${freeWorkMins % 60}м` : ""}`
          : `${freeWorkMins}м`) + " своб."
      : "Занято";

    return (
      <div ref={ref} data-testid={`cell-event-${entityId}-${date}`}
        onMouseEnter={onCellEnter}
        onMouseLeave={onCellLeave}
        className="relative w-full min-h-[48px] rounded-md overflow-hidden border border-white/10
          bg-white/[0.05] p-1 flex flex-col gap-0.5">
        <div className="w-full h-[5px] rounded-full bg-black/30 relative overflow-hidden flex-shrink-0">
          {timedEvs.map(ev => {
            const left = workPct(ev.startTime!);
            const w    = Math.max(3, workPct(ev.endTime!) - left);
            return (
              <div key={ev.id} className="absolute top-0 bottom-0 rounded-sm"
                style={{ left: `${left}%`, width: `${w}%`, backgroundColor: STATUS_COLORS[ev.status], opacity: ev.done ? 0.4 : 1 }}/>
            );
          })}
        </div>

        <div className="flex flex-col gap-px flex-1 min-h-0">
          {events.slice(0, 3).map(ev => (
            <button key={ev.id}
              onClick={e => { e.stopPropagation(); ref.current && onEventClick(ev, ref.current.getBoundingClientRect()); }}
              onContextMenu={e => { e.stopPropagation(); onContextMenu(e.nativeEvent, ev); }}
              className="flex items-center gap-1 w-full text-left hover:bg-white/10 rounded px-0.5 py-px transition-colors group/chip">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_COLORS[ev.status] }}/>
              <span className={`text-[7px] text-white/75 truncate leading-none font-medium ${ev.done ? "line-through opacity-50" : ""}`}>
                {ev.startTime ? `${fmtTime(ev.startTime)}` : ev.title.slice(0, 8)}
              </span>
              {ev.done && <BadgeCheck className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0 ml-auto"/>}
            </button>
          ))}
          {events.length > 3 && (
            <span className="text-[6.5px] text-white/40 px-0.5">+{events.length - 3} ещё</span>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto flex-shrink-0">
          <span className={`text-[6.5px] leading-none font-medium ${freeWorkMins > 0 ? "text-white/35" : "text-rose-400/70"}`}>
            {freeLabel}
          </span>
          <button
            onClick={e => { e.stopPropagation(); ref.current && onAddClick(entityId, date, ref.current.getBoundingClientRect()); }}
            className="w-4 h-4 rounded flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/15 transition-colors flex-shrink-0">
            <Plus className="w-2.5 h-2.5"/>
          </button>
        </div>
      </div>
    );
  }

  /* ── Single event card ── */
  const first    = events[0];
  const hasTime  = !!(first.startTime && first.endTime);
  const dur      = hasTime ? calcDuration(first.startTime!, first.endTime!) : "";
  const color    = STATUS_COLORS[first.status];
  const gradient = STATUS_GRADIENTS[first.status];
  const earn     = first.earnings ?? 0;
  const exp      = first.expenses ?? 0;

  const span      = hasTime ? durSpan(first.startTime!, first.endTime!) : 0.4;
  const startFrac = hasTime ? Math.max(0, Math.min(1, (calcDurationMins("06:00", first.startTime!) / 960))) : 0;

  return (
    <>
      <div ref={ref}
        data-testid={`cell-event-${entityId}-${date}`}
        data-event-id={first.id}
        draggable
        onMouseEnter={() => { hoveredPasteTarget = { entityId, date }; hoveredEventForCopy = first; showCard(); }}
        onMouseLeave={() => { hoveredPasteTarget = null; hoveredEventForCopy = null; hideCard(); }}
        onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(first.id, entityId, date); setHoverCard(false); }}
        onDragEnd={onDragEnd}
        onClick={e => {
          if (e.shiftKey) { onShiftClick(first); return; }
          ref.current && onEventClick(first, ref.current.getBoundingClientRect());
        }}
        onContextMenu={e => onContextMenu(e.nativeEvent, first)}
        className={`relative w-full min-h-[48px] cursor-grab active:cursor-grabbing group/ev rounded-md overflow-hidden
          transition-all hover:brightness-110 hover:scale-[1.02] hover:shadow-lg select-none
          ${copiedEventId === first.id ? "ring-2 ring-sky-400/70 ring-offset-1 ring-offset-background" : ""}`}
        style={{ background: gradient, opacity: first.done ? 0.65 : 1 }}>

        {/* Done overlay */}
        {first.done && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10 pointer-events-none rounded-md">
            <div className="flex items-center gap-1 bg-emerald-500/80 rounded-full px-1.5 py-0.5">
              <Check className="w-2.5 h-2.5 text-white"/>
              <span className="text-[8px] text-white font-bold">Готово</span>
            </div>
          </div>
        )}

        {/* Icon */}
        {first.icon && first.icon !== "none" && !first.done && (
          <span className="absolute top-1.5 left-1.5 opacity-80">
            <EventIconBadge icon={first.icon} size={10}/>
          </span>
        )}

        {/* Done toggle button — appears on hover */}
        <button
          onClick={e => { e.stopPropagation(); onDoneToggle(first); }}
          title={first.done ? "Снять отметку" : "Отметить выполненным"}
          className="absolute top-1 right-1 w-4 h-4 rounded-full opacity-0 group-hover/ev:opacity-100
            transition-all flex items-center justify-center z-20
            bg-black/30 hover:bg-emerald-500/80"
          style={{ pointerEvents: "all" }}>
          <Check className="w-2.5 h-2.5 text-white"/>
        </button>

        {/* Content */}
        <div className={`px-1.5 pt-1.5 pb-1 flex flex-col justify-between h-full min-h-[48px] ${first.done ? "opacity-60" : ""}`}>
          <p className={`text-white text-[9px] font-semibold leading-tight line-clamp-2 drop-shadow-sm ${first.done ? "line-through" : ""}`}>
            {first.title}
          </p>
          <div className="mt-auto">
            {hasTime && (
              <p className="text-white/75 text-[8px] font-mono leading-none mb-1">
                {fmtTime(first.startTime!)}–{fmtTime(first.endTime!)}
              </p>
            )}
            <div className="w-full h-[3px] rounded-full bg-black/20 overflow-hidden">
              <div className="h-full rounded-full bg-white/50 transition-all"
                style={{ width: `${span * 100}%`, marginLeft: `${startFrac * (1 - span) * 100}%` }}/>
            </div>
            {earn > 0 ? (
              <p className="text-white/80 text-[8px] font-bold leading-none mt-1 tabular-nums">
                {earn >= 1000 ? `${Math.round(earn / 100) / 10}к ₽` : `${earn} ₽`}
                {exp > 0 && <span className="text-rose-300/80 ml-1">-{exp >= 1000 ? `${Math.round(exp / 100) / 10}к` : exp}</span>}
              </p>
            ) : dur ? (
              <p className="text-white/60 text-[8px] leading-none mt-1">{dur}</p>
            ) : null}
          </div>
        </div>
        <div className="absolute inset-0 opacity-0 group-hover/ev:opacity-100 bg-black/10 transition-opacity pointer-events-none rounded-md"/>
      </div>

      {/* ── Hover Info Card ── */}
      {hoverCard && (
        <EventInfoCard
          event={first}
          dur={dur}
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
  event, dur, anchorEl, onEnter, onLeave, onDoneToggle,
}: {
  event: PlannerEvent;
  dur: string;
  anchorEl: HTMLElement | null;
  onEnter: () => void;
  onLeave: () => void;
  onDoneToggle: (ev: PlannerEvent) => void;
}) {
  const color   = STATUS_COLORS[event.status];
  const hasTime = !!(event.startTime && event.endTime);
  const earn    = event.earnings ?? 0;
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

        {/* Assignee */}
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: color }}>
            {event.assignee.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase() || "?"}
          </div>
          <span className="text-[11px] text-foreground/80">{event.assignee}</span>
        </div>

        {/* Time */}
        {hasTime && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-accent/40 border border-border/40">
            <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0"/>
            <span className="text-[11px] font-semibold text-foreground">
              {event.startTime} → {event.endTime}
            </span>
            {dur && (
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${color}25`, color }}>
                {dur}
              </span>
            )}
          </div>
        )}
        {!hasTime && (
          <p className="text-[10px] text-muted-foreground/50 italic">Время не указано</p>
        )}

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
  { label: "1.5 ч",mins: 90 },
  { label: "2 ч",  mins: 120 },
  { label: "3 ч",  mins: 180 },
  { label: "4 ч",  mins: 240 },
  { label: "8 ч",  mins: 480 },
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
function AddEventPopup({ entityId, date, existingEvents, onClose, onAdd }: {
  entityId: string; date: string;
  existingEvents: PlannerEvent[];
  onClose: () => void;
  onAdd: (ev: PlannerEvent) => void;
}) {
  const [title,     setTitle]     = useState("");
  const [assignee,  setAssignee]  = useState("");
  const [status,    setStatus]    = useState<EventStatus>("pending");
  const [notes,     setNotes]     = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime,   setEndTime]   = useState("10:00");
  const [useTime,   setUseTime]   = useState(false);
  const [icon,      setIcon]      = useState<EventIcon>("none");
  const [earnings,  setEarnings]  = useState<string>("");
  const [expenses,  setExpenses]  = useState<string>("");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  const dateLabel = (() => {
    try { return format(parseISO(date), "d MMMM yyyy", { locale: ru }); } catch { return date; }
  })();

  const conflict = useTime && startTime && endTime
    ? existingEvents.find(e =>
        e.startTime && e.endTime &&
        hasTimeOverlap(startTime, endTime, e.startTime, e.endTime)
      )
    : undefined;

  const canSubmit = !!title.trim() && !conflict;

  const submit = () => {
    if (!canSubmit) return;
    onAdd({
      id: genId(), entityId, date, status,
      title: title.trim(),
      assignee: assignee.trim() || "—",
      notes: notes.trim() || undefined,
      startTime: useTime ? startTime : undefined,
      endTime:   useTime ? endTime   : undefined,
      icon:     icon !== "none" ? icon : undefined,
      earnings: earnings ? parseFloat(earnings) : undefined,
      expenses: expenses ? parseFloat(expenses) : undefined,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="h-0.5 transition-colors" style={{ backgroundColor: STATUS_COLORS[status] }}/>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold">Новое событие</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{dateLabel}</p>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>

        <div className="space-y-2">
          <input ref={titleRef} data-testid="input-event-title"
            value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Название события"
            className="w-full text-sm bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"/>
          <input data-testid="input-event-assignee"
            value={assignee} onChange={e => setAssignee(e.target.value)}
            placeholder="Ответственный"
            className="w-full text-sm bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"/>

          <div>
            <button
              data-testid="btn-toggle-time"
              onClick={() => setUseTime(v => !v)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all
                ${useTime ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              <Clock className="w-3 h-3"/>
              {useTime ? "Время указано" : "Добавить время"}
            </button>

            {useTime && (
              <div className="mt-2 space-y-2">
                <TimePicker
                  startTime={startTime} endTime={endTime}
                  onStartChange={setStartTime} onEndChange={setEndTime}
                />
                {conflict && (
                  <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-destructive/10 border border-destructive/30">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5"/>
                    <div>
                      <p className="text-[10px] font-semibold text-destructive leading-tight">Конфликт времени</p>
                      <p className="text-[9px] text-destructive/80 mt-0.5 leading-tight">
                        Пересекается с «{conflict.title}»{conflict.startTime ? ` (${conflict.startTime}–${conflict.endTime})` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-1.5">
            {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
              <button key={s} data-testid={`btn-status-${s}`}
                onClick={() => setStatus(s)}
                className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-all border
                  ${status === s ? "text-white border-transparent scale-105" : "border-border text-muted-foreground hover:border-border/80"}`}
                style={status === s ? { backgroundColor: STATUS_COLORS[s] } : {}}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <textarea data-testid="input-event-notes"
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Заметки (необязательно)" rows={2}
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors resize-none"/>

          <IconPicker value={icon} onChange={setIcon}/>

          {/* Earnings + Expenses row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-400 text-xs font-bold">₽</span>
              <input
                type="number" min="0" step="100"
                value={earnings} onChange={e => setEarnings(e.target.value)}
                placeholder="Заработок"
                className="w-full text-xs bg-accent/40 border border-border rounded-lg pl-6 pr-2 py-1.5 outline-none focus:border-emerald-500/60 text-foreground placeholder:text-muted-foreground transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rose-400 text-xs font-bold">−</span>
              <input
                type="number" min="0" step="100"
                value={expenses} onChange={e => setExpenses(e.target.value)}
                placeholder="Траты"
                className="w-full text-xs bg-accent/40 border border-rose-500/20 rounded-lg pl-6 pr-2 py-1.5 outline-none focus:border-rose-500/60 text-foreground placeholder:text-muted-foreground transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
            </div>
          </div>
        </div>

        <button data-testid="btn-save-event" onClick={submit} disabled={!canSubmit}
          className="w-full mt-3 text-xs font-semibold py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Добавить событие
        </button>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">Enter — сохранить · Esc — закрыть</p>
      </div>
    </div>
  );
}

/* ─────────────────────── ViewPopup ─────────────────────── */
function ViewPopup({ event, existingEvents, onClose, onStatusChange, onDelete, onSave, onDuplicate }: {
  event: PlannerEvent;
  existingEvents: PlannerEvent[];
  onClose: () => void;
  onStatusChange: (s: EventStatus) => void;
  onDelete: () => void;
  onSave: (upd: PlannerEvent) => void;
  onDuplicate: (date: string) => void;
}) {
  const [editTitle,    setEditTitle]    = useState(event.title);
  const [editAssignee, setEditAssignee] = useState(event.assignee);
  const [editNotes,    setEditNotes]    = useState(event.notes ?? "");
  const [startTime,    setStartTime]    = useState(event.startTime ?? "");
  const [endTime,      setEndTime]      = useState(event.endTime ?? "");
  const [editIcon,     setEditIcon]     = useState<EventIcon>(event.icon ?? "none");
  const [editEarnings, setEditEarnings] = useState<string>(event.earnings != null ? String(event.earnings) : "");
  const [editExpenses, setEditExpenses] = useState<string>(event.expenses != null ? String(event.expenses) : "");
  const [dupMode,      setDupMode]      = useState(false);
  const [dupDate,      setDupDate]      = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dirty, setDirty] = useState(false);

  const dateLabel = (() => {
    try { return format(parseISO(event.date), "d MMMM yyyy", { locale: ru }); } catch { return event.date; }
  })();

  const initials = event.assignee.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase() || "?";
  const dur = startTime && endTime ? calcDuration(startTime, endTime) : "";

  const conflict = startTime && endTime
    ? existingEvents.find(e =>
        e.id !== event.id &&
        e.startTime && e.endTime &&
        hasTimeOverlap(startTime, endTime, e.startTime, e.endTime)
      )
    : undefined;

  const mark = () => setDirty(true);

  const save = () => {
    if (!editTitle.trim() || conflict) return;
    onSave({
      ...event,
      title:     editTitle.trim(),
      assignee:  editAssignee.trim() || "—",
      notes:     editNotes.trim() || undefined,
      startTime: startTime || undefined,
      endTime:   endTime   || undefined,
      icon:      editIcon !== "none" ? editIcon : undefined,
      earnings:  editEarnings ? parseFloat(editEarnings) : undefined,
      expenses:  editExpenses ? parseFloat(editExpenses) : undefined,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="h-0.5" style={{ backgroundColor: STATUS_COLORS[event.status] }}/>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: STATUS_COLORS[event.status] }}>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium truncate">{event.assignee}</p>
              <p className="text-[10px] text-muted-foreground">{dateLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0">
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>

        <div className="space-y-2 mb-3">
          <input value={editTitle} onChange={e => { setEditTitle(e.target.value); mark(); }}
            className="w-full text-sm font-medium bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground transition-colors"/>
          <input value={editAssignee} onChange={e => { setEditAssignee(e.target.value); mark(); }}
            placeholder="Ответственный"
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"/>

          <TimePicker
            startTime={startTime} endTime={endTime}
            onStartChange={v => { setStartTime(v); mark(); }}
            onEndChange={v => { setEndTime(v); mark(); }}
          />
          {conflict && (
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5"/>
              <div>
                <p className="text-[10px] font-semibold text-destructive leading-tight">Конфликт времени</p>
                <p className="text-[9px] text-destructive/80 mt-0.5 leading-tight">
                  Пересекается с «{conflict.title}»{conflict.startTime ? ` (${conflict.startTime}–${conflict.endTime})` : ""}
                </p>
              </div>
            </div>
          )}

          <textarea value={editNotes} onChange={e => { setEditNotes(e.target.value); mark(); }}
            placeholder="Заметки..."
            rows={2}
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors resize-none"/>

          <IconPicker value={editIcon} onChange={v => { setEditIcon(v); mark(); }}/>

          {/* Earnings + Expenses row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-400 text-xs font-bold">₽</span>
              <input
                type="number" min="0" step="100"
                value={editEarnings} onChange={e => { setEditEarnings(e.target.value); mark(); }}
                placeholder="Заработок"
                className="w-full text-xs bg-accent/40 border border-border rounded-lg pl-6 pr-2 py-1.5 outline-none focus:border-emerald-500/60 text-foreground placeholder:text-muted-foreground transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rose-400 text-xs font-bold">−</span>
              <input
                type="number" min="0" step="100"
                value={editExpenses} onChange={e => { setEditExpenses(e.target.value); mark(); }}
                placeholder="Траты"
                className="w-full text-xs bg-accent/40 border border-rose-500/20 rounded-lg pl-6 pr-2 py-1.5 outline-none focus:border-rose-500/60 text-foreground placeholder:text-muted-foreground transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
            <button key={s}
              onClick={() => onStatusChange(s)}
              className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-all border
                ${event.status === s ? "text-white border-transparent" : "border-border text-muted-foreground hover:border-border/70"}`}
              style={event.status === s ? { backgroundColor: STATUS_COLORS[s] } : {}}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {dirty ? (
            <button onClick={save} disabled={!!conflict}
              className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
              <Check className="w-3 h-3"/> Сохранить
            </button>
          ) : (
            <>
              <button onClick={() => onStatusChange("pending")}
                className="flex-1 text-xs py-1.5 rounded-lg border border-border text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1">
                <RotateCcw className="w-3 h-3"/> Перенести
              </button>
              <button onClick={() => onStatusChange("confirmed")}
                className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors flex items-center justify-center gap-1">
                <Check className="w-3 h-3"/> Подтвердить
              </button>
            </>
          )}
          <button onClick={onDelete}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5"/>
          </button>
        </div>

        <div className="mt-2 border-t border-border pt-2">
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
