# Phase 8 — UI redesign ("Vermilion")

Status: **built; builds and lints clean; NOT yet run against the real app.**
Read "What I have not verified" before treating this as done.

The trigger, verbatim, because it is the whole brief: the previous UI looked
like "AI slop", and the site needed to "stand out from all existing ones" —
measured against FACE Prep, InstaPrep and Striver's sheet, which the user
identified as having genuine originality.

---

## Four directions, three rejected

This is the useful part of the record. Each rejection identified something real,
and the final design exists because of them.

### 1. Editorial, warm paper — rejected

Light warm-paper palette (`#FAF8F5`), forest green accent, Fraunces/Newsreader
serif. Verdict: **"too bright and plain."**

Correct. It was tasteful and safe, and safe is how things end up anonymous.

### 2. "Night Edition" — warm dark, brass — rejected

Brown-black ground, ivory ink, burnished brass accent, Newsreader + Inter.
Verdict: still **"screams AI."**

The diagnosis was that the palette was never the problem. Three things were:

- **No visual anchors.** 100% type on flat colour — no mark, no imagery, no
  shapes. Minimal-type-only is the default an LLM reaches for because it is safe
  and cheap, which is exactly why it reads as generated.
- **The companies were plain text.** This is a platform *about* TCS, Infosys and
  Amazon. That is the richest authentic visual content the product owns, and it
  was being rendered as `<span>` in a list.
- **No product shape.** Nothing on screen expressed the thing the product
  actually is: a sequence of interview rounds.

### 3. Night Edition + structure — still rejected, and the tells were named

Added the rail, an identity mark, company monograms and the round spine. Verdict:
**"still generic, repetitive — maybe the colours."**

Three concrete tells were finally identifiable:

1. **Inter.** The single most common typeface in generated interfaces. A serif
   paired with Inter is effectively a fingerprint.
2. **Brass on dark brown.** The "premium AI" cliché — what every model reaches
   for when asked to make something look expensive.
3. **Every list was the same row.** Companies, rounds, verdicts, gaps and bars
   were all "thing left, thing middle, thing right, hairline under". That was
   the repetitiveness.

### 4. "Vermilion" — accepted

A two-colour poster system. Deep ink, cream, one loud vermilion. Syne for
display, Chivo for body, JetBrains Mono for all data.

---

## The system

| Token | Value | Reasoning |
|---|---|---|
| Ground | `#14131A` | Deep ink with a faint violet cast. Not neutral, not warm — it is what makes the vermilion read as ink-on-poster rather than as a warning. |
| Ink | `#F5EDE0` | Cream. Pure white glares here and kills the printed quality. |
| Accent | `#FF4A1C` | Vermilion, used in **solid blocks and thick rules**, never as a tint. |
| Pass | `#46C08A` | The only other semantic hue. |
| Fail | `#FF4A1C` | The accent itself — see below. |
| Display | Syne 700/800, uppercase | Line-height under 1.05, negative tracking. |
| Body | Chivo | |
| Data | JetBrains Mono | Every number in the app, without exception. |
| Radius | 2px | Poster work does not have soft corners. |
| Shadows | none | |

**`--error` is the accent itself, deliberately.** With a red-orange accent, a
separate red for failure would be a near-miss, and two almost-identical reds
meaning different things is worse than one red meaning "look here". A missed
point *is* the thing to look at. That leaves green as the only other semantic
hue, so "medium" difficulty takes a neutral and the scale reads green → neutral
→ vermilion.

### The four signature devices

Originality cannot come from a palette. These are the things that are this
product's own:

1. **The vermilion spine.** The rail's right edge is a 2px vermilion line
   running the full height of every screen. One unbroken stroke that makes two
   unrelated pages read as the same publication.
2. **Registration marks.** Vermilion corner ticks sitting just *outside* the
   answer field, where crop marks sit outside the trim on a printer's proof. It
   ties the printed-edition idea to the one thing the student actually does.
3. **The score as an ink stamp.** Outlined vermilion, rotated **−1.5°** — the
   only element in the app not aligned to the grid, which is why it reads as a
   mark made *on* the work rather than a component rendered into it.
