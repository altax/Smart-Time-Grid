import React, { useState } from "react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isWeekend, isToday, isSameDay, parseISO, isWithinInterval, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Briefcase, User, Heart, BookOpen, MoreHorizontal, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTasks } from "../hooks/use-tasks";
import { Task, TASK_COLORS } from "../types";
import { motion, AnimatePresence } from "framer-motion";

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const categoryIcons = {
  work: <Briefcase className="w-4 h-4" />,
  personal: <User className="w-4 h-4" />,
  health: <Heart className="w-4 h-4" />,
  study: <BookOpen className="w-4 h-4" />,
  other: <MoreHorizontal className="w-4 h-4" />
};

const categoryLabels = {
  work: "Работа",
  personal: "Личное",
  health: "Здоровье",
  study: "Учёба",
  other: "Другое"
};

const priorityLabels = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий"
};

const priorityColors = {
  low: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/50",
  high: "bg-red-500/20 text-red-400 border-red-500/50"
};

export default function Home() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { tasks, addTask, updateTask, deleteTask } = useTasks(currentMonth);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToday = () => setCurrentMonth(new Date());

  const handleOpenModal = (task?: Task) => {
    if (task) {
      setEditingTask(task);
    } else {
      setEditingTask(null);
    }
    setIsModalOpen(true);
  };

  const handleSaveTask = (taskData: any) => {
    if (editingTask) {
      updateTask({ ...editingTask, ...taskData });
    } else {
      addTask({
        id: generateId(),
        createdAt: new Date().toISOString(),
        ...taskData
      });
    }
    setIsModalOpen(false);
  };

  const handleDeleteTask = () => {
    if (editingTask) {
      deleteTask(editingTask.id);
      setIsModalOpen(false);
    }
  };

  // Stats
  const totalTasks = tasks.length;
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const inProgressTasks = tasks.filter(t => t.startDate <= todayStr && t.endDate >= todayStr).length;
  const completedTasks = tasks.filter(t => t.endDate < todayStr).length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="flex-none flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="bg-primary text-primary-foreground p-2 rounded-xl">
            <CalendarDays className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Планировщик</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={goToday} className="min-w-[120px] font-medium">
            {format(currentMonth, "LLLL yyyy", { locale: ru }).replace(/^[а-я]/, c => c.toUpperCase())}
          </Button>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Button onClick={() => handleOpenModal()} className="gap-2">
          <Plus className="w-4 h-4" />
          Добавить задачу
        </Button>
      </header>

      {/* Main Grid Area */}
      <main className="flex-1 overflow-auto relative flex flex-col">
        <div className="min-w-max flex-1 flex flex-col">
          {/* Days Header Row */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-background/95 backdrop-blur-md">
            <div className="w-[280px] flex-shrink-0 border-r border-border bg-card/50 p-3 flex items-end">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Задачи</span>
            </div>
            <div className="flex flex-1">
              {daysInMonth.map((day) => {
                const isWknd = isWeekend(day);
                const isTdy = isToday(day);
                return (
                  <div 
                    key={day.toString()} 
                    className={`flex-1 min-w-[40px] flex flex-col items-center justify-center py-2 border-r border-border/50 
                      ${isWknd ? 'bg-muted/30' : ''} 
                      ${isTdy ? 'bg-primary/10 border-primary/30' : ''}`}
                  >
                    <span className={`text-[10px] uppercase font-medium ${isTdy ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day, "EEEEEE", { locale: ru })}
                    </span>
                    <span className={`text-sm font-semibold mt-0.5 ${isTdy ? 'text-primary' : 'text-foreground'}`}>
                      {format(day, "d")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task Rows */}
          <div className="flex-1 relative">
            {/* Today highlight line */}
            <div className="absolute inset-0 pointer-events-none flex" style={{ paddingLeft: 280 }}>
               {daysInMonth.map((day, i) => (
                  <div key={i} className={`flex-1 min-w-[40px] border-r border-border/20 ${isToday(day) ? 'bg-primary/5' : ''}`} />
               ))}
            </div>

            <div className="relative z-0">
              <AnimatePresence>
                {tasks.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center p-12 text-center text-muted-foreground">
                    <div>
                      <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="text-lg font-medium">Нет задач в этом месяце</p>
                      <p className="text-sm">Нажмите «Добавить задачу», чтобы начать планирование.</p>
                    </div>
                  </div>
                ) : (
                  tasks.map((task) => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={task.id} 
                      className="flex border-b border-border/50 group hover:bg-muted/10 transition-colors"
                    >
                      {/* Task Info Cell */}
                      <div 
                        className="w-[280px] flex-shrink-0 border-r border-border/50 p-3 flex items-center gap-3 bg-card/20 cursor-pointer hover:bg-card/40 transition-colors relative overflow-hidden"
                        onClick={() => handleOpenModal(task)}
                      >
                        {/* Progress background */}
                        {(() => {
                           const start = parseISO(task.startDate);
                           const end = parseISO(task.endDate);
                           const today = new Date();
                           let progress = 0;
                           if (today >= end) progress = 100;
                           else if (today > start) {
                             const totalDays = differenceInDays(end, start) + 1;
                             const elapsed = differenceInDays(today, start) + 1;
                             progress = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
                           }
                           
                           return (
                             <div 
                               className="absolute bottom-0 left-0 h-[2px] bg-primary/20" 
                               style={{ width: '100%' }}
                             >
                                <div 
                                  className="h-full bg-primary" 
                                  style={{ width: `\${progress}%` }} 
                                />
                             </div>
                           );
                        })()}

                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: task.color }} />
                        
                        <div className="flex-1 min-w-0 flex flex-col">
                          <span className="text-sm font-medium truncate" title={task.name}>{task.name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              {categoryIcons[task.category]}
                              <span className="truncate">{categoryLabels[task.category]}</span>
                            </span>
                          </div>
                        </div>
                        
                        <div className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityColors[task.priority]}`}>
                          {priorityLabels[task.priority][0]}
                        </div>
                      </div>

                      {/* Task Timeline Cells */}
                      <div className="flex flex-1 py-1 px-0 relative">
                        {daysInMonth.map((day) => {
                          const dateStr = format(day, "yyyy-MM-dd");
                          const isStart = dateStr === task.startDate;
                          const isEnd = dateStr === task.endDate;
                          const isActive = dateStr >= task.startDate && dateStr <= task.endDate;
                          
                          return (
                            <div 
                              key={day.toString()} 
                              className="flex-1 min-w-[40px] px-[1px] relative h-full flex items-center"
                              onClick={() => handleOpenModal(task)}
                            >
                              {isActive && (
                                <div 
                                  className={`h-8 w-[calc(100%+2px)] absolute left-[-1px] top-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:brightness-110
                                    ${isStart ? 'rounded-l-md ml-[1px] w-[calc(100%+1px)]' : ''} 
                                    ${isEnd ? 'rounded-r-md mr-[1px] w-[calc(100%+1px)]' : ''}`}
                                  style={{ 
                                    backgroundColor: `\${task.color}33`, 
                                    borderTop: `1px solid \${task.color}80`,
                                    borderBottom: `1px solid \${task.color}80`,
                                    borderLeft: isStart ? `1px solid \${task.color}80` : 'none',
                                    borderRight: isEnd ? `1px solid \${task.color}80` : 'none'
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
            
            {/* Empty clickable row to add task */}
            <div 
              className="flex border-b border-border/10 cursor-pointer hover:bg-muted/10 transition-colors h-14"
              onClick={() => handleOpenModal()}
            >
              <div className="w-[280px] flex-shrink-0 border-r border-border/50 p-3 flex items-center gap-3 text-muted-foreground">
                <Plus className="w-4 h-4" />
                <span className="text-sm">Новая задача</span>
              </div>
              <div className="flex flex-1" />
            </div>

          </div>
        </div>
      </main>

      {/* Footer / Stats */}
      <footer className="flex-none border-t border-border bg-card px-6 py-3 flex items-center justify-between text-sm text-muted-foreground z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{totalTasks}</span> 
            <span>Всего задач</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <span className="font-medium text-amber-500">{inProgressTasks}</span> 
            <span>В процессе</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <span className="font-medium text-emerald-500">{completedTasks}</span> 
            <span>Завершено</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs uppercase tracking-wider font-medium">Категории:</span>
          {Object.entries(categoryLabels).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              {categoryIcons[key as keyof typeof categoryIcons]}
              <span>{label}</span>
            </div>
          ))}
        </div>
      </footer>

      {/* Task Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Редактировать задачу" : "Новая задача"}</DialogTitle>
          </DialogHeader>
          <TaskForm 
            task={editingTask} 
            onSave={handleSaveTask} 
            onDelete={handleDeleteTask}
            defaultDate={format(currentMonth, "yyyy-MM-dd")}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Form Component inline for simplicity
function TaskForm({ task, onSave, onDelete, defaultDate }: { 
  task: Task | null, 
  onSave: (data: any) => void, 
  onDelete: () => void,
  defaultDate: string 
}) {
  const [name, setName] = useState(task?.name || "");
  const [color, setColor] = useState(task?.color || TASK_COLORS[0]);
  const [startDate, setStartDate] = useState(task?.startDate || defaultDate);
  
  // default end date is start date
  const [endDate, setEndDate] = useState(task?.endDate || defaultDate);
  const [category, setCategory] = useState<Task["category"]>(task?.category || "work");
  const [priority, setPriority] = useState<Task["priority"]>(task?.priority || "medium");
  const [notes, setNotes] = useState(task?.notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // ensure end date is >= start date
    const finalEndDate = endDate < startDate ? startDate : endDate;

    onSave({
      name,
      color,
      startDate,
      endDate: finalEndDate,
      category,
      priority,
      notes
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="name">Название</Label>
        <Input 
          id="name" 
          value={name} 
          onChange={e => setName(e.target.value)} 
          placeholder="Что нужно сделать?"
          autoFocus
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start">Начало</Label>
          <Input 
            id="start" 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end">Конец</Label>
          <Input 
            id="end" 
            type="date" 
            value={endDate} 
            min={startDate}
            onChange={e => setEndDate(e.target.value)} 
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Категория</Label>
          <Select value={category} onValueChange={(v: any) => setCategory(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Приоритет</Label>
          <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(priorityLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Цвет</Label>
        <div className="flex gap-2">
          {TASK_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-foreground' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Заметки (необязательно)</Label>
        <Textarea 
          id="notes" 
          value={notes} 
          onChange={e => setNotes(e.target.value)} 
          placeholder="Детали задачи..."
          className="resize-none h-20"
        />
      </div>

      <div className="flex justify-between pt-2">
        {task ? (
          <Button type="button" variant="destructive" onClick={onDelete}>Удалить</Button>
        ) : (
          <div /> // placeholder for flex-between
        )}
        <Button type="submit">Сохранить</Button>
      </div>
    </form>
  );
}
