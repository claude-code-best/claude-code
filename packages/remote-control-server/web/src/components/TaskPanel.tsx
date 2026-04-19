import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

interface TaskPanelProps {
  onClose: () => void;
}

export function TaskPanel({ onClose }: TaskPanelProps) {
  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-y-0 right-0 top-auto left-auto translate-x-0 translate-y-0 w-full sm:w-80 h-full max-w-none max-h-none rounded-none border-l border-border bg-surface-1 p-4 sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle className="font-display font-semibold text-text-primary">Tasks</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-text-muted">No active tasks</div>
      </DialogContent>
    </Dialog>
  );
}
