export default function SummarySkeleton() {
  return (
    <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card border rounded-xl p-4 animate-pulse">
          <div className="h-4 bg-muted rounded w-2/3 mb-3" />
          <div className="h-8 bg-muted rounded w-1/2" />
        </div>
      ))}
    </div>
  )
}