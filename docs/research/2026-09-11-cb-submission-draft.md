# Sourced — Consumer Behaviour Project Write-Up (Working Draft)

**⚠️ Two things I can't fill in — check your original assignment sheet:**
1. The pasted brief had the "Project Objective" paragraph with its actual
   content missing (blanks where the objective/behaviour-change statement
   should be — likely lost in copy-paste from a slide). I haven't
   fabricated a guess at the exact wording; the opening section below
   states it in my own words, but if your assignment sheet has a specific
   required phrasing, use that instead.
2. The brief says "Your project should answer four fundamental questions"
   but the actual four questions were also blank in what got pasted here.
   If you have the original doc/slide, send me those four questions and
   I'll make sure every section explicitly answers all four, rather than
   guessing what they were.

---

**Status, 2026-09-12:** Deadline is tonight at midnight. This draft is written
now, in parallel with real interviews, so nothing is starting from zero once
transcripts land. Every section below is marked:

- 🟢 **Grounded** — built from real, already-collected evidence (the app's
  own production data, competitor research already done for this project)
- 🟡 **Provisional** — a reasoned working draft, written the way the
  assignment's own examples are written (mechanism, not assumption), but
  **not yet checked against real interview transcripts** — revise this first
  once transcripts arrive, don't treat it as finished
- ⚪ **Pending** — genuinely can't be written until interview data exists

---

## Project Objective 🟡 (my own wording — replace with the sheet's exact phrasing if it differs)

Conceptualise and develop a prototype of an app designed to reduce
uncritical, single-source news consumption. The objective is to make
cross-source comparison and source-transparency the *default*, low-effort
path rather than an optional extra readers rarely take. The app serves as
a vehicle for demonstrating our ability to apply Consumer Behaviour
concepts — motivation, effort/friction, framing, heuristics, the Hook
Model, reinforcement, identity and social influence — to understand why
readers don't compare sources despite wanting to, and to deliberately
design experiences (not just features) that shift that behaviour.

---

## Part A — App Overview & the Behavioral Problem 🟡

**App:** Sourced — a news app for India that puts multiple outlets'
coverage of the same event side by side, shows who owns each outlet, flags
where outlets disagree, and gives readers a personal (not editorial)
read on their own news-consumption lean.

**The problem, stated as a behavioral gap, not an assumption:**

> People don't avoid comparing news sources because they don't care about
> bias — most say they do. They avoid it because, in the moment, comparing
> a second source is unrewarded extra effort layered on top of an action
> (reading the news) that already felt complete. The habitual default —
> whichever outlet is already open, already trusted, already easiest — wins
> by default, not by preference, and each unchecked repetition reinforces
> the same single-source habit loop.

**Why we believe this, from evidence rather than intuition (🟢 grounded in
real product data, not survey — real interviews are what upgrades this from
"the supply side looks this way" to "here's the individual mechanism"):**

Diagnostic work on Sourced's own article corpus (53 curated Indian outlets,
~30k stories) found that when two different outlets DO cover the same
event, the platform-level signal that would let a reader compare them
(co-clustering into one "story") was being lost for structural reasons having
nothing to do with reader behavior — average cross-outlet similarity for a
matched pair was only ~0.70 on a scale where the matching threshold was
0.86. Once that infrastructure gap was closed, the corpus's genuinely
multi-source share is capped by a natural ceiling around ~35-39%: even with
perfect technical matching, most individual stories are only ever covered by
one outlet at all — so cross-source comparison, even for a maximally
motivated reader, is only ever *possible* for roughly a third of what's in
the feed. That's a supply-side constraint the product has to design around,
not fight — the design goal isn't "get everyone comparing everything," it's
"remove the friction for the third of stories where comparison is possible,
and be honest about the two-thirds where it isn't" (the "Not yet covered
by..." pattern instead of silence).

**Mechanisms likely at play** (to validate/refine against interviews):
motivation-behavior gap (want balanced news, but comparing isn't the
default action); effort discounting (a second lookup costs real steps —
open another app, search, reconcile two versions — against an immediate,
already-satisfied "I read the news" feeling); habit (the news app/source
that's already on the home screen wins on autopilot, not consideration);
attention (a single-source story doesn't visually signal that anything is
missing — silence reads as completeness, not as a gap).

---

## Part B1 — Consumer Persona 🟡 (provisional — replace with the real
modal pattern once transcripts land)

