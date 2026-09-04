import { useBackgroundTasks } from "@/hooks/useBackgroundTasks";

export function BackgroundTaskIndicator() {
  const { activeCount, label } = useBackgroundTasks();

  if (activeCount === 0 || !label) {
    return null;
  }

  return (
    <div className="bg-task-indicator" role="status" aria-live="polite">
      <span className="bg-task-indicator__dot" aria-hidden="true" />
      <span className="bg-task-indicator__label">{label}</span>
    </div>
  );
}