4. **The specimen line.** Question metadata as a catalogue entry: mono, wide
   tracked, vermilion slashes between fields. Replaced a row of pill badges.

### Lists are deliberately not alike

The fix for "repetitive". Each has its own device:

| List | Device |
|---|---|
| Companies | Solid cream logo/monogram block + uppercase display name |
| Rounds | Outlined mono numerals on a connected spine, filling solid on hover |
| Verdicts | Reversed-out marker block, character knocked out |
| Gaps | Mono count in the margin |
| Bars | Chunky 0.7rem solid fills |
| Stats | Large mono figures against 0.65rem tracked labels |

## Company logos

Real logos for **TCS, Infosys, Wipro, Accenture and Zoho**. The other five —
Amazon, Microsoft, Deloitte, Cognizant, Capgemini — have no entry and fall back
to letter monograms automatically, so a missing logo can never render as a
broken image.

Rendered **monochrome**, knocked out of the block, turning vermilion on hover.
Full colour would wreck the palette: Accenture is `#A100FF`, TCS is `#EE3984`.

**No dependency was added.** `simple-icons` was installed, the five path
definitions extracted into `src/components/companyLogos.ts`, and the package
uninstalled — shipping ~3000 icons to use five is not a trade worth making. Cost
is 15KB of path data. Adding a sixth is one line; the format requirements are
documented at the top of that file.

Trademarks belong to their owners and are used to identify the company whose
interview process a question set describes. Nothing implies affiliation.

## Two faults found and fixed during review

Recorded because both were mine and both were real:

**Monogram hues.** The first version hashed a company name onto 0–359°. Against
the real catalogue that put **TCS at 205° next to Infosys at 208°**. Three
degrees apart does not read as "different company", it reads as a bug. A better
hash (FNV-1a) did not fix it — with ten items on a wheel, near-misses are likely
rather than rare. This is the birthday problem, not a weak hash. It was replaced
with a twelve-stop fixed palette, and then dropped entirely when real logos
arrived, because ten tinted tiles diluted a two-colour system.

**Numerals in the display face.** Stat figures were set in Syne, so `23` read as
a small 2 beside a large 3 and `7/12` looked like two numbers on different
levels. `tabular-nums` cannot fix that — the glyphs themselves are uneven. The
rule now is absolute: **the display face never sets numbers, the mono face
does.** `lining-nums` is explicit, because an old-style figure set drops the 7
below the baseline. A "solved out of total" value is additionally split so the
total is half-size and muted — at one size the reader has to work out which
number is the answer.

## New dependencies

Three, all fonts, all bundled rather than fetched:

- `@fontsource-variable/syne`
- `@fontsource-variable/chivo`
- `@fontsource-variable/jetbrains-mono`

Bundled so the app makes **no external request at runtime** and renders
identically offline — confirmed by the build emitting every `.woff2` into
`dist/assets/`. `@fontsource-variable/inter` and `.../newsreader` were
**uninstalled**; they belong to rejected directions.

The paper grain is an inline SVG turbulence filter, not an image.

## Files changed

| File | Change |
|---|---|
| `src/index.css` | Rewritten — Vermilion tokens, grain, base type |
| `src/App.css` | Rewritten |
| `src/main.tsx` | Bundled font imports |
| `index.html` | `color-scheme`, `theme-color`, pre-paint background |
| `components/Layout.tsx` | Rail shell replacing the top bar |
| `components/AppMark.tsx` | **New** — identity mark |
| `components/CompanyMark.tsx` | **New** — logo/monogram block |
| `components/companyLogos.ts` | **New** — logo path data |
| `components/Breadcrumbs.tsx` | Slash separators |
| `pages/monacoTheme.ts` | **New** — Monaco in the app palette |
| `pages/QuestionDetail.tsx` | Eyebrow, headline question, word count, stamp, registration marks |
| `pages/CodingWorkspace.tsx` | Theme, mono face, verdict marks |
| `pages/Progress.tsx` | Split score/total figures |
| `pages/Companies.tsx`, `CompanyDetail.tsx`, `RoleDetail.tsx` | Logo blocks, round spine |

