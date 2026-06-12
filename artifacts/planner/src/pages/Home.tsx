import { useState, useRef, useEffect, useCallback } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isToday, isWeekend, parseISO,
} from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, X, Check,
  Pencil, Trash2, RotateCcw, Sparkles, Clock,
  Dumbbell, Briefcase, Star, Car, UtensilsCrossed,
  Copy, TrendingUp, CalendarDays,
} from "lucide-react";
import { usePlanner } from "../hooks/use-planner";
import {
  Entity, PlannerEvent, EventStatus, EventIcon,
  STATUS_COLORS, STATUS_GRADIENTS, STATUS_LABELS, STATUS_CYCLE,
  EVENT_ICON_LABELS,
  calcDuration, calcDurationMins, fmtTime, addMinutes,
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

/* ── Inline icon renderer (white, size controlled by parent) ── */
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

/** Convert "HH:MM" to 0–100% within a 6:00–22:00 window for the time strip */
function workPct(t: string): number {
  try {
    const [h, m] = t.split(":").map(Number);
    const min = h * 60 + m;
    return Math.max(0, Math.min(100, ((min - 360) / 960) * 100)); // 360=6h, 960=16h span
  } catch { return 0; }
}

/** Full 24-hour pct for the tooltip timeline */
function timePct(t: string): number {
  try {
    const [h, m] = t.split(":").map(Number);
    return ((h * 60 + m) / 1440) * 100;
  } catch { return 0; }
}

const DAY_ABBR: Record<number, string> = {
  0:"ВС", 1:"ПН", 2:"ВТ", 3:"СР", 4:"ЧТ", 5:"ПТ", 6:"СБ",
};
const MONTH_NAMES = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

/* Module-level drag state — no re-renders needed */
let activeDrag: { eventId: string; srcEntityId: string; srcDate: string } | null = null;
/* Module-level tooltip gate — only ONE tooltip visible at any time */
let tooltipOwnerId: string | null = null;

type CtxMenu = { x: number; y: number; event: PlannerEvent } | null;
type Popup =
  | { mode: "add";  entityId: string; date: string; anchor: DOMRect }
  | { mode: "view"; event: PlannerEvent; anchor: DOMRect }
  | null;

/* ─────────────────────── Home ─────────────────────── */
export default function Home() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const {
    entities, events,
    addEntity, deleteEntity, renameEntity,
    addEvent, updateEvent, deleteEvent, moveEvent,
    getEventsForCell, getEventCountForEntity,
    loadDemoData,
  } = usePlanner(currentMonth);

  const [popup,      setPopup]      = useState<Popup>(null);
  const [ctxMenu,    setCtxMenu]    = useState<CtxMenu>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [newEntityName, setNewEntityName] = useState("");
  const [showAddRow,  setShowAddRow] = useState(false);
  const [dayPanel,    setDayPanel]   = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [ctxDupMode,  setCtxDupMode] = useState(false);
  const [ctxDupDate,  setCtxDupDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));

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

  /* Wheel → horizontal scroll (hide scrollbar, use wheel instead) */
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.deltaX !== 0) return;           // native horizontal gesture — pass through
      if (Math.abs(e.deltaY) > 2) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 1.8;
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  /* global Escape / outside-click */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPopup(null); setCtxMenu(null); }
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
  const dayEarnings   = events.filter(e => e.date === dayPanel).reduce((s, e) => s + (e.earnings ?? 0), 0);

  /* Week grouping — split days into Mon-Sun chunks */
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

        <button data-testid="btn-add-row-header"
          onClick={() => setShowAddRow(true)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 h-7 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0">
          <Plus className="w-3.5 h-3.5"/> Добавить строку
        </button>
      </header>

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
                const label   = `${format(wDays[0], "d")}–${format(wDays[wDays.length - 1], "d MMM", { locale: ru })}`;
                return (
                  <th key={wDays[0].toISOString()} colSpan={wDays.length}
                    className={`bg-card border-b border-border/30 py-0.5 px-1 text-center
                      ${!isFirst ? "border-l-2 border-l-border/50" : ""}`}>
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <span className="text-[8px] text-muted-foreground/50 font-medium">{label}</span>
                      {wEarn > 0 && (
                        <span className="text-[8px] font-bold text-emerald-400">
                          {fmtMoney(wEarn)}
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
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDeleteEntity={deleteEntity}
                onRenameEntity={renameEntity}
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


      {/* ── Status bar ── */}
      <footer className="border-t border-border flex-shrink-0">
        {/* Weekly earnings strip */}
        {totalEarnings > 0 && (
          <div className="flex items-center gap-0 px-5 py-1.5 border-b border-border/40 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mr-3 flex-shrink-0">По неделям</span>
            <div className="flex items-center gap-2 flex-1">
              {weekGroups.map((wDays, i) => {
                const earn = weekEarnings(wDays);
                const label = `${format(wDays[0], "d")}–${format(wDays[wDays.length - 1], "d")}`;
                return (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-background/60 border border-border/30 flex-shrink-0">
                    <span className="text-[9px] text-muted-foreground/50">{label}</span>
                    <span className={`text-[9px] font-bold ${earn > 0 ? "text-emerald-400" : "text-muted-foreground/30"}`}>
                      {earn > 0 ? fmtMoney(earn) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 ml-3 flex-shrink-0">
              <TrendingUp className="w-3 h-3 text-emerald-400"/>
              <span className="text-[10px] font-bold text-emerald-400">{fmtMoney(totalEarnings)}</span>
              <span className="text-[9px] text-emerald-400/60">за месяц</span>
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
          <span className="text-[10px] text-muted-foreground/40 ml-2 hidden lg:block">Shift+клик = статус · ПКМ = меню · Перетащи = перенести</span>
        </div>
      </footer>

      {/* ── Popup ── */}
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
            {/* Duplicate section */}
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
  onDragStart: (evId: string, srcEId: string, srcDate: string) => void;
  onDragEnd: () => void;
  onDragOver: (key: string, e: React.DragEvent) => void;
  onDrop: (tgtEId: string, tgtDate: string) => void;
  onDeleteEntity: (id: string) => void;
  onRenameEntity: (id: string, name: string) => void;
}

function EntityRow({
  entity, days, eventCount, dragOverKey,
  getEventsForCell, onCellClick, onEventClick, onContextMenu, onShiftClick,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onDeleteEntity, onRenameEntity,
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
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
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
  date, entities, getEventsForCell, onDayReset,
}: {
  date: string;
  entities: Entity[];
  getEventsForCell: (entityId: string, date: string) => PlannerEvent[];
  onDayReset: () => void;
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

  /* total busy minutes per entity */
  function busyMins(entity: Entity) {
    return getEventsForCell(entity.id, date)
      .filter(ev => ev.startTime && ev.endTime)
      .reduce((acc, ev) => {
        const [sh, sm] = ev.startTime!.split(":").map(Number);
        const [eh, em] = ev.endTime!.split(":").map(Number);
        return acc + (eh * 60 + em) - (sh * 60 + sm);
      }, 0);
  }

  const LABEL_W = 148; // px for entity name column

  return (
    <div className="border-t border-border bg-card flex-shrink-0 px-4 pt-2 pb-1.5 select-none">
      {/* ── Header row: label + 24-h axis ── */}
      <div className="flex items-center mb-1" style={{ gap: 0 }}>
        {/* Date label + today button */}
        <div className="flex items-center gap-2 flex-shrink-0" style={{ width: LABEL_W }}>
          <button
            onClick={onDayReset}
            className={`text-[10px] font-semibold uppercase tracking-wider transition-colors
              ${isToday ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
            title="Вернуться к сегодня">
            {dateLabel}
          </button>
        </div>

        {/* Hour markers — staggered: even on top row, odd on bottom row → all 24 fit */}
        <div className="flex-1 relative h-6">
          {Array.from({ length: 25 }, (_, h) => {
            const isEven = h % 2 === 0;
            const isMajor = h % 6 === 0;
            const isMid   = h % 2 === 0 && !isMajor;
            return (
              <div key={h} className="absolute flex flex-col items-center -translate-x-1/2"
                style={{ left: `${(h / 24) * 100}%`, top: 0 }}>
                {/* Number: even on row 0, odd on row 1 */}
                <span
                  className={`font-mono leading-none ${isMajor ? "text-muted-foreground/70" : "text-muted-foreground/45"}`}
                  style={{ fontSize: 7, marginTop: isEven ? 0 : 8 }}>
                  {h < 24 ? h : 24}
                </span>
                {/* Tick below number */}
                <div className={`w-px mt-0.5 ${isMajor ? "h-2 bg-border/55" : isMid ? "h-1.5 bg-border/35" : "h-1 bg-border/20"}`}/>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Entity rows ── */}
      {entities.map(entity => {
        const evs  = getEventsForCell(entity.id, date);
        const timedEvs   = evs.filter(ev => ev.startTime && ev.endTime);
        const untimedEvs = evs.filter(ev => !ev.startTime);
        const busy = busyMins(entity);
        const busyLabel = busy > 0
          ? `${Math.floor(busy / 60)}ч${busy % 60 > 0 ? ` ${busy % 60}м` : ""}`
          : null;

        return (
          <div key={entity.id} className="flex items-center mb-1" style={{ gap: 0 }}>
            {/* Entity name */}
            <div className="flex items-center gap-1.5 flex-shrink-0 pr-2" style={{ width: LABEL_W }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: entity.color }}/>
              <span className="text-[10px] text-muted-foreground truncate leading-none">{entity.name}</span>
              {busyLabel && (
                <span className="text-[9px] font-semibold ml-auto flex-shrink-0"
                  style={{ color: entity.color }}>{busyLabel}</span>
              )}
              {untimedEvs.length > 0 && (
                <span className="text-[8px] text-muted-foreground/50 flex-shrink-0">+{untimedEvs.length}</span>
              )}
            </div>

            {/* Timeline track */}
            <div className="flex-1 relative h-5 rounded overflow-hidden"
              style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>

              {/* Hour grid lines — every hour */}
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

              {/* Event blocks */}
              {timedEvs.map(ev => {
                const l = pct(ev.startTime!);
                const w = Math.max(pct(ev.endTime!) - l, 0.4);
                const color = STATUS_COLORS[ev.status];
                const dur   = calcDuration(ev.startTime!, ev.endTime!);
                return (
                  <div key={ev.id}
                    className="absolute top-0.5 bottom-0.5 rounded-sm group/bar cursor-default overflow-hidden"
                    style={{ left: `${l}%`, width: `${w}%`, backgroundColor: color }}
                    title={`${ev.title} · ${ev.startTime}–${ev.endTime} (${dur})`}>
                    {/* Icon inside bar (only when wide enough) */}
                    {ev.icon && ev.icon !== "none" && w > 2 && (
                      <span className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-90">
                        <EventIconBadge icon={ev.icon} size={11}/>
                      </span>
                    )}
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/bar:flex
                      flex-col items-center pointer-events-none z-50 whitespace-nowrap">
                      <div className="bg-popover border border-border rounded-lg px-2.5 py-1.5 shadow-xl">
                        <div className="flex items-center gap-1.5">
                          {ev.icon && ev.icon !== "none" && <EventIconBadge icon={ev.icon} size={11}/>}
                          <p className="text-[10px] font-semibold text-foreground leading-tight">{ev.title}</p>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5">{ev.startTime} – {ev.endTime} · {dur}</p>
                      </div>
                      <div className="w-1.5 h-1.5 bg-popover border-r border-b border-border rotate-45 -mt-1"/>
                    </div>
                  </div>
                );
              })}

              {/* Current-time red needle */}
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
  );
}

/* ─────────────────────── DayTimelinePanel ─────────────────────── */
const HOUR_H = 52; // px per hour → 24 * 52 = 1248px total

function DayTimelinePanel({
  date, entities, getEventsForCell, onClose,
}: {
  date: string;
  entities: Entity[];
  getEventsForCell: (entityId: string, date: string) => PlannerEvent[];
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const dateLabel = (() => {
    try { return format(parseISO(date), "EEEE, d MMMM yyyy", { locale: ru }); } catch { return date; }
  })();

  /* auto-scroll to 7 am on open */
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H - 20;
  }, [date]);

  /* current-time line */
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const isToday = date === todayStr;
  const nowY = isToday ? (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_H : null;

  function timeToY(t: string) {
    const [h, m] = t.split(":").map(Number);
    return (h * 60 + m) / 60 * HOUR_H;
  }
  function durY(s: string, e: string) {
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    return Math.max(((eh * 60 + em) - (sh * 60 + sm)) / 60 * HOUR_H, 14);
  }

  /* busy minutes per entity */
  function busyMins(entity: Entity) {
    return getEventsForCell(entity.id, date)
      .filter(ev => ev.startTime && ev.endTime)
      .reduce((acc, ev) => {
        const [sh, sm] = ev.startTime!.split(":").map(Number);
        const [eh, em] = ev.endTime!.split(":").map(Number);
        return acc + (eh * 60 + em) - (sh * 60 + sm);
      }, 0);
  }

  const hours = Array.from({ length: 25 }, (_, i) => i);
  const hasAnyTimedEvent = entities.some(e =>
    getEventsForCell(e.id, date).some(ev => ev.startTime && ev.endTime)
  );

  return (
    <div className="fixed inset-y-0 right-0 flex flex-col bg-card border-l border-border shadow-2xl z-40"
      style={{ width: Math.min(460, 56 + entities.length * 80) }}>

      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-3 pb-2.5 border-b border-border flex-shrink-0">
        <div>
          <p className="text-sm font-semibold capitalize leading-tight">{dateLabel}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {hasAnyTimedEvent
              ? `Кликните событие для деталей · ${entities.filter(e => busyMins(e) > 0).length} объект(ов) заняты`
              : "Нет событий с временем — добавьте время в событие"
            }
          </p>
        </div>
        <button onClick={onClose}
          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0 ml-2">
          <X className="w-3.5 h-3.5"/>
        </button>
      </div>

      {/* Entity column headers */}
      <div className="flex flex-shrink-0 border-b border-border" style={{ paddingLeft: 56 }}>
        {entities.map(entity => {
          const busy = busyMins(entity);
          const freeH = 24 - busy / 60;
          return (
            <div key={entity.id} className="flex-1 px-1.5 py-2 border-r border-border/40 last:border-r-0 min-w-0">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entity.color }}/>
                <span className="text-[9px] font-semibold text-foreground truncate">{entity.name}</span>
              </div>
              {busy > 0 ? (
                <p className="text-[8px] text-muted-foreground leading-tight">
                  <span className="text-foreground font-medium">{Math.floor(busy/60)}ч{busy%60>0?` ${busy%60}м`:""}</span>
                  {" "}занято · {Math.floor(freeH)}ч свободно
                </p>
              ) : (
                <p className="text-[8px] text-muted-foreground/50">Свободен</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex" style={{ height: 24 * HOUR_H }}>

          {/* Hour labels column */}
          <div className="flex-shrink-0 relative" style={{ width: 56 }}>
            {hours.map(h => (
              <div key={h} className="absolute left-0 right-0 flex items-start justify-end pr-2"
                style={{ top: h * HOUR_H, height: HOUR_H }}>
                <span className="text-[9px] text-muted-foreground/50 font-mono leading-none pt-0.5">
                  {h < 24 ? `${String(h).padStart(2,"0")}:00` : ""}
                </span>
              </div>
            ))}
            {/* Current time label */}
            {nowY !== null && (
              <div className="absolute right-1 flex items-center" style={{ top: nowY - 6 }}>
                <span className="text-[8px] text-red-400 font-mono font-bold">
                  {String(now.getHours()).padStart(2,"0")}:{String(now.getMinutes()).padStart(2,"0")}
                </span>
              </div>
            )}
          </div>

          {/* Entity lanes */}
          {entities.map(entity => {
            const evs = getEventsForCell(entity.id, date);
            const timedEvs  = evs.filter(ev => ev.startTime && ev.endTime);
            const untimedEvs = evs.filter(ev => !ev.startTime);

            return (
              <div key={entity.id} className="flex-1 relative border-r border-border/30 last:border-r-0 min-w-0">
                {/* Hour grid lines */}
                {hours.map(h => (
                  <div key={h} className="absolute left-0 right-0 border-t pointer-events-none"
                    style={{ top: h * HOUR_H, borderColor: h % 6 === 0 ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)" }}/>
                ))}
                {/* Half-hour lines */}
                {hours.slice(0, 24).map(h => (
                  <div key={`h${h}`} className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
                    style={{ top: h * HOUR_H + HOUR_H / 2, borderColor: "rgba(255,255,255,0.03)" }}/>
                ))}

                {/* Current time indicator */}
                {nowY !== null && (
                  <div className="absolute left-0 right-0 h-px bg-red-400/70 z-20 pointer-events-none"
                    style={{ top: nowY }}/>
                )}

                {/* Free time highlight (subtle) */}
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.01) 100%)" }}/>

                {/* Timed event blocks */}
                {timedEvs.map(ev => {
                  const top    = timeToY(ev.startTime!);
                  const height = durY(ev.startTime!, ev.endTime!);
                  const color  = STATUS_COLORS[ev.status];
                  const dur    = calcDuration(ev.startTime!, ev.endTime!);
                  return (
                    <div key={ev.id}
                      className="absolute left-1 right-1 rounded-md overflow-hidden cursor-pointer group/block
                        hover:brightness-110 hover:z-10 transition-all"
                      style={{ top: top + 1, height: height - 2, backgroundColor: color, zIndex: 5 }}>
                      <div className="h-full flex flex-col px-1.5 py-1 overflow-hidden">
                        <p className="text-[9px] font-bold text-white leading-tight truncate flex-shrink-0">
                          {ev.title}
                        </p>
                        {height >= 30 && (
                          <p className="text-[8px] text-white/80 leading-none mt-0.5 flex-shrink-0">
                            {ev.startTime} – {ev.endTime}
                          </p>
                        )}
                        {height >= 44 && (
                          <p className="text-[8px] text-white/60 leading-none mt-0.5 flex-shrink-0">{dur}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Untimed events — top strip */}
                {untimedEvs.length > 0 && (
                  <div className="absolute top-1 left-1 right-1 flex flex-col gap-0.5 z-10">
                    {untimedEvs.map(ev => (
                      <div key={ev.id} className="rounded px-1 py-0.5 opacity-70"
                        style={{ backgroundColor: STATUS_COLORS[ev.status] }}>
                        <p className="text-[8px] text-white font-medium leading-none truncate">{ev.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
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
  onDragStart: (evId: string, srcEId: string, srcDate: string) => void;
  onDragEnd: () => void;
}

/** Duration in minutes → span factor (0..1) within an 8-hour workday */
function durSpan(start: string, end: string): number {
  const mins = calcDurationMins(start, end);
  return Math.min(1, Math.max(0.12, mins / 480)); // 480 = 8h workday
}

function GridCell({
  events, entityId, date,
  onAddClick, onEventClick, onContextMenu, onShiftClick,
  onDragStart, onDragEnd,
}: GridCellProps) {
  const ref      = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipId    = `${entityId}__${date}`;

  const showTip = () => {
    tooltipOwnerId = tipId;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHovering(true);
  };
  const hideTip = () => {
    hideTimer.current = setTimeout(() => setHovering(false), 60);
  };

  /* ── Empty cell ── */
  if (events.length === 0) {
    return (
      <div ref={ref} data-testid={`cell-empty-${entityId}-${date}`}
        onClick={() => ref.current && onAddClick(entityId, date, ref.current.getBoundingClientRect())}
        className="group/c w-full h-full min-h-[48px] flex items-center justify-center cursor-pointer rounded-md transition-all border border-transparent hover:border-white/[0.08] hover:bg-white/[0.04]">
        <Plus className="w-3 h-3 text-transparent group-hover/c:text-muted-foreground/30 transition-colors"/>
      </div>
    );
  }

  const first   = events[0];
  const hasTime = !!(first.startTime && first.endTime);
  const dur     = hasTime ? calcDuration(first.startTime!, first.endTime!) : "";
  const color   = STATUS_COLORS[first.status];
  const gradient = STATUS_GRADIENTS[first.status];
  const earn    = first.earnings ?? 0;

  /* Duration-based fill: how much of the cell this event visually "fills" */
  const span   = hasTime ? durSpan(first.startTime!, first.endTime!) : 0.4;
  /* Start position (0–22h mapped to 0–100%) */
  const startFrac = hasTime ? Math.max(0, Math.min(1, (calcDurationMins("06:00", first.startTime!) / 960))) : 0;

  return (
    <>
      <div ref={ref}
        data-testid={`cell-event-${entityId}-${date}`}
        data-event-id={first.id}
        draggable
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(first.id, entityId, date); setHovering(false); }}
        onDragEnd={onDragEnd}
        onClick={e => {
          if (e.shiftKey) { onShiftClick(first); return; }
          ref.current && onEventClick(first, ref.current.getBoundingClientRect());
        }}
        onContextMenu={e => onContextMenu(e.nativeEvent, first)}
        className="relative w-full min-h-[48px] cursor-grab active:cursor-grabbing group/ev rounded-md overflow-hidden
          transition-all hover:brightness-110 hover:scale-[1.02] hover:shadow-lg select-none"
        style={{ background: gradient }}>

        {/* Multi-event badge */}
        {events.length > 1 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/30 text-[8px] font-bold
            flex items-center justify-center text-white z-10">
            {events.length}
          </span>
        )}

        {/* Icon */}
        {first.icon && first.icon !== "none" && (
          <span className="absolute top-1.5 left-1.5 opacity-80">
            <EventIconBadge icon={first.icon} size={10}/>
          </span>
        )}

        {/* Content */}
        <div className="px-1.5 pt-1.5 pb-1 flex flex-col justify-between h-full min-h-[48px]">
          <p className="text-white text-[9px] font-semibold leading-tight line-clamp-2 drop-shadow-sm">
            {first.title}
          </p>

          <div className="mt-auto">
            {hasTime && (
              <p className="text-white/75 text-[8px] font-mono leading-none mb-1">
                {fmtTime(first.startTime!)}–{fmtTime(first.endTime!)}
              </p>
            )}
            {/* Duration bar */}
            <div className="w-full h-[3px] rounded-full bg-black/20 overflow-hidden">
              <div className="h-full rounded-full bg-white/50 transition-all"
                style={{ width: `${span * 100}%`, marginLeft: `${startFrac * (1 - span) * 100}%` }}/>
            </div>
            {/* Earnings or duration */}
            {earn > 0 ? (
              <p className="text-white/80 text-[8px] font-bold leading-none mt-1 tabular-nums">
                {earn >= 1000 ? `${Math.round(earn / 100) / 10}к ₽` : `${earn} ₽`}
              </p>
            ) : dur ? (
              <p className="text-white/60 text-[8px] leading-none mt-1">{dur}</p>
            ) : null}
          </div>
        </div>

        {/* Shift-click hint overlay */}
        <div className="absolute inset-0 opacity-0 group-hover/ev:opacity-100 bg-black/10 transition-opacity pointer-events-none rounded-md"/>
      </div>

      {hovering && tooltipOwnerId === tipId && (
        <TimeTooltip event={first} dur={dur} anchorEl={ref.current} onEnter={showTip} onLeave={hideTip}/>
      )}
    </>
  );
}

/* ─────────────────────── TimeTooltip ─────────────────────── */
interface TimeTooltipProps {
  event: PlannerEvent;
  dur: string;
  anchorEl: HTMLElement | null;
  onEnter: () => void;
  onLeave: () => void;
}

function TimeTooltip({ event, dur, anchorEl, onEnter, onLeave }: TimeTooltipProps) {
  const hasTime = !!(event.startTime && event.endTime);
  const color   = STATUS_COLORS[event.status];

  const style = (() => {
    if (!anchorEl) return { display: "none" } as React.CSSProperties;
    const r   = anchorEl.getBoundingClientRect();
    const W   = 256, H = hasTime ? 116 : 72;
    const vw  = window.innerWidth, vh = window.innerHeight;
    let left  = r.left + r.width / 2 - W / 2;
    let top   = r.bottom + 6;
    if (left + W > vw - 8) left = vw - W - 8;
    if (left < 8)          left = 8;
    if (top  + H > vh - 8) top  = r.top - H - 6;
    return { position: "fixed" as const, left, top, width: W, zIndex: 9999 };
  })();

  const startP = hasTime ? timePct(event.startTime!) : 0;
  const endP   = hasTime ? timePct(event.endTime!)   : 0;

  return (
    <div style={style}
      className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}>
      {/* Status stripe */}
      <div className="h-0.5" style={{ backgroundColor: color }}/>

      <div className="p-3">
        {/* Title row */}
        <div className="flex items-start gap-2 mb-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: color }}/>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground leading-tight truncate">{event.title}</p>
            <p className="text-[10px] text-muted-foreground">{event.assignee} · {STATUS_LABELS[event.status]}</p>
          </div>
        </div>

        {hasTime && (
          <>
            {/* 24-hour timeline */}
            <div className="mb-1">
              <div className="relative h-4 bg-accent/40 rounded overflow-hidden">
                {/* hour ticks */}
                {[6, 12, 18].map(h => (
                  <div key={h} className="absolute top-0 bottom-0 w-px bg-border/60"
                    style={{ left: `${(h / 24) * 100}%` }}/>
                ))}
                {/* event block */}
                <div className="absolute top-0.5 bottom-0.5 rounded"
                  style={{ left: `${startP}%`, width: `${Math.max(endP - startP, 1.5)}%`, backgroundColor: color, opacity: 0.9 }}/>
              </div>
              {/* tick labels */}
              <div className="flex justify-between text-[8px] text-muted-foreground/60 mt-0.5 px-0.5">
                <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>
              </div>
            </div>

            {/* Time + duration row */}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <span className="text-[11px] font-semibold text-foreground">
                {event.startTime}
                <span className="text-muted-foreground mx-1">→</span>
                {event.endTime}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${color}25`, color }}>
                <Clock className="w-2.5 h-2.5"/>{dur}
              </span>
            </div>
          </>
        )}

        {!hasTime && (
          <p className="text-[10px] text-muted-foreground/60 italic">Время не указано</p>
        )}
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

function TimeSpinner({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
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
        {/* Hours */}
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
        {/* Minutes */}
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

interface TimePickerProps {
  startTime: string;
  endTime: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}

function TimePicker({ startTime, endTime, onStartChange, onEndChange }: TimePickerProps) {
  const dur     = startTime && endTime ? calcDuration(startTime, endTime) : "";
  const durMins = startTime && endTime ? calcDurationMins(startTime, endTime) : 0;
  const span    = durMins > 0 ? Math.min(1, durMins / 480) : 0;

  return (
    <div className="space-y-2.5">
      {/* Spinners row */}
      <div className="flex items-start gap-2">
        <TimeSpinner value={startTime} onChange={onStartChange} label="Начало"/>
        <div className="flex flex-col items-center pt-7 flex-shrink-0">
          <div className="w-4 h-px bg-border/60"/>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 mt-0.5"/>
        </div>
        <TimeSpinner value={endTime} onChange={onEndChange} label="Конец"/>
      </div>

      {/* Quick duration presets */}
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

      {/* Visual bar preview */}
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
interface AddEventPopupProps {
  entityId: string;
  date: string;
  onClose: () => void;
  onAdd: (ev: PlannerEvent) => void;
}

function AddEventPopup({ entityId, date, onClose, onAdd }: AddEventPopupProps) {
  const [title,     setTitle]     = useState("");
  const [assignee,  setAssignee]  = useState("");
  const [status,    setStatus]    = useState<EventStatus>("pending");
  const [notes,     setNotes]     = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime,   setEndTime]   = useState("10:00");
  const [useTime,   setUseTime]   = useState(false);
  const [icon,      setIcon]      = useState<EventIcon>("none");
  const [earnings,  setEarnings]  = useState<string>("");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  const dateLabel = (() => {
    try { return format(parseISO(date), "d MMMM yyyy", { locale: ru }); } catch { return date; }
  })();

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      id: genId(), entityId, date, status,
      title: title.trim(),
      assignee: assignee.trim() || "—",
      notes: notes.trim() || undefined,
      startTime: useTime ? startTime : undefined,
      endTime:   useTime ? endTime   : undefined,
      icon:     icon !== "none" ? icon : undefined,
      earnings: earnings ? parseFloat(earnings) : undefined,
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

          {/* Time toggle */}
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
              <div className="mt-2">
                <TimePicker
                  startTime={startTime}
                  endTime={endTime}
                  onStartChange={setStartTime}
                  onEndChange={setEndTime}
                />
              </div>
            )}
          </div>

          {/* Status */}
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

          {/* Earnings */}
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-400 text-xs font-bold">₽</span>
            <input
              type="number" min="0" step="100"
              value={earnings} onChange={e => setEarnings(e.target.value)}
              placeholder="Заработок за смену"
              className="w-full text-xs bg-accent/40 border border-border rounded-lg pl-6 pr-3 py-1.5 outline-none focus:border-emerald-500/60 text-foreground placeholder:text-muted-foreground transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
          </div>
        </div>

        <button data-testid="btn-save-event" onClick={submit} disabled={!title.trim()}
          className="w-full mt-3 text-xs font-semibold py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Добавить событие
        </button>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">Enter — сохранить · Esc — закрыть</p>
      </div>
    </div>
  );
}

/* ─────────────────────── ViewPopup ─────────────────────── */
interface ViewPopupProps {
  event: PlannerEvent;
  onClose: () => void;
  onStatusChange: (s: EventStatus) => void;
  onDelete: () => void;
  onSave: (upd: PlannerEvent) => void;
}

function ViewPopup({ event, onClose, onStatusChange, onDelete, onSave, onDuplicate }: ViewPopupProps & { onDuplicate: (date: string) => void }) {
  const [editTitle,    setEditTitle]    = useState(event.title);
  const [editAssignee, setEditAssignee] = useState(event.assignee);
  const [editNotes,    setEditNotes]    = useState(event.notes ?? "");
  const [startTime,    setStartTime]    = useState(event.startTime ?? "");
  const [endTime,      setEndTime]      = useState(event.endTime ?? "");
  const [editIcon,     setEditIcon]     = useState<EventIcon>(event.icon ?? "none");
  const [editEarnings, setEditEarnings] = useState<string>(event.earnings != null ? String(event.earnings) : "");
  const [dupMode,      setDupMode]      = useState(false);
  const [dupDate,      setDupDate]      = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dirty, setDirty] = useState(false);

  const dateLabel = (() => {
    try { return format(parseISO(event.date), "d MMMM yyyy", { locale: ru }); } catch { return event.date; }
  })();

  const initials = event.assignee.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase() || "?";
  const dur = startTime && endTime ? calcDuration(startTime, endTime) : "";

  const mark = () => setDirty(true);

  const save = () => {
    if (!editTitle.trim()) return;
    onSave({
      ...event,
      title:     editTitle.trim(),
      assignee:  editAssignee.trim() || "—",
      notes:     editNotes.trim() || undefined,
      startTime: startTime || undefined,
      endTime:   endTime   || undefined,
      icon:      editIcon !== "none" ? editIcon : undefined,
      earnings:  editEarnings ? parseFloat(editEarnings) : undefined,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="h-0.5" style={{ backgroundColor: STATUS_COLORS[event.status] }}/>
      <div className="p-4">
        {/* Header */}
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

        {/* Editable fields */}
        <div className="space-y-2 mb-3">
          <input value={editTitle} onChange={e => { setEditTitle(e.target.value); mark(); }}
            className="w-full text-sm font-medium bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground transition-colors"/>
          <input value={editAssignee} onChange={e => { setEditAssignee(e.target.value); mark(); }}
            placeholder="Ответственный"
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"/>

          {/* Time picker */}
          <TimePicker
            startTime={startTime}
            endTime={endTime}
            onStartChange={v => { setStartTime(v); mark(); }}
            onEndChange={v => { setEndTime(v); mark(); }}
          />

          <textarea value={editNotes} onChange={e => { setEditNotes(e.target.value); mark(); }}
            placeholder="Заметки..."
            rows={2}
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors resize-none"/>

          <IconPicker value={editIcon} onChange={v => { setEditIcon(v); mark(); }}/>

          {/* Earnings */}
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-400 text-xs font-bold">₽</span>
            <input
              type="number" min="0" step="100"
              value={editEarnings} onChange={e => { setEditEarnings(e.target.value); mark(); }}
              placeholder="Заработок за смену"
              className="w-full text-xs bg-accent/40 border border-border rounded-lg pl-6 pr-3 py-1.5 outline-none focus:border-emerald-500/60 text-foreground placeholder:text-muted-foreground transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
          </div>
        </div>

        {/* Quick status */}
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

        {/* Actions */}
        <div className="flex items-center gap-2">
          {dirty ? (
            <button onClick={save}
              className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1">
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

        {/* Duplicate */}
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
