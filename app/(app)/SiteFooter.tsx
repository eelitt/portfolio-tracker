import Image from 'next/image'
import Link from 'next/link'

/**
 * Quiet app-shell footer: brand mark + copyright.
 * Sticky to bottom via parent flex column + main flex-1.
 */
export default function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
        >
          <Image
            src="/brand/based_code.png"
            alt="Based Code"
            width={50}
            height={50}
            className="h-8 w-8 rounded-sm object-contain"
            priority={false}
          />
          <div className="flex flex-col leading-tight">
            <span className="font-display text-sm font-semibold tracking-tight text-foreground">
              Based Code
            </span>
            <span className="text-[11px] text-muted-foreground">
              Private portfolio tracking
            </span>
          </div>
        </Link>
        <p className="text-xs text-muted-foreground sm:text-right">
          © {year} Based Code. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
