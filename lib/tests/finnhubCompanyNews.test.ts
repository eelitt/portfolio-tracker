import { describe, it, expect } from 'vitest'
import {
  articlesToNewsBullets,
  formatFinnhubBullet,
  isArticleRelevantToHolding,
} from '../../app/actions/ai/holding-news/finnhubCompanyNews'

describe('isArticleRelevantToHolding', () => {
  it('accepts Apple headlines / rejects unrelated related=AAPL spam', () => {
    expect(
      isArticleRelevantToHolding(
        { headline: 'What Could Keep Apple Stock Climbing?' },
        'AAPL',
        'Apple Inc.'
      )
    ).toBe(true)
    expect(
      isArticleRelevantToHolding(
        { headline: 'The Big Question Hanging Over Netflix Stock' },
        'AAPL',
        'Apple Inc.'
      )
    ).toBe(false)
  })
})

describe('formatFinnhubBullet', () => {
  it('includes summary and source URL for impact + links', () => {
    const bullet = formatFinnhubBullet({
      headline: 'Is Apple Stock a Buy Right Now?',
      summary: 'Shares in the dominant consumer tech enterprise have soared 22% so far in 2026.',
      source: 'Yahoo',
      url: 'https://finnhub.io/api/news?id=abc',
    })
    expect(bullet).toContain('Is Apple Stock a Buy Right Now?')
    expect(bullet).toContain('soared 22%')
    expect(bullet).toContain('(Yahoo)')
    expect(bullet).toContain('—')
    expect(bullet).toMatch(/https:\/\/finnhub\.io\/api\/news\?id=abc$/)
  })

  it('headline only when no useful summary', () => {
    expect(
      formatFinnhubBullet({
        headline: 'Apple Stock Update',
        summary: 'Apple Stock Update',
        source: 'Wire',
      })
    ).toBe('Apple Stock Update (Wire)')
  })
})

describe('articlesToNewsBullets', () => {
  it('filters spam and embeds summary in bullets', () => {
    const bullets = articlesToNewsBullets(
      [
        {
          headline: 'The Big Question Hanging Over Netflix Stock',
          summary: 'Netflix stuff',
          source: 'Yahoo',
          datetime: 500,
        },
        {
          headline: 'What Could Keep Apple Stock Climbing?',
          summary:
            "After a large run, the next leg up may depend on a simple, powerful force that's already in motion.",
          source: 'Yahoo',
          datetime: 300,
        },
        {
          headline: 'Is Apple Stock a Buy Right Now?',
          summary:
            'Shares in the dominant consumer tech enterprise have soared 22% so far in 2026.',
          source: 'Yahoo',
          datetime: 200,
        },
      ],
      { symbol: 'AAPL', companyName: 'Apple Inc.', maxBullets: 3 }
    )
    expect(bullets).toHaveLength(2)
    expect(bullets[0]).toContain('Apple Stock Climbing')
    expect(bullets[0]).toContain('next leg up')
    expect(bullets[1]).toContain('soared 22%')
  })

  it('empty input', () => {
    expect(articlesToNewsBullets([], { symbol: 'AAPL' })).toEqual([])
  })
})
