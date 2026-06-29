# Hero A/B test - Variant B

A self-contained A/B variant of the landing hero, toggled by a URL query
parameter. Variant A is the existing, unchanged hero. Variant B is an
action-first reframing with a different headline, layout, and CTA.

## How to activate

| URL | Result |
| --- | --- |
| `/` | Variant A (default), unless a choice was remembered |
| `/?variant=b` | Force Variant B (remembered in `localStorage`) |
| `/?variant=a` | Force Variant A (clears the remembered choice) |

A small **Hero A / B** switch pill is rendered in the bottom-left corner on
every load so the toggle is discoverable without editing the URL by hand.
The choice persists across page loads via `localStorage` key
`pmw-hero-variant`.

## What differs

| | Variant A (control) | Variant B |
| --- | --- | --- |
| Headline | "Discover the places we're trying to keep." | "Save a place before it's gone." |
| Subhead | Archive / provenance framing | Action framing: a 5-min phone walkthrough becomes a walkable world |
| Layout | Left-aligned editorial column | Centered column with a "Heritage at risk" badge |
| Primary CTA | "Start exploring" (ghost, -> #worlds) | "Preserve a memory" (solid mint, -> #forms, preselects the *Creator access* program) |
| Secondary CTA | "Upload a memory" (ghost box) | "Tour a live world" (quiet underlined link, -> #worlds) |

Only the **primary hero blocks** (those with an `<h1>`) are rewritten: the
opening carousel slide and the first scroll-track panel. The secondary
story slides (`<h2>`: "A window into places that change fast", "Not just
saved. Entered.") are intentionally left untouched.

## Files

- `assets/variants/hero-variant-b.css` - layout + accent styles, all gated on
  `body.variant-b`; inert for Variant A apart from the switch pill styling.
- `assets/variants/hero-variant-b.js` - reads the query param / stored choice,
  adds the `variant-b` body class, rewrites the primary hero copy + CTAs, and
  renders the switch pill.
- `index.html` - two minimal insertions only: a `<link>` in `<head>` and a
  deferred `<script>` before `</body>`. No existing markup was rewritten.

The controller script runs after the main page module (document order,
deferred), so its injected primary CTA reuses the already-wired
`.form-option` buttons instead of duplicating the program-selection logic.

## Verifying locally

```sh
# from repo root
python3 -m http.server 5803
# open http://127.0.0.1:5803/            -> Variant A
# open http://127.0.0.1:5803/?variant=b  -> Variant B
```

This was verified with a headless-Chromium (Playwright) run driving both
variants at 1280x800: it confirms the headline/CTA swaps, `localStorage`
persistence, the `?variant=a` revert, and that clicking the Variant B primary
CTA selects the `creator-access` form program and scrolls to `#forms` - all
passing with zero console errors.
