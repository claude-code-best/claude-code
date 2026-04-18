interface TaskPanelProps {
  onClose: () => void;
}

export function TaskPanel({ onClose }: TaskPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-80 border-l border-border bg-surface-1 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display font-semibold text-text-primary">Tasks</h3>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-2 hover:text-text-secondary transition-colors"
          >
            &times;
          </button>
        </div>
        <div className="text-sm text-text-muted">No active tasks</div>
      </div>
    </div>
  );
}
