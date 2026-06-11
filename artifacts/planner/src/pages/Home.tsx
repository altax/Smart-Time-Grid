import { useState, useRef, useEffect, useCallback } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isToday, isWeekend, parseISO,
} from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, X, Check,
  Pencil, Trash2, RotateCcw, Sparkles,
} from "lucide-react";
import { usePlanner } from "../hooks/use-planner";
import {
  Entity, PlannerEvent, EventStatus,
  STATUS_COLORS, STATUS_LABELS, STATUS_CYCLE,
} from "../types";

function generateId() {
  return Math.random().toString(36).substring(2, 12);
}

const DAY_ABBR: Record<number, string> = {
  0: "ВС", 1: "ПН", 2: "ВТ", 3: "СР", 4: "ЧТ", 5: "ПТ", 6: "СБ",
};
const MONTH_NAMES = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

/* ─────────────────────────────── types ─────────────────────────────── */
type ContextMenu = {
  x: number; y: number;
  event: PlannerEvent;
} | null;

type Popup =
  | { mode: "add"; entityId: string; date: string; anchor: DOMRect }
  | { mode: "view"; event: PlannerEvent; anchor: DOMRect }
  | null;

/* ─────────────────────────────── main ─────────────────────────────── */
export default function Home() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const {
    entities, events,
    addEntity, deleteEntity, renameEntity,
    addEvent, updateEvent, deleteEvent,
    getEventsForCell, getEventCountForEntity,
    loadDemoData,
  } = usePlanner(currentMonth);

  const [popup, setPopup] = useState<Popup>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu>(null);
  const [newEntityName, setNewEntityName] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);
  const addRowRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const todayColRef = useRef<HTMLTableCellElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  /* scroll to today column on mount / month change */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (todayColRef.current && gridRef.current) {
        const grid = gridRef.current;
        const th = todayColRef.current;
        const targetScroll = th.offsetLeft - grid.clientWidth / 2 + th.offsetWidth / 2;
        grid.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [currentMonth]);

  /* close popup / context menu on outside click or Escape */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPopup(null); setCtxMenu(null); }
    };
    const onMouse = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null);
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onMouse); };
  }, []);

  /* focus add-row input when it appears */
  useEffect(() => { if (showAddRow) addRowRef.current?.focus(); }, [showAddRow]);

  const handleAddEntity = () => {
    const name = newEntityName.trim();
    if (!name) return;
    addEntity(name);
    setNewEntityName("");
    setShowAddRow(false);
  };

  const openAddPopup = useCallback((entityId: string, date: string, rect: DOMRect) => {
    setCtxMenu(null);
    setPopup({ mode: "add", entityId, date, anchor: rect });
  }, []);

  const openViewPopup = useCallback((event: PlannerEvent, rect: DOMRect) => {
    setCtxMenu(null);
    setPopup({ mode: "view", event, anchor: rect });
  }, []);

  const openContextMenu = useCallback((e: MouseEvent, event: PlannerEvent) => {
    e.preventDefault();
    setPopup(null);
    setCtxMenu({ x: e.clientX, y: e.clientY, event });
  }, []);

  /* stats */
  const now = new Date();
  const totalEvents = events.length;
  const overdueEvents = events.filter(ev => ev.status === "overdue").length;
  const confirmedEvents = events.filter(ev => ev.status === "confirmed").length;
  const pendingEvents = events.filter(ev => ev.status === "pending").length;

  /* popup position — smart: flip if near edge */
  function calcPopupStyle(anchor: DOMRect, w = 300, h = 320): React.CSSProperties {
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = anchor.left + anchor.width / 2 - w / 2;
    let top = anchor.bottom + 8;
    if (left + w > vw - 8) left = vw - w - 8;
    if (left < 8) left = 8;
    if (top + h > vh - 8) top = anchor.top - h - 8;
    return { position: "fixed", left, top, width: w, zIndex: 50 };
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      {/* ── Top header ── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0 gap-4">
        {/* Left: logo + title */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5 text-primary">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">Планировщик</span>
        </div>

        {/* Center: month nav */}
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

        {/* Right: add row button */}
        <button data-testid="btn-add-row-header"
          onClick={() => setShowAddRow(true)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 h-7 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0">
          <Plus className="w-3.5 h-3.5"/> Добавить строку
        </button>
      </header>

      {/* ── Grid ── */}
      <div ref={gridRef} className="flex-1 overflow-auto scrollbar-thin">
        <table className="border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 210, minWidth: 210 }}/>
            {days.map(d => (
              <col key={d.toISOString()} style={{ width: 34, minWidth: 34 }}/>
            ))}
            {/* summary col */}
            <col style={{ width: 44, minWidth: 44 }}/>
          </colgroup>

          {/* ── Header ── */}
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="bg-card border-b border-r border-border px-3 py-2 text-left align-bottom">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Объект</span>
              </th>
              {days.map(day => {
                const todayDay = isToday(day);
                const weekend = isWeekend(day);
                return (
                  <th
                    key={day.toISOString()}
                    ref={todayDay ? todayColRef : undefined}
                    className={`border-b border-border py-1.5 text-center align-bottom
                      ${weekend ? "bg-background" : "bg-card"}
                      ${todayDay ? "bg-primary/10" : ""}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full
                        ${todayDay ? "bg-primary text-primary-foreground" : weekend ? "text-muted-foreground/70" : "text-foreground"}`}>
                        {format(day, "d")}
                      </span>
                      <span className={`text-[8px] font-medium ${weekend ? "text-muted-foreground/50" : "text-muted-foreground/70"}`}>
                        {DAY_ABBR[day.getDay()]}
                      </span>
                    </div>
                  </th>
                );
              })}
              <th className="bg-card border-b border-l border-border py-1 text-center">
                <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">∑</span>
              </th>
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {/* Empty state */}
            {entities.length === 0 && (
              <tr>
                <td colSpan={days.length + 2} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary"/>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">Нет данных</p>
                      <p className="text-xs text-muted-foreground">Добавьте строку или загрузите демо</p>
                    </div>
                    <button
                      data-testid="btn-demo"
                      onClick={loadDemoData}
                      className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
                      <Sparkles className="w-3.5 h-3.5"/> Загрузить демо-данные
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {/* Entity rows */}
            {entities.map((entity) => (
              <EntityRow
                key={entity.id}
                entity={entity}
                days={days}
                eventCount={getEventCountForEntity(entity.id)}
                getEventsForCell={getEventsForCell}
                onCellClick={openAddPopup}
                onEventClick={openViewPopup}
                onContextMenu={openContextMenu}
                onDeleteEntity={deleteEntity}
                onRenameEntity={renameEntity}
                onShiftClick={(ev) => {
                  const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(ev.status) + 1) % STATUS_CYCLE.length];
                  updateEvent({ ...ev, status: next });
                }}
              />
            ))}

            {/* Add row inline */}
            {showAddRow && (
              <tr>
                <td colSpan={days.length + 2} className="px-3 py-2 border-t border-border/40">
                  <div className="flex items-center gap-2 max-w-xs">
                    <input
                      ref={addRowRef}
                      data-testid="input-new-entity"
                      value={newEntityName}
                      onChange={e => setNewEntityName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleAddEntity();
                        if (e.key === "Escape") { setNewEntityName(""); setShowAddRow(false); }
                      }}
                      placeholder="Название строки..."
                      className="text-sm bg-transparent border-b border-primary outline-none flex-1 py-0.5 text-foreground placeholder:text-muted-foreground"
                    />
                    <button onClick={handleAddEntity} className="text-xs text-primary hover:underline font-medium">Добавить</button>
                    <button onClick={() => { setNewEntityName(""); setShowAddRow(false); }} className="text-xs text-muted-foreground hover:text-foreground">Отмена</button>
                  </div>
                </td>
              </tr>
            )}

            {/* Footer add row link (only when rows exist) */}
            {entities.length > 0 && !showAddRow && (
              <tr>
                <td colSpan={days.length + 2} className="border-t border-border/20 px-3 py-1.5">
                  <button
                    data-testid="btn-add-row-footer"
                    onClick={() => setShowAddRow(true)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors">
                    <Plus className="w-3 h-3"/> Добавить строку
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Status bar ── */}
      <footer className="flex items-center gap-5 px-5 py-2.5 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
        <div className="flex items-center gap-5">
          {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS[s] }}/>
              <span>{STATUS_LABELS[s]}</span>
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-5">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.overdue }}/> {overdueEvents}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.confirmed }}/> {confirmedEvents}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.pending }}/> {pendingEvents}
          </span>
          <span className="border-l border-border pl-5">
            Всего: <strong className="text-foreground">{totalEvents}</strong>
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/50 ml-2">Shift+клик = сменить статус · ПКМ = меню</span>
      </footer>

      {/* ── Popup ── */}
      {popup && (
        <div ref={popupRef} style={calcPopupStyle(popup.anchor)}>
          {popup.mode === "add" && (
            <AddEventPopup
              entityId={popup.entityId}
              date={popup.date}
              onClose={() => setPopup(null)}
              onAdd={(ev) => { addEvent(ev); setPopup(null); }}
            />
          )}
          {popup.mode === "view" && (
            <ViewPopup
              event={popup.event}
              onClose={() => setPopup(null)}
              onStatusChange={(status) => { updateEvent({ ...popup.event, status }); setPopup(null); }}
              onDelete={() => { deleteEvent(popup.event.id); setPopup(null); }}
              onSave={(updated) => { updateEvent(updated); setPopup(null); }}
            />
          )}
        </div>
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 60 }}
          className="w-48 rounded-lg border border-border bg-popover shadow-2xl overflow-hidden py-1"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-border mb-1">
            <p className="text-[11px] font-semibold text-foreground truncate">{ctxMenu.event.title}</p>
            <p className="text-[10px] text-muted-foreground">{ctxMenu.event.date}</p>
          </div>
          {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
            <button
              key={s}
              onClick={() => { updateEvent({ ...ctxMenu.event, status: s }); setCtxMenu(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left
                ${ctxMenu.event.status === s ? "bg-accent/50 font-medium" : ""}`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }}/>
              {STATUS_LABELS[s]}
              {ctxMenu.event.status === s && <Check className="w-3 h-3 ml-auto text-primary"/>}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={() => {
                const el = document.querySelector(`[data-event-id="${ctxMenu.event.id}"]`);
                const rect = el?.getBoundingClientRect() ?? new DOMRect(ctxMenu.x, ctxMenu.y, 0, 0);
                setPopup({ mode: "view", event: ctxMenu.event, anchor: rect });
                setCtxMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left"
            >
              <Pencil className="w-3 h-3 text-muted-foreground"/> Редактировать
            </button>
            <button
              onClick={() => { deleteEvent(ctxMenu.event.id); setCtxMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left text-destructive"
            >
              <Trash2 className="w-3 h-3"/> Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── EntityRow ─────────────────────────────── */
interface EntityRowProps {
  entity: Entity;
  days: Date[];
  eventCount: number;
  getEventsForCell: (entityId: string, date: string) => PlannerEvent[];
  onCellClick: (entityId: string, date: string, rect: DOMRect) => void;
  onEventClick: (event: PlannerEvent, rect: DOMRect) => void;
  onContextMenu: (e: MouseEvent, event: PlannerEvent) => void;
  onDeleteEntity: (id: string) => void;
  onRenameEntity: (id: string, name: string) => void;
  onShiftClick: (event: PlannerEvent) => void;
}

function EntityRow({
  entity, days, eventCount,
  getEventsForCell, onCellClick, onEventClick,
  onContextMenu, onDeleteEntity, onRenameEntity, onShiftClick,
}: EntityRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(entity.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setEditName(entity.name); }, [entity.name]);

  const commitRename = () => {
    const name = editName.trim();
    if (name && name !== entity.name) onRenameEntity(entity.id, name);
    else setEditName(entity.name);
    setEditing(false);
  };

  return (
    <tr className="group border-b border-border/30 hover:bg-white/[0.02] transition-colors">
      {/* Name cell */}
      <td className="border-r border-border/30 px-2.5 py-1 sticky left-0 bg-background z-10 group-hover:bg-[#1e2535] transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: entity.color }}
          />
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setEditName(entity.name); setEditing(false); }
              }}
              className="text-[13px] bg-transparent border-b border-primary outline-none flex-1 min-w-0 text-foreground"
            />
          ) : (
            <span
              className="text-[13px] truncate cursor-default"
              onDoubleClick={() => setEditing(true)}
              title={entity.name}
            >
              {entity.name}
            </span>
          )}
          {/* Row actions — visible on hover */}
          {!editing && (
            <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={() => setEditing(true)}
                title="Переименовать"
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
                <Pencil className="w-2.5 h-2.5"/>
              </button>
              <button
                onClick={() => onDeleteEntity(entity.id)}
                title="Удалить строку"
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
        const weekend = isWeekend(day);
        const todayDay = isToday(day);

        return (
          <td
            key={dateStr}
            className={`p-[3px]
              ${weekend ? "bg-white/[0.012]" : ""}
              ${todayDay ? "bg-primary/[0.07]" : ""}`}
          >
            <GridCell
              events={cellEvents}
              entityId={entity.id}
              entityColor={entity.color}
              date={dateStr}
              onAddClick={onCellClick}
              onEventClick={onEventClick}
              onContextMenu={onContextMenu}
              onShiftClick={onShiftClick}
            />
          </td>
        );
      })}

      {/* Summary */}
      <td className="border-l border-border/30 text-center py-1">
        {eventCount > 0 ? (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${entity.color}25`, color: entity.color }}
          >
            {eventCount}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </td>
    </tr>
  );
}

/* ─────────────────────────────── GridCell ─────────────────────────────── */
interface GridCellProps {
  events: PlannerEvent[];
  entityId: string;
  entityColor: string;
  date: string;
  onAddClick: (entityId: string, date: string, rect: DOMRect) => void;
  onEventClick: (event: PlannerEvent, rect: DOMRect) => void;
  onContextMenu: (e: MouseEvent, event: PlannerEvent) => void;
  onShiftClick: (event: PlannerEvent) => void;
}

function GridCell({
  events, entityId, entityColor, date,
  onAddClick, onEventClick, onContextMenu, onShiftClick,
}: GridCellProps) {
  const ref = useRef<HTMLDivElement>(null);

  if (events.length === 0) {
    return (
      <div
        ref={ref}
        data-testid={`cell-empty-${entityId}-${date}`}
        onClick={() => ref.current && onAddClick(entityId, date, ref.current.getBoundingClientRect())}
        className="group/cell w-7 h-7 rounded cursor-pointer flex items-center justify-center
          border border-transparent hover:border-border hover:bg-white/[0.04] transition-all"
        title={`Добавить событие на ${date}`}
      >
        <Plus className="w-2.5 h-2.5 text-muted-foreground/0 group-hover/cell:text-muted-foreground/50 transition-colors"/>
      </div>
    );
  }

  const first = events[0];

  return (
    <div
      ref={ref}
      data-testid={`cell-event-${entityId}-${date}`}
      data-event-id={first.id}
      onClick={(e) => {
        if (e.shiftKey) { onShiftClick(first); return; }
        ref.current && onEventClick(first, ref.current.getBoundingClientRect());
      }}
      onContextMenu={(e) => onContextMenu(e.nativeEvent, first)}
      className="w-7 h-7 rounded cursor-pointer relative flex items-center justify-center
        transition-all hover:scale-110 hover:brightness-110 active:scale-95"
      style={{ backgroundColor: STATUS_COLORS[first.status] }}
      title={`${first.title}\n${STATUS_LABELS[first.status]}\n${first.assignee}\nShift+клик = смена статуса`}
    >
      {events.length > 1 && (
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-background border border-border text-[7px] font-bold flex items-center justify-center text-foreground">
          {events.length}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────── AddEventPopup ─────────────────────────────── */
interface AddEventPopupProps {
  entityId: string;
  date: string;
  onClose: () => void;
  onAdd: (event: PlannerEvent) => void;
}

function AddEventPopup({ entityId, date, onClose, onAdd }: AddEventPopupProps) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState<EventStatus>("pending");
  const [notes, setNotes] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const dateLabel = (() => {
    try { return format(parseISO(date), "d MMMM yyyy", { locale: ru }); } catch { return date; }
  })();

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ id: generateId(), entityId, date, status, title: title.trim(), assignee: assignee.trim() || "—", notes: notes.trim() || undefined });
  };

  return (
    <div className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="h-0.5" style={{ backgroundColor: STATUS_COLORS[status] }}/>
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
          <input
            ref={titleRef}
            data-testid="input-event-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Название события"
            className="w-full text-sm bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"
          />
          <input
            data-testid="input-event-assignee"
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            placeholder="Ответственный"
            className="w-full text-sm bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"
          />
          {/* Status selector */}
          <div className="flex gap-1.5 pt-0.5">
            {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
              <button
                key={s}
                data-testid={`btn-status-${s}`}
                onClick={() => setStatus(s)}
                className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-all border ${
                  status === s ? "text-white border-transparent scale-105" : "border-border text-muted-foreground hover:border-border/80"
                }`}
                style={status === s ? { backgroundColor: STATUS_COLORS[s] } : {}}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <textarea
            data-testid="input-event-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Заметки (необязательно)"
            rows={2}
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors resize-none"
          />
        </div>

        <button
          data-testid="btn-save-event"
          onClick={submit}
          disabled={!title.trim()}
          className="w-full mt-3 text-xs font-semibold py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Добавить событие
        </button>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">Enter — быстрое добавление · Esc — закрыть</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────── ViewPopup ─────────────────────────────── */
interface ViewPopupProps {
  event: PlannerEvent;
  onClose: () => void;
  onStatusChange: (status: EventStatus) => void;
  onDelete: () => void;
  onSave: (updated: PlannerEvent) => void;
}

function ViewPopup({ event, onClose, onStatusChange, onDelete, onSave }: ViewPopupProps) {
  const [editTitle, setEditTitle] = useState(event.title);
  const [editAssignee, setEditAssignee] = useState(event.assignee);
  const [editNotes, setEditNotes] = useState(event.notes ?? "");
  const [isDirty, setIsDirty] = useState(false);

  const dateLabel = (() => {
    try { return format(parseISO(event.date), "d MMMM yyyy", { locale: ru }); } catch { return event.date; }
  })();

  const initials = event.assignee.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase() || "?";

  const handleSave = () => {
    if (!editTitle.trim()) return;
    onSave({ ...event, title: editTitle.trim(), assignee: editAssignee.trim() || "—", notes: editNotes.trim() || undefined });
  };

  return (
    <div className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="h-0.5" style={{ backgroundColor: STATUS_COLORS[event.status] }}/>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: STATUS_COLORS[event.status] }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-foreground truncate">{event.assignee}</p>
              <p className="text-[10px] text-muted-foreground">{dateLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0">
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>

        {/* Editable fields */}
        <div className="space-y-2 mb-3">
          <input
            value={editTitle}
            onChange={e => { setEditTitle(e.target.value); setIsDirty(true); }}
            className="w-full text-sm font-medium bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground transition-colors"
          />
          <input
            value={editAssignee}
            onChange={e => { setEditAssignee(e.target.value); setIsDirty(true); }}
            placeholder="Ответственный"
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"
          />
          <textarea
            value={editNotes}
            onChange={e => { setEditNotes(e.target.value); setIsDirty(true); }}
            placeholder="Заметки..."
            rows={2}
            className="w-full text-xs bg-accent/40 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors resize-none"
          />
        </div>

        {/* Quick status */}
        <div className="flex gap-1.5 mb-3">
          {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-all border ${
                event.status === s ? "text-white border-transparent" : "border-border text-muted-foreground hover:border-border/70"
              }`}
              style={event.status === s ? { backgroundColor: STATUS_COLORS[s] } : {}}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isDirty ? (
            <button onClick={handleSave} className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1">
              <Check className="w-3 h-3"/> Сохранить
            </button>
          ) : (
            <>
              <button
                onClick={() => onStatusChange("pending")}
                className="flex-1 text-xs py-1.5 rounded-lg border border-border text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1">
                <RotateCcw className="w-3 h-3"/> Перенести
              </button>
              <button
                onClick={() => onStatusChange("confirmed")}
                className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors flex items-center justify-center gap-1">
                <Check className="w-3 h-3"/> Подтвердить
              </button>
            </>
          )}
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>
    </div>
  );
}
