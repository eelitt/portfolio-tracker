export default function HoldingsSkeleton() {
  return (
    <div className="space-y-8">
      <section className="mb-8">
        <div className="skeleton-block mb-4 h-7 w-28" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-subtle bg-surface-elevated p-4"
            >
              <div className="mb-4 flex justify-between">
                <div>
                  <div className="skeleton-block mb-1 h-5 w-20" />
                  <div className="skeleton-block h-3 w-12" />
                </div>
                <div className="flex flex-col items-end">
                  <div className="skeleton-block mb-1 h-5 w-16" />
                  <div className="skeleton-block h-3 w-14" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="skeleton-block h-4 w-full" />
                <div className="skeleton-block h-4 w-full" />
                <div className="skeleton-block h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="skeleton-block h-7 w-24" />
          <div className="skeleton-block h-8 w-48 rounded-lg" />
        </div>
        <div className="rounded-xl border border-subtle bg-surface-elevated p-4">
          <div className="skeleton-block h-64 w-full rounded-lg" />
        </div>
      </section>
    </div>
  )
}
