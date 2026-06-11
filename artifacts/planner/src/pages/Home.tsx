import { useState, useRef, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isToday,
  isWeekend,
  parseISO,
} from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, X, Check, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { usePlanner } from "../hooks/use-planner";
import { Entity, PlannerEvent, EventStatus, STATUS_COLORS, STATUS_LABELS } from "../types";

function generateId() {
  return Math.random().toString(36).substring(2, 12);
}

const DAY_ABBR: Record<number, string> = {
  0: "ВС",
  1: "ПН",
  2: "ВТ",
  3: "СР",
  4: "ЧТ",
  5: "ПТ",
  6: "СБ",
};

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

type PopupState =
  | { mode: "view"; event: PlannerEvent; entityId: string; date: string; cellRef: HTMLElement }
  | { mode: "add"; entityId: string; date: string; cellRef: HTMLElement }
  | { mode: "editEntity"; entity: Entity; cellRef: HTMLElement }
  | null;

export default function Home() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const {
    entities, events,
    addEntity, deleteEntity, renameEntity,
    addEvent, updateEvent, deleteEvent,
    getEventsForCell,
  } = usePlanner(currentMonth);

  const [popup, setPopup] = useState<PopupState>(null);
  const [addEntityName, setAddEntityName] = useState("");
  const [showAddEntity, setShowAddEntity] = useState(false);
  const addEntityRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  useEffect(() => {
    if (showAddEntity) addEntityRef.current?.focus();
  }, [showAddEntity]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openAddEvent(entityId: string, date: string, cell: HTMLElement) {
    setPopup({ mode: "add", entityId, date, cellRef: cell });
  }

  function openViewEvent(event: PlannerEvent, entityId: string, date: string, cell: HTMLElement) {
    setPopup({ mode: "view", event, entityId, date, cellRef: cell });
  }

  function handleAddEntity() {
    const name = addEntityName.trim();
    if (!name) return;
    addEntity({ id: generateId(), name });
    setAddEntityName("");
    setShowAddEntity(false);
  }

  function getPopupPosition() {
    if (!popup || !popupRef.current || !('cellRef' in popup)) return {};
    const cell = popup.cellRef;
    const rect = cell.getBoundingClientRect();
    const popupW = 280;
    const popupH = 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left + rect.width / 2 - popupW / 2;
    let top = rect.bottom + 8;

    if (left + popupW > vw - 8) left = vw - popupW - 8;
    if (left < 8) left = 8;
    if (top + popupH > vh - 8) top = rect.top - popupH - 8;

    return { position: "fixed" as const, left, top, zIndex: 50, width: popupW };
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-primary">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <span className="text-base font-semibold tracking-tight">Планировщик</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            data-testid="btn-prev-month"
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
          <button
            data-testid="btn-next-month"
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          data-testid="btn-today"
          onClick={() => setCurrentMonth(new Date())}
          className="text-xs text-primary hover:underline"
        >
          Сегодня
        </button>
      </div>

      {/* Grid */}
      <div ref={gridRef} className="flex-1 overflow-auto scrollbar-thin">
        <table className="border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 200, minWidth: 200 }} />
            {days.map(d => (
              <col key={d.toISOString()} style={{ width: 34, minWidth: 34 }} />
            ))}
            <col style={{ width: 48 }} />
          </colgroup>

          {/* Header rows */}
          <thead className="sticky top-0 z-20">
            {/* Day numbers */}
            <tr>
              <th className="bg-background border-b border-r border-border px-4 py-2 text-left">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Строка</span>
              </th>
              {days.map(day => {
                const todayCell = isToday(day);
                const weekend = isWeekend(day);
                return (
                  <th
                    key={day.toISOString()}
                    className={`border-b border-border py-2 text-center ${weekend ? "bg-background/50" : "bg-background"}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                          todayCell
                            ? "bg-primary text-primary-foreground"
                            : weekend
                            ? "text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                      <span className={`text-[9px] font-medium ${weekend ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                        {DAY_ABBR[day.getDay()]}
                      </span>
                    </div>
                  </th>
                );
              })}
              <th className="bg-background border-b border-border" />
            </tr>
          </thead>

          <tbody>
            {entities.length === 0 && (
              <tr>
                <td colSpan={days.length + 2} className="py-20 text-center text-muted-foreground text-sm">
                  Нет строк. Добавьте первую строку ниже.
                </td>
              </tr>
            )}

            {entities.map((entity, rowIdx) => (
              <EntityRow
                key={entity.id}
                entity={entity}
                days={days}
                rowIdx={rowIdx}
                getEventsForCell={getEventsForCell}
                onCellClick={openAddEvent}
                onEventClick={openViewEvent}
                onDeleteEntity={deleteEntity}
                onRenameEntity={renameEntity}
              />
            ))}

            {/* Add entity row */}
            <tr>
              <td className="border-t border-border/50 px-3 py-2" colSpan={days.length + 2}>
                {showAddEntity ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={addEntityRef}
                      data-testid="input-new-entity"
                      value={addEntityName}
                      onChange={e => setAddEntityName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleAddEntity();
                        if (e.key === "Escape") setShowAddEntity(false);
                      }}
                      placeholder="Название строки..."
                      className="text-sm bg-transparent border-b border-primary outline-none flex-1 py-0.5 text-foreground placeholder:text-muted-foreground"
                    />
                    <button onClick={handleAddEntity} className="text-xs text-primary hover:underline">
                      Добавить
                    </button>
                    <button onClick={() => setShowAddEntity(false)} className="text-xs text-muted-foreground hover:text-foreground">
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    data-testid="btn-add-entity"
                    onClick={() => setShowAddEntity(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Добавить строку
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 px-6 py-3 border-t border-border flex-shrink-0">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mr-2">Статус:</span>
        {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }} />
            <span className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span>Всего строк: <strong className="text-foreground">{entities.length}</strong></span>
          <span>Событий в месяце: <strong className="text-foreground">{events.length}</strong></span>
        </div>
      </div>

      {/* Popup */}
      {popup && (
        <div ref={popupRef} style={getPopupPosition()}>
          {popup.mode === "view" && (
            <ViewPopup
              event={popup.event}
              onClose={() => setPopup(null)}
              onConfirm={() => {
                updateEvent({ ...popup.event, status: "confirmed" });
                setPopup(null);
              }}
              onPostpone={() => {
                updateEvent({ ...popup.event, status: "pending" });
                setPopup(null);
              }}
              onDelete={() => {
                deleteEvent(popup.event.id);
                setPopup(null);
              }}
              onEdit={(updated) => {
                updateEvent(updated);
                setPopup(null);
              }}
            />
          )}
          {popup.mode === "add" && (
            <AddEventPopup
              entityId={popup.entityId}
              date={popup.date}
              onClose={() => setPopup(null)}
              onAdd={(event) => {
                addEvent(event);
                setPopup(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Entity row ── */
interface EntityRowProps {
  entity: Entity;
  days: Date[];
  rowIdx: number;
  getEventsForCell: (entityId: string, date: string) => PlannerEvent[];
  onCellClick: (entityId: string, date: string, cell: HTMLElement) => void;
  onEventClick: (event: PlannerEvent, entityId: string, date: string, cell: HTMLElement) => void;
  onDeleteEntity: (id: string) => void;
  onRenameEntity: (id: string, name: string) => void;
}

function EntityRow({
  entity, days, getEventsForCell,
  onCellClick, onEventClick, onDeleteEntity, onRenameEntity,
}: EntityRowProps) {
  const [hovering, setHovering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(entity.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitRename() {
    const name = editName.trim();
    if (name && name !== entity.name) onRenameEntity(entity.id, name);
    else setEditName(entity.name);
    setEditing(false);
  }

  return (
    <tr
      className="group border-b border-border/40 hover:bg-accent/30 transition-colors"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Entity name cell */}
      <td className="border-r border-border/40 px-3 py-1.5 sticky left-0 bg-background z-10 group-hover:bg-accent/30 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
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
              className="text-sm bg-transparent border-b border-primary outline-none flex-1 min-w-0"
            />
          ) : (
            <span
              className="text-sm truncate cursor-pointer hover:text-primary transition-colors"
              onDoubleClick={() => setEditing(true)}
              title={entity.name}
            >
              {entity.name}
            </span>
          )}
          {hovering && !editing && (
            <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => onDeleteEntity(entity.id)}
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent"
              >
                <Trash2 className="w-3 h-3" />
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
        const todayCell = isToday(day);

        return (
          <td
            key={dateStr}
            className={`p-0.5 ${weekend ? "bg-background/40" : ""} ${todayCell ? "bg-primary/5" : ""}`}
          >
            <CellContents
              events={cellEvents}
              entityId={entity.id}
              date={dateStr}
              onAddClick={onCellClick}
              onEventClick={onEventClick}
            />
          </td>
        );
      })}
      <td />
    </tr>
  );
}

/* ── Cell contents ── */
interface CellContentsProps {
  events: PlannerEvent[];
  entityId: string;
  date: string;
  onAddClick: (entityId: string, date: string, cell: HTMLElement) => void;
  onEventClick: (event: PlannerEvent, entityId: string, date: string, cell: HTMLElement) => void;
}

function CellContents({ events, entityId, date, onAddClick, onEventClick }: CellContentsProps) {
  const ref = useRef<HTMLDivElement>(null);

  if (events.length === 0) {
    return (
      <div
        ref={ref}
        data-testid={`cell-empty-${entityId}-${date}`}
        onClick={() => ref.current && onAddClick(entityId, date, ref.current)}
        className="cell-sq border border-border/40 hover:border-primary/40 hover:bg-accent/50 cursor-pointer transition-all rounded"
        title="Добавить событие"
      />
    );
  }

  // Show first event as main color, stack indicator for multiples
  const first = events[0];
  return (
    <div
      ref={ref}
      data-testid={`cell-event-${entityId}-${date}`}
      onClick={() => ref.current && onEventClick(first, entityId, date, ref.current)}
      className="cell-sq relative cursor-pointer rounded transition-all hover:opacity-80 hover:scale-105"
      style={{ backgroundColor: STATUS_COLORS[first.status] }}
      title={`${first.title} — ${STATUS_LABELS[first.status]}`}
    >
      {events.length > 1 && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-background border border-border text-[7px] font-bold flex items-center justify-center text-foreground">
          {events.length}
        </span>
      )}
    </div>
  );
}

/* ── View popup ── */
interface ViewPopupProps {
  event: PlannerEvent;
  onClose: () => void;
  onConfirm: () => void;
  onPostpone: () => void;
  onDelete: () => void;
  onEdit: (updated: PlannerEvent) => void;
}

function ViewPopup({ event, onClose, onConfirm, onPostpone, onDelete }: ViewPopupProps) {
  const dateLabel = (() => {
    try {
      return format(parseISO(event.date), "d MMMM yyyy", { locale: ru });
    } catch {
      return event.date;
    }
  })();

  const initials = event.assignee
    .split(" ")
    .map(p => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Top bar with status color */}
      <div className="h-1" style={{ backgroundColor: STATUS_COLORS[event.status] }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight">{event.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 py-3 border-y border-border my-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ backgroundColor: STATUS_COLORS[event.status] }}
          >
            {initials || "?"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{event.assignee}</p>
            <p className="text-[10px] text-muted-foreground">
              {STATUS_LABELS[event.status]}
            </p>
          </div>
        </div>

        {event.notes && (
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{event.notes}</p>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onPostpone}
            className="flex-1 text-xs py-1.5 px-3 rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            Перенести
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 text-xs py-1.5 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
          >
            <Check className="w-3 h-3" />
            Подтвердить
          </button>
          <button
            onClick={onDelete}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add event popup ── */
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

  function handleSubmit() {
    if (!title.trim()) return;
    onAdd({
      id: generateId(),
      entityId,
      date,
      status,
      title: title.trim(),
      assignee: assignee.trim() || "—",
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div
      className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      <div className="h-1 bg-primary" />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Новое событие</p>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          <input
            ref={titleRef}
            data-testid="input-event-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Название события"
            className="w-full text-sm bg-accent/50 border border-border rounded-md px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
          />
          <input
            data-testid="input-event-assignee"
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            placeholder="Ответственный"
            className="w-full text-sm bg-accent/50 border border-border rounded-md px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
          />
          <div className="flex gap-1.5">
            {(Object.keys(STATUS_LABELS) as EventStatus[]).map(s => (
              <button
                key={s}
                data-testid={`status-${s}`}
                onClick={() => setStatus(s)}
                className={`flex-1 text-[10px] font-medium py-1 rounded-md border transition-all ${
                  status === s
                    ? "border-transparent text-white"
                    : "border-border text-muted-foreground hover:border-border/80"
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
            className="w-full text-xs bg-accent/50 border border-border rounded-md px-3 py-1.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground resize-none"
          />
        </div>

        <button
          data-testid="btn-save-event"
          onClick={handleSubmit}
          disabled={!title.trim()}
          className="w-full mt-3 text-xs font-medium py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Добавить событие
        </button>
      </div>
    </div>
  );
}
