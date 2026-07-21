import { describe, it, expect } from 'vitest'
import {
  mergeHoldingNews,
  buildHoldingNewsMergeMessage,
  symbolHasBullets,
  symbolNewsFingerprint,
} from '../../app/actions/ai/holding-news/newsUtils'

describe('mergeHoldingNews', () => {
  it('first run: takes incoming as-is', () => {
    const merge = mergeHoldingNews(
      null,
      { LINK: ['a'], AAPL: [] },
      ['LINK', 'AAPL']
    )
    expect(merge.news.LINK).toEqual(['a'])
    expect(merge.news.AAPL).toEqual([])
    expect(merge.changedSymbols).toEqual(['LINK'])
    expect(merge.firstFillCount).toBe(1)
    expect(merge.emptyCount).toBe(1)
    expect(merge.keptCount).toBe(0)
  })

  it('LINK same, AAPL empty, ETH same → keep LINK/ETH, AAPL still empty', () => {
    const previous = {
      LINK: ['L1', 'L2'],
      ETH: ['E1'],
    }
    const incoming = {
      LINK: ['L2', 'L1'], // same content, different order
      AAPL: [],
      ETH: ['E1'],
    }
    const merge = mergeHoldingNews(previous, incoming, ['LINK', 'AAPL', 'ETH'])
    expect(merge.news.LINK).toEqual(['L1', 'L2'])
    expect(merge.news.ETH).toEqual(['E1'])
    expect(merge.news.AAPL).toEqual([])
    expect(merge.changedSymbols).toEqual([])
    expect(merge.keptCount).toBe(2)
    expect(merge.emptyCount).toBe(1)
    expect(merge.firstFillCount).toBe(0)
    expect(merge.updateCount).toBe(0)
  })

  it('LINK keep + AAPL first fill + ETH keep', () => {
    const previous = {
      LINK: ['L1'],
      ETH: ['E1'],
    }
    const incoming = {
      LINK: [],
      AAPL: ['Apple earnings'],
      ETH: ['E1'],
    }
    const merge = mergeHoldingNews(previous, incoming, ['LINK', 'AAPL', 'ETH'])
    expect(merge.news.LINK).toEqual(['L1'])
    expect(merge.news.AAPL).toEqual(['Apple earnings'])
    expect(merge.news.ETH).toEqual(['E1'])
    expect(merge.changedSymbols).toEqual(['AAPL'])
    expect(merge.firstFillCount).toBe(1)
    expect(merge.keptCount).toBe(2)
    expect(merge.updateCount).toBe(0)
  })

  it('LINK material update + AAPL empty + ETH keep', () => {
    const previous = {
      LINK: ['old'],
      ETH: ['E1'],
    }
    const incoming = {
      LINK: ['new headline'],
      AAPL: [],
      ETH: [],
    }
    const merge = mergeHoldingNews(previous, incoming, ['LINK', 'AAPL', 'ETH'])
    expect(merge.news.LINK).toEqual(['new headline'])
    expect(merge.news.AAPL).toEqual([])
    expect(merge.news.ETH).toEqual(['E1']) // keep when incoming empty
    expect(merge.changedSymbols).toEqual(['LINK'])
    expect(merge.updateCount).toBe(1)
    expect(merge.keptCount).toBe(1)
    expect(merge.emptyCount).toBe(1)
  })

  it('drops sold symbols not in current list', () => {
    const previous = {
      LINK: ['L1'],
      ETH: ['E1'],
    }
    const merge = mergeHoldingNews(
      previous,
      { LINK: ['L1'], AAPL: [] },
      ['LINK', 'AAPL']
    )
    expect(Object.keys(merge.news).sort()).toEqual(['AAPL', 'LINK'])
    expect(merge.news.ETH).toBeUndefined()
  })

  it('entire incoming empty keeps previous bullets', () => {
    const previous = { LINK: ['L1'], AAPL: [] }
    const merge = mergeHoldingNews(
      previous,
      { LINK: [], AAPL: [] },
      ['LINK', 'AAPL']
    )
    expect(merge.news.LINK).toEqual(['L1'])
    expect(merge.news.AAPL).toEqual([])
    expect(merge.changedSymbols).toEqual([])
    expect(merge.keptCount).toBe(1)
  })
})

describe('symbolNewsFingerprint / symbolHasBullets', () => {
  it('fingerprint ignores order and case', () => {
    expect(symbolNewsFingerprint(['B', 'A'])).toBe(symbolNewsFingerprint(['a', 'b']))
  })

  it('symbolHasBullets', () => {
    expect(symbolHasBullets([])).toBe(false)
    expect(symbolHasBullets(['  '])).toBe(false)
    expect(symbolHasBullets(['x'])).toBe(true)
  })
})

describe('buildHoldingNewsMergeMessage', () => {
  it('describes no changes with prior news', () => {
    const msg = buildHoldingNewsMergeMessage({
      news: { LINK: ['a'] },
      changedSymbols: [],
      firstFillCount: 0,
      updateCount: 0,
      keptCount: 2,
      emptyCount: 1,
    })
    expect(msg).toMatch(/No material new headlines/i)
  })

  it('describes first fill', () => {
    const msg = buildHoldingNewsMergeMessage({
      news: {},
      changedSymbols: ['AAPL'],
      firstFillCount: 1,
      updateCount: 0,
      keptCount: 2,
      emptyCount: 0,
    })
    expect(msg).toMatch(/Added news/i)
    expect(msg).toMatch(/unchanged/i)
  })
})