`index.html` carries an inline `html { background: #14131a }`. Without it the
browser paints white for the first frame.

This is a restyle plus a shell change — no page's data flow was altered.

## What I verified myself

- `npm run build` — typechecks and builds clean
- `npm run lint` — clean
- Every font `.woff2` emitted locally; no CDN reference in the output
- Logo coverage checked against the real `data/catalog.json`, not assumed
- Rendered the real built stylesheet against representative markup in a browser

## What I have **not** verified

- **The real app has never been opened.** Everything was checked against a
  static preview page, not the running frontend with the backend and database
  behind it. Real content lengths — a very long question, a company with one
  role, an empty round — are unproven.
- **Monaco's theme has not been seen.** It is written and typechecks, but no
  coding question has been opened with it. Judge0's VM is deallocated.
- **Mobile is unproven.** The rail has a stacking fallback and type uses
  `clamp()`, but nothing has been opened at 375px.
- **Contrast ratios were designed, not measured.** `--muted` (`#857E77`) on the
  ground is the value most likely to fail WCAG AA at small sizes, and it carries
  breadcrumbs and section labels.
- **The rail fetches the company list on every navigation.** Deliberately
  failure-tolerant — if it errors the strip does not render, because chrome must
  never be why a page fails to appear. No cache; that would remove the repeat.
- **The spine shows sequence, not state.** Rounds are not marked done, current
  or unstarted, because the catalogue endpoint returns no per-user progress.
  Wiring that in needs an API change and was **not** pulled forward into this
  phase.
- **Five companies have no logo**, as listed above.

## How to check it

Database, backend and frontend running as usual. Judge0 only for coding rounds.

1. **Log in.** Confirm no white flash on load. The card sits on the ink ground
   with no shadow.
2. **Companies.** Five real logos, five letter blocks, all cream. Hovering a row
   should turn the block and the name vermilion.
3. **A role.** Rounds as a connected spine with mono numerals; the node fills
   solid vermilion on hover.
4. **A written question.** The question is the headline; the subject is a solid
   vermilion eyebrow above it. Check the registration ticks at the corners of
   the answer box, and a long question still reading well.
5. **Answer it.** Word count updates. The score lands as a rotated outlined
   stamp above the point list.
6. **Progress.** Figures in mono and aligned — check `7/12` reads as one number,
   not two. Bars chunky and solid. "Not scored" still distinct from 0%.
7. **A coding question** (needs `az vm start -g mock-interview-rg -n judge0-vm`).
   The editor should now match the page rather than arriving grey.
8. **Resize to phone width.** The rail lies down into a bar; the company strip
   is dropped by design.

---

## In plain English

The old interface was not broken, it was anonymous. Every screen used the same
handful of moves — put the content in a rounded box, give it a border and a soft
shadow, tint the important words, line the boxes up in a grid. That vocabulary
is everywhere because it is the path of least resistance, and it is exactly why
the result looked generated rather than designed. It took three attempts to work
out that changing the colours inside that structure could never fix it, because
the structure was the problem.

What replaced it is a poster. There are almost no boxes left: lists are rows
divided by rules, sections are separated by thick vermilion lines you can read
from across the room, and nothing has a shadow. The type does the work — a heavy
display face set tight and mostly in capitals, with every single number in the
app set in a monospace face instead, which is what fixed the figures that looked
misaligned. The question you are answering is the biggest thing on its screen,
where the word "Networks" used to be.

The parts that make it specifically *this* product are the ones that took
longest to find. Your companies now appear as real logos rather than as text.
The rounds of a role are drawn as a connected sequence, because a hiring process
is a sequence. There is a vermilion line running down the side of every screen
so two unrelated pages feel like the same publication, corner ticks around the
answer box borrowed from printers' proofs, and the score lands as a stamp set a
degree and a half off straight — the only thing in the app not aligned to the
grid, which is why it feels like a mark made on your work rather than a box the
software drew.

One thing to be straight about: this has been built and looked at rendered, but
it has never been run with your real questions in it. The list of what that
leaves unproven is above and it is not short. Nothing is committed.
