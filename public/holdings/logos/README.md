# Holding card logos

Watermark images for portfolio holding cards.

## Layout

```
logos/
  crypto/{symbol}.svg|png   # e.g. btc.svg
  stock/{symbol}.svg|png    # e.g. aapl.svg
  etf/{symbol}.svg|png      # e.g. spy.svg
```

- Filename = **lowercase ticker** only (`BTC` → `btc.svg`).
- Prefer **SVG** (mono-friendly); **PNG** with transparency is fine.
- Missing file → card shows no logo (silent).
- Cash has no logo folder.

## Design tips

- Prefer **brand colors** (or a simple colored mark). The UI applies soft opacity + a diagonal fade only — no monochrome filter.
- Square viewBox (~256×256), logo centered with a little padding.
- Only ship assets you have rights to use.