**"Ananya," 24, first full-time job, lives in a metro, shares a flat.**

- **Lifestyle/context:** Phone-first for everything. News mostly arrives
  secondhand — a WhatsApp forward from a family group, an Instagram Reel,
  a headline glanced at during a commute. Opens a dedicated news app
  rarely, and mostly when something's already blowing up elsewhere.
- **Needs/motivations:** Wants to not be caught out not knowing something
  "everyone's talking about." Doesn't want to feel manipulated, but doesn't
  have a reliable method for checking that beyond gut feel ("that source
  always sounds dramatic").
- **Goals:** Stay reasonably informed without it becoming a chore or a
  doomscroll session.
- **Frustrations:** Suspects most outlets lean one way or another but
  doesn't know which, or how to find out without a lot of digging. Has been
  embarrassed once or twice repeating something that turned out to be
  spun or wrong.
- **Current behavior:** Consumes whatever surfaces via social/family
  channels; almost never deliberately opens a second source to check a
  story; trusts video/commentary creators more than "the news" as an
  institution, for reasons she hasn't fully examined.
- **Attitudes:** Skeptical of legacy media in the abstract, but that
  skepticism doesn't currently translate into any actual comparison
  behavior — it just lowers general trust across the board.
- **Social influences:** Cares what her friend group thinks; news comes up
  in conversation and she doesn't want to be visibly wrong or visibly
  credulous.
- **Tech/app behavior:** Everything is an app or a feed; she does not
  bookmark, does not subscribe, does not "go looking" — content has to
  arrive to her or she won't see it.

---

## Part B2 — Consumer Research ⚪→🟢 (in progress)

Method: qualitative interviews, minimum 5 participants, deliberately
recruited across a range of news habits (heavy consumer, doom-scroller,
avoider, secondhand-only) rather than similar peers. Full script:
`docs/research/2026-09-11-consumer-interview-guide.md` (also published as
[a formatted guide](https://claude.ai/code/artifact/c4fed414-439a-4626-b24d-a18fdbb2387a)).
Seven sections: news-habit warm-up → intention/behavior gap → friction/effort
→ algorithm fatigue/doom-scrolling → social/identity → trust/bias awareness
→ real app screens shown last (so they don't anchor earlier answers).

**This section gets filled in as transcripts arrive** — each major insight
written as Observation → Behavioral insight → Design implication, per the
assignment's required format. Nothing here yet.

---

## Part C — Consumer Behaviour Diagnosis 🟡

Applying real CB mechanisms to what the app actually does, not just naming
theories:

**1. Motivation — approach/avoidance, not just "low motivation."**
Readers aren't unmotivated to get balanced news (an *approach* goal); they're
avoiding the specific *sub-task* of cross-checking, because it's effortful
and its payoff (being "more correct") is abstract and delayed compared to
the immediate payoff of just finishing the article they're on. Sourced's
Compare/Single-source tabs and the source-count badge convert an invisible,
effortful sub-task into a visible, zero-effort one: the comparison is
already done and sitting on the card before the reader decides whether they
care. This reduces the *behavior* required from "go find a second source"
to "notice a badge that's already there" — moving the whole mechanism from
approach-motivated search to passive perception.

**2. Perception & framing — silence vs. an honest gap.**
An unmarked single-source story and a genuinely well-corroborated one look
identical by default — silence reads as completeness. The "Not yet covered
by [N outlets]" pattern reframes an absence as a *stated fact* instead of an
invisible one, which is a framing effect: the same underlying data (one
article, no cross-checks) now perceptually signals "unverified" instead of
"normal," without requiring the reader to do any comparison work themselves
to notice it.

**3. Memory & retrieval cues.**
Outlet favicons/marks and ownership-flag icons work as retrieval cues —
they let a reader who has previously formed an opinion about an outlet
("that channel is always sensational") retrieve that association at a
glance, at the point of reading, rather than requiring them to recall it
from scratch or go look it up. This only works because the cue is placed
exactly where the relevant decision (how much to trust this) happens.

**4. Decision-making — heuristics over deliberation.**
Most readers use System-1 heuristics for source trust ("that account always
sounds dramatic") rather than System-2 deliberation (actually checking
ownership, comparing wording). The app doesn't try to force System-2
processing across the board — it supplies a small number of pre-computed,
low-effort heuristic cues (ownership flag, verdict pill, compass zone
color) that are *cheap enough to use System-1-style* while being backed by
real research, rather than demanding the reader do the research themselves.

**5. Social influence & identity — see Part F.**

**6. Involvement & perceived risk.**
News is mostly low-involvement, habitual consumption — which is exactly why
a high-effort "go compare sources" ask fails: it demands high-involvement
behavior from a low-involvement moment. The design bet is to keep the
correction low-involvement too (a badge, a color, a count), rather than
trying to convert news-reading into a deliberate research activity.

---

## Part D — Design the Hook 🟡

**Target micro-habit (specific, not a broad outcome):**

> When I read a news story and something about it makes me hesitate — a
> claim that sounds off, a headline that feels one-sided — instead of just
> shrugging it off or closing the app, I open Sourced and check what else is
> being said about it.

| Hook Stage | Guiding question | Sourced's plan | CB principle |
|---|---|---|---|
| **Trigger** | What starts the behavior? | **External, real and shipped:** a reader shares their compass badge (a rendered image, not a link) via WhatsApp/Instagram; the *person who receives it* — not the sharer — is the one the trigger is really for. Seeing a friend's specific, personal result is a concrete social-proof/reference-group cue (Cialdini) that a generic "download this app" ad isn't — it prompts "what would mine look like?" rather than a cold pitch. This is the acquisition path *in lieu of* the quiz being the only way in. **Also external:** a push notification when a viewed story gets a new conflicting fact-check verdict. **Internal:** the moment of hesitation/suspicion itself ("that sounds off") becomes the trigger once the app has been used enough that "check Sourced" is the learned response to that feeling. | External triggers only work early; the goal is for the internal trigger (suspicion) to take over — that's the actual habit, not the notification. The shared-badge trigger specifically leverages social proof/reference-group influence, not just reminder-based cueing. |
| **Action** | What's the simplest next behavior? | Open the app → the story is already on the feed with its comparison state visible (Compare/Single-source badge, "Not yet covered by" line) — no search, no second app, no manual cross-referencing. The comparison itself requires zero additional steps once the app is open. | Fogg-style: minimize physical/cognitive steps between trigger and payoff. |
| **Variable reward** | What does the reader get? | **Reward of the Hunt:** finding out whether a story is corroborated or contested is itself variable and unpredictable — some stories are clean, some reveal a real conflict, and the reader doesn't know which until they look. **Reward of the Self:** the compass/profile screen gives a private sense of "I checked my own bias this week," a small mastery/competence signal. | Variable reward keeps the check itself interesting rather than rote — a story that's *always* clean would extinguish the checking habit fast. |
| **Investment** | What does the reader put in that makes the next use better? | Answering outlet-lean polls (feeds the compass), saving stories to lists, viewing history (which stories/outlets they've actually engaged with). Each of these makes the *next* visit more personally relevant (a more accurate compass position, a curated list) without being effortful — investment is incidental to normal use, not a separate task. | Investment should load the next trigger, not just flatter the user — a more accurate compass is itself a reason to come back and see it move. |

---

## Part E — Reinforcement & Learning 🟡

- **Variable-ratio reinforcement (checking outcome varies):** most stories a
  reader checks will be clean/corroborated; occasionally one reveals a real
  conflict flag or a "Misleading" verdict. This unpredictability is what
  should keep the checking behavior itself reinforcing, rather than the
  behavior extinguishing once the reader learns "it's always fine."
- **Compass drift as delayed, cumulative reinforcement:** a single poll
  answer moves the compass position only slightly (a small operant
  reinforcement per response); the visible weekly movement is a slower,
  cumulative signal, which should encourage repeated small engagements
  rather than one-off large ones.
- **Risk of reinforcement crowding out intrinsic motivation, and how the
  design tries to avoid it:** the compass and verdict badges are explicitly
  *not* gamified with streaks, points, or leaderboards — deliberately, per
  this project's own anti-algorithm/social-capital product philosophy (from
  coursework: the aim is genuine information-seeking, not manufactured
  engagement). The bet is that extrinsic reward mechanics (streak counters,
  point totals) would risk making "checking sources" feel like a task
  performed for the score rather than for the information — undermining the
  exact intrinsic motivation (wanting to actually know what's true) the
  product is trying to serve. This is a real design trade-off, not a free
  win: it likely costs some retention/engagement relative to a
  streak-gamified version, made deliberately.

---

## Part F — Identity, Social & Cultural Layer 🟡

**"This app helps me compare news." vs. "This app tells me something true
about how I actually see the world."** Sourced deliberately reaches for the
second. The compass gauge doesn't just serve the reader's *task* (comparing
sources); it gives them a durable, semi-public **identity artifact** — a
number and a zone that represents where they personally sit — which
research into this exact space (Ground News, Verity, The Balanced News)
found no direct competitor offers as a public-facing identity marker (Ground
News's equivalent is private-only). This is the product's actual
differentiation, not the comparison feature itself, which several
competitors also do in some form.

**Shipped, not hypothetical:** the badge is now literally shareable as an
image (native share sheet, `components/ShareableCompassBadge.tsx`) —
turning the identity artifact into something that leaves the app entirely
and travels through the reader's own social graph. This is symbolic
consumption in the most direct sense the assignment's own concept list
names it: the badge is consumed and displayed *as a statement about the
self*, not for its utility. A new "Discover" tab (seeded with demo
profiles for now) also lets readers browse other people's badges and
curated picks — reference-group comparison made literally browsable, not
just implied.

- **Identity signaling:** a reader who's confident in their "balanced" zone
  has a genuine, shareable claim about themselves, distinct from just
  reading the news.
- **Social comparison:** the distribution view (where the reader sits
  relative to others) invites comparison without ranking — deliberately no
  leaderboard, consistent with the anti-algorithm philosophy above.
- **Reference-group tension worth naming as a real risk, not glossed over:**
  a reader whose social circle skews toward one political lean may
  experience their own accurate compass position as socially costly to
  reveal, even privately — the design choice to keep the detailed
  distribution view visible only on the reader's *own* profile (not full
  public exposure) is a direct mitigation, but the tension isn't eliminated.
- **Cultural context:** ownership-flag icons carry real weight in the
  Indian media context specifically (concentrated conglomerate ownership of
  major outlets is a live public conversation) — this is a culturally
  specific instrument, not a generic "transparency" gesture that would read
  the same in every market.

---

## CB Theory Map

| App Feature | Consumer Insight | CB Concept/Theory | Why Theory Predicts It Will Work | Expected Behaviour |
|---|---|---|---|---|
| Compare/Single-source tabs + source-count badge | Readers want balanced news but won't do the extra work of finding a second source themselves | Effort/friction reduction; System 1 heuristic processing | Removing the *action* required (search for a 2nd source) converts an avoidance-prone task into a zero-effort perception | Readers notice comparison state passively, without deliberate search behavior |
| "Not yet covered by..." silence signal | Silence (no comparison shown) reads as "nothing's missing," not as a gap | Framing effect; perceptual salience | Naming the gap explicitly changes what the same underlying state (single-source) signals to the reader | Readers treat single-source stories with more caution than before, without extra research effort |
| Outlet favicons + ownership-flag icons | Readers rely on gut-level source trust, not researched trust | Retrieval cues; heuristic-based decision-making | A recognizable cue at the point of decision lets an existing attitude be retrieved cheaply, at the moment it's useful | Faster, more consistent trust judgments per outlet across sessions |
| Fact-check verdict pills | Readers default to binary "true/false" gut calls on contested claims | Categorization; framing (color + label) | A pre-computed, colour-coded verdict substitutes for effortful deliberation without asking the reader to do the checking themselves | Readers update belief on a specific claim without independently researching it |
| Compass gauge + weekly drift | No competitor gives readers a *public* personal-lean identity marker (private-only elsewhere) | Self-concept; identity signaling; symbolic consumption | A durable personal artifact gives readers something to say about themselves, not just a tool to use | Repeated voluntary engagement (poll answers) beyond the minimum needed for any single article |
| Shareable badge image (native share sheet) + Discover tab | People install apps their friends show them, not apps that advertise at them | Social proof; reference-group influence (Cialdini) | Seeing a specific friend's specific result prompts "what would mine be?" — a personal cue an ad can't replicate | Install/quiz-start events attributable to a shared badge rather than the quiz being the only entry point |
| No gamification (no streaks/points/leaderboard) | Manufactured reward risks crowding out genuine interest in accuracy | Intrinsic vs. extrinsic motivation | Removing extrinsic scoring keeps the *reason* for checking tied to wanting real information, not a score | Engagement driven by curiosity/suspicion triggers rather than habit-loop point-chasing |
| Discovered sources ("Also found via search") kept separate from Compare | Treating unvetted sources as equal to curated ones would undermine trust in the vetted set | Categorization integrity; trust transfer | Keeping the unscored tier visually and structurally distinct protects the credibility signal the scored tier relies on | Readers extend less automatic trust to "discovered" sources than to core outlets |

---

## Part G — The Prototype

Coding wasn't required (a 6-8 screen mockup would satisfy this), but Sourced
is a real, shipped, working app (Expo/React Native + Supabase), which is the
strongest possible version of this requirement — every design decision below
maps to something actually live, not a mockup guess.

Screens to include in the submission (each captioned with its behavioral
rationale, drawn from Parts C-F above):

1. **Feed — Compare tab** (multi-source stories, source-count badges) —
   the effort-reduction mechanism from Part C.1.
2. **Feed — Single-source tab** — shows the honest, unhidden other half of
   the corpus (Part A's supply-side finding), not swept under the rug.
3. **Story page — "Not yet covered by" silence signal** — Part C.2's framing
   mechanism.
4. **Story page — outlet favicons, ownership flags, fact-check verdict
   pill** — Part C.3/C.4's retrieval-cue and heuristic mechanisms.
5. **Compass gauge (quiz result or profile)** — Part F's identity-layer
   differentiator.
6. **Profile — compass distribution + weekly movement** — Part D's
   investment/variable-reward loop.
7. **Methodology screen** — where ownership/bias scoring is explained,
   supporting the trust mechanism without requiring the reader to take it
   on faith.
8. **List detail** — the low-effort "investment" artifact from Part D.
9. **Discover tab** — browsing other readers' badges/curated picks, the
   reference-group/social-comparison mechanism from Part F made concrete.
10. **Share sheet with the rendered badge image** — the real external
    trigger from Part D's Hook Model, not a mockup of one.

(Screenshots to be captured from the current build and inserted before
submission — the app is live and running, so this is a capture task, not a
design task.)

---

## Part H — Consumer Journey (bonus) 🟡

**Riya, 24, is scrolling Instagram at 11:40 PM.** A Reel claims a new
government policy will hurt small shopkeepers; the comments are split
between outrage and "this is fake, check a real source." She doesn't know
which to believe, and it's late.

| Stage | What she's doing | What she's thinking/feeling | CB mechanism | App response |
|---|---|---|---|---|
| Trigger | Sees the claim in the comments dispute | Suspicion, mild anxiety about being misled either way | Internal trigger (hesitation) | — |
| Action | Opens Sourced instead of googling the claim manually | Wants the *fastest* answer, not a research project | Effort-minimization (Part D, Action) | Searches/finds the story already clustered with multiple outlets' coverage |
| Perception | Sees a source-count badge and a fact-check verdict pill on the story | Relief that the comparison is already done | Framing, heuristic processing (Part C) | Verdict pill + outlet spread visible immediately, no extra taps |
| Reward | Reads a one-line "Misleading — policy applies only to X category, not all shopkeepers" verdict | Feels resolved, slightly more confident than before | Variable reward (Part D) — this time the check paid off with real new information | — |
| Investment | Saves the story to a "policy watch" list she keeps | Small act of ownership over the topic | Investment loop (Part D) | List entry increases the odds she opens the app again for related updates |

---

## Part I — Measuring Whether the App Works (bonus) 🟡

Not downloads/DAU/time-in-app. The target behavior is *checking a second
source when something feels off*, so the metric has to observe that
specifically:

| Question | Metric |
|---|---|
| Are readers actually comparing sources, not just seeing that they could? | % of story views on multi-source stories where the reader expands/views more than one outlet's coverage, not just the founder article |
| Is the silence signal changing behavior, not just being displayed? | Click-through rate on "Not yet covered by" vs. on stories with no such marker |
| Is the compass being used as a real reflection tool, not a one-time novelty? | Return rate to the profile/compass screen in weeks after the first visit (not just first-week engagement) |
| Is trust calibration actually happening? | Self-reported source trust before/after sustained use (interview or lightweight in-app prompt), compared against actual ownership/bias data |

**Primary metric, if forced to pick one:** *% of viewed multi-source
stories where the reader engages with more than one outlet's coverage* —
this is the one metric that can't be satisfied by passive scrolling or
downloads; it only moves if the actual target behavior (comparing) is
happening.
