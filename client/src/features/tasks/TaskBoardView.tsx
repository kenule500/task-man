import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import KanbanColumn from './components/KanbanColumn';
import KanbanCard from './components/KanbanCard';
import { STATUS_COLUMNS } from './types';
import type { Task, TaskStatus } from './types';

interface TaskBoardViewProps {
  tasks: Task[];
  allTasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  onOpen: (task: Task) => void;
  onOpenComments: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onMove: (taskId: string, status: TaskStatus, order: number) => void;
}

const TaskBoardView = ({ tasks, allTasks, onAddTask, onOpen, onOpenComments, onEdit, onDelete, onMove }: TaskBoardViewProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columns = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = { pending: [], 'in-progress': [], completed: [] };
    [...tasks]
      .sort((a, b) => a.order - b.order)
      .forEach(task => grouped[task.status].push(task));
    return grouped;
  }, [tasks]);

  const activeTask = activeId ? tasks.find(t => t._id === activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeTaskId = active.id as string;
    const overId = over.id as string;

    let destStatus: TaskStatus;
    let destIndex: number;

    if (overId.startsWith('column:')) {
      destStatus = overId.replace('column:', '') as TaskStatus;
      destIndex = columns[destStatus].length;
    } else {
      const overTask = tasks.find(t => t._id === overId);
      if (!overTask) return;
      destStatus = overTask.status;
      destIndex = columns[destStatus].findIndex(t => t._id === overId);
    }

    const destColumnTasks = columns[destStatus].filter(t => t._id !== activeTaskId);
    const prevOrder = destIndex > 0 ? destColumnTasks[destIndex - 1]?.order : undefined;
    const nextOrder = destColumnTasks[destIndex]?.order;

    let newOrder: number;
    if (prevOrder === undefined && nextOrder === undefined) newOrder = 0;
    else if (prevOrder === undefined) newOrder = nextOrder! - 1;
    else if (nextOrder === undefined) newOrder = prevOrder + 1;
    else newOrder = (prevOrder + nextOrder) / 2;

    const current = tasks.find(t => t._id === activeTaskId);
    if (current && current.status === destStatus && current.order === newOrder) return;

    onMove(activeTaskId, destStatus, newOrder);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col sm:flex-row gap-4 overflow-x-auto pb-2">
        {STATUS_COLUMNS.map(({ key, label }) => (
          <KanbanColumn
            key={key}
            status={key}
            label={label}
            tasks={columns[key]}
            allTasks={allTasks}
            onAddTask={onAddTask}
            onOpen={onOpen}
            onOpenComments={onOpenComments}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="w-72 rotate-1">
            <KanbanCard task={activeTask} allTasks={allTasks} onOpen={() => {}} onOpenComments={() => {}} onEdit={() => {}} onDelete={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default TaskBoardView;
