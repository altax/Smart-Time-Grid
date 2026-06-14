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

  const BG = "#0d1117";
  const CELL_EMPTY_WD  = "#21262d";
  const CELL_EMPTY_WE  = "#161b22";
  const FILLED_COLORS: Record<string, string> = {
    confirmed: "#1a7f37",
    pending:   "#9e6a03",
  };

  return (
    <div className="flex text-foreground" style={{ backgroundColor: BG, height: "100vh", overflow: "hidden" }}>

      {/* ─────────────── Sidebar ─────────────── */}
      <aside style={{
        width: 210, flexShrink: 0,
        backgroundColor: "#161b22",
        borderRight: "1px solid #21262d",
        display: "flex", flexDirection: "column",
        padding: "22px 0 16px",
        overflowY: "auto",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.06) transparent",
      }}>
        {/* App title */}
        <div style={{ padding: "0 18px 22px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(230,237,243,0.55)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Планировщик смен
          </span>
        </div>

        {/* Month nav */}
        <div style={{ padding: "0 14px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
            <button data-testid="btn-prev-month"
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "1px solid #30363d", background: "transparent", cursor: "pointer", color: "rgba(230,237,243,0.4)", flexShrink: 0 }}>
              <ChevronLeft className="w-3 h-3"/>
            </button>
            <button data-testid="btn-today"
              onClick={() => setCurrentMonth(new Date())}
              style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "rgba(230,237,243,0.85)", background: "transparent", border: "none", cursor: "pointer", textAlign: "center", padding: 0 }}>
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </button>
            <button data-testid="btn-next-month"
              onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "1px solid #30363d", background: "transparent", cursor: "pointer", color: "rgba(230,237,243,0.4)", flexShrink: 0 }}>
              <ChevronRight className="w-3 h-3"/>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "#21262d", margin: "0 14px 20px" }}/>

        {/* Stats */}
        {(() => {
          const confirmed  = events.filter(e => e.status === "confirmed").length;
          const pending    = events.filter(e => e.status === "pending").length;
          const total      = events.length;
          const totalEarn  = events.reduce((s, e) => s + (e.earnings ?? 0), 0);
          return (
            <div style={{ padding: "0 18px 20px" }}>
              <p style={{ fontSize: 9, fontWeight: 600, color: "rgba(230,237,243,0.25)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>Месяц</p>

              {/* Big earnings figure */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(230,237,243,0.85)", lineHeight: 1 }}>
                  {totalEarn >= 1000
                    ? `${(totalEarn / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} к₽`
                    : `${totalEarn} ₽`}
                </div>
                <div style={{ fontSize: 10, color: "rgba(230,237,243,0.3)", marginTop: 3 }}>фонд оплаты труда</div>
              </div>

              {/* Shift counts */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: "#0d1117", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#3dd68c", lineHeight: 1 }}>{confirmed}</div>
                  <div style={{ fontSize: 9, color: "rgba(230,237,243,0.3)", marginTop: 3 }}>подтверждено</div>
                </div>
                <div style={{ background: "#0d1117", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#f59e0b", lineHeight: 1 }}>{pending}</div>
                  <div style={{ fontSize: 9, color: "rgba(230,237,243,0.3)", marginTop: 3 }}>ожидание</div>
                </div>
              </div>

              {total > 0 && (
                <div style={{ marginTop: 10 }}>
                  {/* Progress bar */}
                  <div style={{ height: 3, borderRadius: 2, background: "#21262d", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round((confirmed / total) * 100)}%`, background: "#1a7f37", borderRadius: 2, transition: "width 0.3s" }}/>
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(230,237,243,0.25)", marginTop: 4 }}>
                    {Math.round((confirmed / total) * 100)}% подтверждено
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "#21262d", margin: "0 14px 18px" }}/>

        {/* Upcoming shifts */}
        {(() => {
          const todayStr = format(new Date(), "yyyy-MM-dd");
          const upcoming = events
            .filter(e => e.date >= todayStr && e.status === "pending")
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 3);
          const entityName = (id: string) => entities.find(e => e.id === id)?.name ?? "—";
          return (
            <div style={{ padding: "0 18px 18px" }}>
              <p style={{ fontSize: 9, fontWeight: 600, color: "rgba(230,237,243,0.25)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Ближайшие смены</p>
              {upcoming.length === 0 ? (
                <p style={{ fontSize: 10, color: "rgba(230,237,243,0.2)" }}>Нет запланированных</p>
              ) : upcoming.map(ev => {
                const d = parseISO(ev.date);
                return (
                  <div key={ev.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    <div style={{ flexShrink: 0, textAlign: "center", background: "#21262d", borderRadius: 5, padding: "3px 5px", minWidth: 28 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(230,237,243,0.8)", lineHeight: 1 }}>{format(d, "d")}</div>
                      <div style={{ fontSize: 8, color: "rgba(230,237,243,0.3)", lineHeight: 1, marginTop: 1 }}>{["вс","пн","вт","ср","чт","пт","сб"][d.getDay()]}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "rgba(230,237,243,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entityName(ev.entityId)}
                      </div>
                      {ev.assignee && ev.assignee !== "—" && (
                        <div style={{ fontSize: 10, color: "rgba(230,237,243,0.35)", marginTop: 1 }}>{ev.assignee}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "#21262d", margin: "0 14px 18px" }}/>

        {/* Staff list */}
        {(() => {
          const map: Record<string, number> = {};
          events.forEach(e => {
            if (e.assignee && e.assignee !== "—") map[e.assignee] = (map[e.assignee] ?? 0) + 1;
          });
          const staff = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
          const max = staff[0]?.[1] ?? 1;
          return (
            <div style={{ padding: "0 18px 18px" }}>
              <p style={{ fontSize: 9, fontWeight: 600, color: "rgba(230,237,243,0.25)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Сотрудники</p>
              {staff.length === 0 ? (
                <p style={{ fontSize: 10, color: "rgba(230,237,243,0.2)" }}>Нет данных</p>
              ) : staff.map(([name, cnt]) => (
                <div key={name} style={{ marginBottom: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "rgba(230,237,243,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{name}</span>
                    <span style={{ fontSize: 10, color: "rgba(230,237,243,0.3)", flexShrink: 0, marginLeft: 4 }}>{cnt}</span>
                  </div>
                  <div style={{ height: 2, borderRadius: 1, background: "#21262d" }}>
                    <div style={{ height: "100%", width: `${(cnt / max) * 100}%`, background: "#1a7f37", borderRadius: 1 }}/>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "#21262d", margin: "0 14px 18px" }}/>

        {/* Legend */}
        <div style={{ padding: "0 18px" }}>
          <p style={{ fontSize: 9, fontWeight: 600, color: "rgba(230,237,243,0.25)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Статус</p>
          {[
            { label: "Подтверждено", color: "#1a7f37" },
            { label: "Ожидание",     color: "#9e6a03"  },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, flexShrink: 0, display: "inline-block" }}/>
              <span style={{ fontSize: 11, color: "rgba(230,237,243,0.5)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }}/>

        {/* Add entity button */}
        <div style={{ padding: "0 14px" }}>
          <button
            onClick={() => setShowAddRow(true)}
            style={{ width: "100%", padding: "7px 12px", borderRadius: 6, backgroundColor: "#21262d", border: "1px solid #30363d", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "rgba(230,237,243,0.55)", fontSize: 11, fontWeight: 500 }}>
            <Plus style={{ width: 10, height: 10 }}/>
            Добавить объект
          </button>
        </div>
      </aside>

      {/* ─────────────── Main area ─────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── Top free zone (future: panels, KPIs, day view) ── */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(230,237,243,0.07)", letterSpacing: "0.06em", textTransform: "uppercase", userSelect: "none" }}>
            Область для будущих панелей
          </span>
        </div>

        {/* ── Grid — full width, pinned to bottom ── */}
        <div style={{ borderTop: "1px solid #21262d" }}/>
      <div ref={gridRef} style={{ overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}>
        <table style={{ tableLayout: "fixed", borderCollapse: "separate", borderSpacing: "4px", backgroundColor: BG, width: "100%" }}>
          <colgroup>
            <col style={{ width: 190, minWidth: 190 }}/>
            {days.map(d => <col key={d.toISOString()}/>)}
          </colgroup>

          <thead className="sticky top-0 z-20" style={{ backgroundColor: BG }}>
            <tr>
              {/* Entity column header */}
              <th className="text-left align-middle pb-2" style={{ background: BG, position: "sticky", left: 0, zIndex: 30, paddingLeft: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(230,237,243,0.3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Объект</span>
              </th>
              {days.map(day => {
                const tod = isToday(day), wknd = isWeekend(day);
                const isWeekStart = day.getDay() === 1;
                const DAY_SHORT = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
                return (
                  <th key={day.toISOString()}
                    ref={tod ? todayThRef : undefined}
                    className="text-center"
                    style={{
                      background: "transparent",
                      paddingBottom: 4,
                      paddingTop: 0,
                      paddingLeft: 0,
                      borderLeft: isWeekStart ? "4px solid #0d1117" : undefined,
                      verticalAlign: "bottom",
                    }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <span style={{
                        fontSize: 7,
                        fontWeight: 500,
                        color: wknd ? "rgba(230,237,243,0.2)" : "rgba(230,237,243,0.28)",
                        lineHeight: 1,
                        letterSpacing: "0.02em",
                      }}>
                        {DAY_SHORT[day.getDay()]}
                      </span>
                      <span
                        className="flex items-center justify-center mx-auto rounded-sm leading-none"
                        style={{
                          fontSize: 9,
                          fontWeight: tod ? 700 : 500,
                          width: 18,
                          height: 18,
                          backgroundColor: tod ? "#238636" : "transparent",
                          color: tod ? "#fff" : wknd ? "rgba(230,237,243,0.22)" : "rgba(230,237,243,0.45)",
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
                    style={{ background: "transparent", borderRadius: 0, padding: "60px 0", textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Нет данных</p>
                      <button data-testid="btn-demo" onClick={loadDemoData}
                        style={{ fontSize: 11, padding: "5px 14px", borderRadius: 6, backgroundColor: "rgba(240,96,96,0.14)", color: "#f06060", border: "none", cursor: "pointer" }}>
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

              {/* ── Add entity row ── */}
              {showAddRow ? (
                <tr>
                  {/* Input only in entity column */}
                  <td style={{ background: BG, borderRadius: 0, padding: "3px 6px", height: "22px", verticalAlign: "middle", position: "sticky", left: 0, zIndex: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input ref={addRowRef} data-testid="input-new-entity"
                        value={newEntityName}
                        onChange={e => setNewEntityName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleAddEntity();
                          if (e.key === "Escape") { setNewEntityName(""); setShowAddRow(false); }
                        }}
                        placeholder="Новый объект..."
                        style={{ flex: 1, minWidth: 0, fontSize: 11, background: "transparent", outline: "none", border: "none", color: "rgba(230,237,243,0.8)" }}/>
                      <button onClick={handleAddEntity} disabled={!newEntityName.trim()}
                        style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, backgroundColor: "#238636", color: "#fff", border: "none", cursor: "pointer", flexShrink: 0, opacity: newEntityName.trim() ? 1 : 0.3 }}>
                        ОК
                      </button>
                      <button onClick={() => { setNewEntityName(""); setShowAddRow(false); }}
                        style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <X style={{ width: 9, height: 9, color: "rgba(230,237,243,0.3)" }}/>
                      </button>
                    </div>
                  </td>
                  {/* Empty tiles for day columns */}
                  {days.map(day => (
                    <td key={format(day, "yyyy-MM-dd")}
                      style={{
                        backgroundColor: isWeekend(day) ? CELL_EMPTY_WE : CELL_EMPTY_WD,
                        borderRadius: "3px",
                        height: "22px",
                        width: "22px",
                      }}/>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
      </div>{/* end gridRef / main scroll area */}
      </div>{/* end main area */}

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

  return (
    <tr>
      {/* Entity name — sticky left column */}
      <td style={{ background: "#0d1117", borderRadius: 0, padding: "0 8px 0 4px", height: "22px", verticalAlign: "middle", position: "sticky", left: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: entity.color, flexShrink: 0, display: "inline-block", opacity: 0.75 }}/>
          {editing ? (
            <input ref={inputRef} value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setEditName(entity.name); setEditing(false); }
              }}
              style={{ flex: 1, fontSize: 12, background: "transparent", outline: "none", borderBottom: "1px solid #238636", color: "rgba(230,237,243,0.9)", minWidth: 0 }}/>
          ) : (
            <span
              onDoubleClick={() => setEditing(true)}
              title={entity.name}
              style={{ fontSize: 12, fontWeight: 400, color: "rgba(230,237,243,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "default", letterSpacing: "0.01em" }}>
              {entity.name}
            </span>
          )}
          {!editing && (
            <div style={{ display: "flex", gap: 1, opacity: 0, transition: "opacity 0.12s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "0"}>
              <button onClick={() => setEditing(true)} title="Переименовать"
                style={{ width: 14, height: 14, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, color: "rgba(230,237,243,0.35)" }}>
                <Pencil style={{ width: 8, height: 8 }}/>
              </button>
              <button onClick={() => onDeleteEntity(entity.id)} title="Удалить"
                style={{ width: 14, height: 14, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, color: "rgba(230,237,243,0.35)" }}>
                <Trash2 style={{ width: 8, height: 8 }}/>
              </button>
            </div>
          )}
        </div>
      </td>

      {/* Day cells — GitHub contribution squares */}
      {days.map(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        const cellEvents = getEventsForCell(entity.id, dateStr);
        const wknd = isWeekend(day);
        const key = `${entity.id}-${dateStr}`;
        const isDragTarget = dragOverKey === key;
        const firstEv = cellEvents[0];
        const emptyColor = wknd ? "#161b22" : "#21262d";
        const STATUS_FILL: Record<string, string> = {
          confirmed: "#1a7f37",
          pending:   "#9e6a03",
        };
        const filledColor = isDragTarget
          ? "rgba(35,134,54,0.35)"
          : firstEv ? STATUS_FILL[firstEv.status] ?? "#21262d" : emptyColor;
        const isWeekStart = day.getDay() === 1;
        return (
          <td key={dateStr}
            style={{
              backgroundColor: filledColor,
              borderRadius: "3px",
              padding: 0,
              height: "22px",
              verticalAlign: "middle",
              opacity: (firstEv?.done && !isDragTarget) ? 0.35 : 1,
              transition: "background-color 0.08s, opacity 0.08s",
              borderLeft: isWeekStart ? "4px solid #0d1117" : undefined,
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
    const hasTime = !!(first.startTime && first.endTime);
    const dur = hasTime ? calcDuration(first.startTime!, first.endTime!) : "";
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
          {/* Small dot to indicate multiple events */}
          <span style={{ position: "absolute", top: 1, right: 1, width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.55)" }}/>
        </div>
        {hoverCard && (
          <EventInfoCard event={first} dur={dur} anchorEl={ref.current}
            onEnter={showCard} onLeave={hideCard} onDoneToggle={onDoneToggle}/>
        )}
      </>
    );
  }

  /* ── Single event — pure color square, details on hover ── */
  const first = events[0];
  const hasTime = !!(first.startTime && first.endTime);
  const dur = hasTime ? calcDuration(first.startTime!, first.endTime!) : "";

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
