export default function HoldingsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card border rounded-xl p-4 animate-pulse">
          <div className="flex justify-between mb-4">
            <div>
              <div className="h-5 bg-muted rounded w-20 mb-1" />
              <div className="h-3 bg-muted rounded w-12" />
            </div>
            <div className="text-right">
              <div className="h-5 bg-muted rounded w-16 mb-1" />
              <div className="h-3 bg-muted rounded w-14" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded" />
            <div className="h-4 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}