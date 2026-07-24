export default function SummarySkeleton() {
  return (
    <section className="mb-8">
      <div className="skeleton-block mb-4 h-7 w-28" />
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-subtle bg-surface-elevated md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-b border-subtle p-4 last:border-b-0 md:border-r lg:border-b-0"
          >
            <div className="skeleton-block mb-3 h-4 w-2/3" />
            <div className="skeleton-block h-8 w-1/2" />
          </div>
        ))}
      </div>
    </section>
  )
}
