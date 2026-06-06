export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meal Calendar</h1>
        <div className="flex gap-2">
          {["Day", "Week", "Month"].map((view) => (
            <span
              key={view}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
            >
              {view}
            </span>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted">Calendar grid with meal planning — to be implemented</p>
    </div>
  );
}
