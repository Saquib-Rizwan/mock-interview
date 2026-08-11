# Design Brief — Editorial Direction

Written to be pasted into Stitch (or handed to any designer). The point of writing it down is that vague prompts produce generic output, which is the exact problem this redesign exists to fix.

---

## The product

A placement interview preparation platform for engineering students in India. A student picks a target company and role, works through its real interview rounds — aptitude, technical, HR, coding — and answers questions in their own words. Written answers are graded by a language model against a fixed marking scheme. Coding questions run against real test cases in a sandbox.

**Who uses it:** a final-year student, alone, at night, under pressure, for an hour at a time. Usually on a laptop, sometimes on a phone.

**What they are doing:** reading a hard question, thinking, writing, and being told honestly where they fell short.

---

## The direction: editorial

Think a well-made textbook or a serious publication — not a SaaS dashboard, not a startup landing page.

**The governing idea:** this is a place to concentrate. The interface should feel calm, considered and unhurried, so the hard thing on screen is the question, not the chrome. Nothing should sparkle, animate for attention, or celebrate.

**Reference feeling:** the reading view of a good longform site. Stripe's documentation. A quality print magazine's article page.

---

## Typography — the single most important element

The current build uses `system-ui`, which is the strongest tell that an interface was generated rather than designed. Replacing it changes more than everything else combined.

**Headings — a display serif.** `Fraunces` (variable, has real optical sizing) or `Instrument Serif`. Large, tight tracking, used confidently at 36–48px for the primary question. This is the element that makes the whole thing look designed.

**Body and UI — a clean sans.** `Inter` at 16–17px with generous line height (1.6–1.7). Never the same family as the headings; the contrast between serif and sans is the point.

**Code and data — a real mono.** `JetBrains Mono` or `IBM Plex Mono`. Used for test cases, scores, complexity, anything numeric.

**Rules:**
- Measure caps at ~68 characters for reading text. Long lines are the second-biggest tell of an undesigned page.
- Numbers in tables and scores must be tabular-figures so columns align.
- Negative letter-spacing on anything above 24px (about `-0.02em`); serif display type looks loose otherwise.

---

## Colour

**Warm, not grey.** A paper-white background rather than the blue-grey `#f6f7f9` currently used.

Light:
- Background: warm off-white, around `#FAF8F5`
- Raised surface: `#FFFFFF`
- Primary text: near-black with warmth, around `#1A1815` — not `#000`
- Secondary text: around `#6B6660`
- Rules and borders: very light warm grey, around `#E8E4DE`

Dark: keep the warmth. A brown-black like `#14120F`, not a blue-black.

**One accent, used sparingly.** Not indigo, not the generic SaaS blue. Options, in order of preference:
1. Deep forest green `#2F5D50` — calm, studious, uncommon in this space
2. Muted terracotta `#B4543A` — warm, distinctive, pairs well with cream
3. Deep ink blue `#1F3A5F` — safest, still far better than the current indigo

The accent appears on links, the primary action, and focus rings. **Nowhere else.** If more than about 5% of a screen carries the accent, it is being overused.

**Semantic colours stay legible but muted** — a desaturated green, amber and red for pass/partial/fail. They should look like they belong to the same palette, not like traffic lights bolted on.

---

## Layout

- **Asymmetric, not centred-everything.** A left-aligned content column with generous right margin reads as editorial; a centred narrow column reads as a form.
- **Space is the material.** Sections separated by real whitespace, not by boxes. Prefer a hairline rule to a card border.
- **Fewer cards.** Right now everything is a rounded box with a shadow. Most of those should become plain content separated by space and rules. Reserve the card for things that genuinely are discrete objects.
- **Small radii or none.** 4–6px, or square. The 10–14px rounded-everything look is part of the problem.
- **Restrained shadows.** Ideally none in light mode; let borders and spacing do the work.

---

## Screens to design

In priority order. The first three carry the most weight.

1. **Question — written answer.** The core screen. A large serif question, breathing room, a generous answer field, and below it the per-point feedback: each expected point marked covered or missed, with a comment. Feedback must feel like a considered response, not a scorecard.
2. **Progress.** Subject coverage bars ordered weakest-first, a "what you keep missing" list, coding pass rates, company readiness, recent activity. Must feel like a report worth reading, not an analytics dashboard.
3. **Coding workspace.** Problem statement and signature, language switcher, Monaco editor, per-test results. The editor is necessarily a dense technical object — the challenge is making the surrounding page feel like the same product as screen 1.
4. **Companies.** The landing page after login. A list of 10 companies, each with roles. Currently a plain list of boxes.
5. **Round detail.** An ordered list of questions in a round, with category and difficulty.
6. **Login / signup.** Two fields. An opportunity to set the tone immediately.
7. **Role detail.** The rounds of a role, in sequence — this is a *process*, and could be shown as one.
8. **Company detail.** Roles at a company. The simplest screen.

---

## Anti-patterns — do not produce these

These are the specific things that make generated interfaces recognisable:

- A gradient hero, or a gradient anything
- Purple-to-blue accents
- Rounded cards of uniform size in a grid, each with an icon in a tinted circle
- Emoji used as iconography
- Drop shadows on everything
- `system-ui`, Roboto, or Open Sans
- Centred text for anything longer than a heading
- Glassmorphism, neumorphism, or a blurred coloured blob background
- Fake data that looks aspirational — this product has 10 companies and 164 questions, not "10,000+ learners"
- Celebratory language. No "Great job!", no confetti, no streak flames.

---

## Tone of the words

Plain, direct, adult. The product tells students honestly where they fell short — the writing should match.

- "You missed 2 of 5 points" — not "Almost there! 🎉"
- "Not scored yet" — not "No data available"
- "Run tests" — not "Let's go!"

---

## Constraints the design must respect

- **Light and dark both required.** The existing app supports both via `prefers-color-scheme`, and that must survive.
- **No external requests at runtime.** Fonts are installed via `@fontsource` and bundled. No Google Fonts CDN link.
- **Must work at 375px wide.** Students will open this on a phone.
- **Monaco is a fixed quantity.** The code editor comes with its own look; the design has to accommodate it rather than fight it.
- **Existing class names are not sacred** but the component structure is reasonable — this is a restyle, not a rewrite of the React tree.

---

## Suggested Stitch prompt

> Design a web interface for a placement interview preparation platform used by engineering students in India. The aesthetic is **editorial** — like a well-made textbook or a serious longform publication, not a SaaS dashboard.
>
> Use a display serif (Fraunces) for headings at large sizes with tight tracking, and a clean sans (Inter) for body and UI. Warm paper-white background (#FAF8F5), warm near-black text (#1A1815), and a single restrained accent of deep forest green (#2F5D50) used only for links, the primary action and focus rings.
>
> Layout is left-aligned and asymmetric with generous whitespace. Separate sections with space and hairline rules rather than cards. Small border radii (4px). No shadows. Reading measure capped around 68 characters.
>
> The tone is calm and unhurried — the student is concentrating on a hard question. No gradients, no rounded card grids, no icons in tinted circles, no emoji, no celebratory language.
>
> Screen: **[one screen from the list above, described specifically]**

Generate **one screen at a time** and iterate. A prompt asking for the whole app at once produces an average of everything and looks it.
