# Sourced — Consumer Behaviour Presentation: Master Context File

**Purpose of this file:** everything needed to build an 18-20 slide
presentation for a Consumer Behaviour (CB) course submission, in one place.
This is written so it can be handed to *any* LLM (not just Claude) with no
other context and still produce a coherent, well-grounded deck. If you are
an LLM reading this to build slides: read this entire file before drafting
anything — the sections build on each other (don't start from the Slide
Outline alone; the earlier sections are what make the slides defensible,
not decorative).

---

## 0. Instructions for whoever builds the deck

- **Target: ~18-20 slides.** Group members' names are a **placeholder for
  now** — leave a "Team" slide with blank/TBD names, do not invent names.
- **Match the app's actual visual identity** (exact tokens in Section 1) —
  this is a real, shipped product, not a concept, so the deck should look
  like it belongs to the same brand, not a generic slide template.
- **Screenshots are pending** — the presentation should have clearly marked
  placeholder slots (e.g. "[SCREENSHOT: Feed — Compare tab]") for real
  screenshots to be dropped in later. List of needed screenshots is in
  Section 7 (Part G).
- **Every claim should trace to a section below** — this deck is for a
  course that specifically penalizes generic, unsupported claims ("students
  want to be healthy") in favor of real mechanism-level reasoning ("students
  don't forget they want to exercise, they postpone because..."). Preserve
  that standard in the slides — don't flatten the nuance into buzzwords.
- **Where findings are marked 🟡 provisional or based on n=1**, say so on
  the slide too (e.g. a small "preliminary — 1 of 5 interviews" tag) rather
  than presenting early findings as fully confirmed.

---

## 1. Product & Brand Identity

**App name:** Sourced. **Category:** news/media-literacy app for India.
**One-line description:** puts multiple outlets' coverage of the same
event side by side, shows who owns each outlet, flags where outlets
disagree, and gives readers a personal (not editorial) read on their own
news-consumption lean.

**Visual identity (exact tokens — copy precisely, do not approximate):**
- Colors:
  - `textPrimary` (body text): `#111827`
  - `textSecondary` (muted text): `#667085`
  - `border`: `#D9DDE3`
  - `surfaceSubtle` (light fill): `#EEF0F2`
  - `background` (white): `#FFFFFF`
  - `surfaceElevated` (off-white): `#F7F7F5`
  - `primary` (main accent, buttons/links): `#315A9B`
  - `navy` (deep accent, "critical" compass zone): `#0B1B33`
  - `emphasis` (bright accent, "friendly" compass zone): `#3F4FC4`
  - `red` (errors/alerts): `#D9382E`
  - Verdict colors (fact-check pills): True `#1B7A3D` on `#E6F3EA`; False
    `#C42B21` on `#FBEAE9`; Misleading `#8A6410` on `#FBF1E1`; Unverified
    `#55606E` on `#EEF0F2`
  - Compass/poll colors: critical = navy `#0B1B33`, balanced = primary
    `#315A9B`, friendly = emphasis `#3F4FC4`
- Typography: **Source Serif 4** (headlines/serif, weight 700) paired with
  **Sora** (UI/body, weight 400 regular / 600 semibold). Editorial serif
  headline + clean geometric sans UI chrome — chosen deliberately over
  Inter/generic-SaaS sans to avoid reading as "another startup app."
- Aesthetic direction: "Modern Data Product" — cool-neutral navy/charcoal
  palette (chosen over warm/corporate-startup colors after research showed
  cool-neutral reads as the financial-UI "trust" signal convention, not a
  generic safe default).
- Iconography: Ionicons throughout (outline style for most UI, filled for
  active/selected states).

**Product philosophy (from the founder's own coursework, a real constraint
on every design decision, not just flavor text):** deliberately,
philosophically **anti-recommendation-algorithm**. No content
personalization, no engagement-optimized ranking — the founder's stated
reasoning is that personalization creates echo chambers and would defeat
the app's own purpose. Features favor **self-expression and self-curation**
(lists, streaks, polls, profile badges) over anything that infers
preference and ranks content accordingly. This is a *social capital*
framing: people use apps partly to visibly signal identity/values/
awareness to others (cited comparison: Letterboxd's success via
self-curated identity expression, not a recommendation engine).

---

## 2. Competitive Landscape (real research, not assumption)

- **Ground News** (largest global player): L/C/R political-lean labels +
  "Blindspot" (silent/missing-coverage detection) — conceptually close to
  Sourced's own silent-outlet feature. Its personal bias-tracking equivalent
  ("My News Bias") is **private-only**, never a public/shareable badge.
- **Verity** (verity.news): ML bias detection across 5,000+ sources,
  separates fact from narrative framing.
- **AllSides**: side-by-side same-story framing by political lean.
- **Ad Fontes Media**: bias/reliability chart. **NewsGuard**: 0-100 site
  trust score.
- **The Balanced News** (India-specific, closest direct competitor):
  AI bias detection across 50+ Indian sources, a "Lens Score" for
  under-reported stories, adjective/loaded-language analysis, free.
- **FactChecker.in**: India-focused fact-checking since 2013.

**Genuine differentiators Sourced has that this category generally
doesn't:** (1) **ownership/conflict-of-interest flagging** — an outlet's
owner mentioned favorably in its own story gets flagged; (2) fact-check
verdict matching directly on the story; (3) reader polls per outlet
(crowd-sourced "did this feel balanced?" signal); (4) a **public,
shareable, personal identity badge** (compass position) — every competitor
surveyed keeps this private-only or doesn't have it at all; (5)
India-specific govt-lean/sensationalism/press-freedom axes instead of the
US-shaped left/right axis most global competitors default to (arguably
more honest for Indian politics, where the left/right frame doesn't map
cleanly). **The "compare outlets + flag silent coverage" mechanic itself is
shared category convention, not something unique to Sourced** — the pitch
should lead with ownership-flagging + the public badge, not "we compare
outlets."

---

## 3. Project Objective

> Conceptualise and develop a prototype of an app designed to reduce
> uncritical, single-source news consumption. The objective is to make
> cross-source comparison and source-transparency the *default*, low-effort
> path rather than an optional extra readers rarely take. The app serves
> as a vehicle for demonstrating the ability to apply Consumer Behaviour
> concepts — motivation, effort/friction, framing, heuristics, the Hook
> Model, reinforcement, identity and social influence — to understand why
> readers don't compare sources despite wanting to, and to deliberately
> design experiences (not just features) that shift that behaviour.

**⚠️ Known gap:** the original assignment brief's exact required wording
for this section, and a referenced "four fundamental questions the project
should answer," were lost in a copy-paste before this file was written. The
paragraph above is a reasoned substitute, not the verbatim required text —
check the original assignment sheet and swap in exact wording/questions if
they differ.

---

## 4. Part A — The Behavioral Problem

**Stated as a behavioral gap, not an assumption:**

> People don't avoid comparing news sources because they don't care about
> bias — most say they do. They avoid it because, in the moment, comparing
> a second source is unrewarded extra effort layered on top of an action
> (reading the news) that already felt complete. The habitual default —
> whichever outlet is already open, already trusted, already easiest —
> wins by default, not by preference, and each unchecked repetition
> reinforces the same single-source habit loop.

**Grounded in real product data:** diagnostic work on Sourced's own live
article corpus (53 curated Indian outlets, ~30k stories) found that even
when two outlets DO cover the same event, the corpus's genuinely
multi-source share is capped by a natural ceiling around **35-39%** — most
individual stories are only ever covered by one outlet at all. So
cross-source comparison, even for a maximally motivated reader, is only
ever *possible* for roughly a third of the feed. Design goal isn't "get
everyone comparing everything" — it's "remove the friction for the third
where comparison is possible, and be honest about the two-thirds where it
isn't" (a "Not yet covered by..." pattern instead of silence).

**Revised after real interview data (Subject 1, see Section 5) — the more
interesting, evidenced version of this problem:** the original hypothesis
above framed the gap as pure effort-friction. Subject 1's actual account is
more specific: they *already* detect bias reliably, and their response to
suspected bias isn't "seek a second source" — it's to **disengage
entirely**, driven by a learned belief that no source is trustworthy
("there is no newspaper which I can trust which shows it as it is"). That's
**learned cynicism, not effort-avoidance** — comparison is skipped because
it's believed pointless, not because it's hard. Effort still matters (the
one case this subject *does* compare is zero-navigation adjacency), but
effort-reduction alone doesn't address "why bother, it's all biased
anyway." This needs more interview subjects to confirm as a general
pattern, not just one account.

---

## 5. Part B1 — Persona (provisional) & Part B2 — Real Consumer Research

**Persona "Ananya," 24** (provisional, pending more interviews to find the
real modal pattern): phone-first, news arrives secondhand (WhatsApp
forwards, Reels, headlines glanced at during a commute), rarely opens a
dedicated news app. Wants to not be caught out not knowing something
"everyone's talking about," doesn't want to feel manipulated but has no
reliable method to check that beyond gut feel. Skeptical of legacy media in
the abstract, but that skepticism doesn't translate into comparison
behavior — it just lowers general trust across the board. Cares what her
friend group thinks; doesn't want to be visibly wrong or visibly credulous.

**Real research method:** qualitative interviews, minimum 5 participants,
deliberately recruited across a *range* of news habits (heavy consumer,
doom-scroller, avoider, secondhand-only) rather than similar peers, to
avoid generic/confirmatory findings. Semi-structured script, 7 sections:
news-habit warm-up → intention/behavior gap → friction/effort → algorithm
fatigue/doom-scrolling → social/identity → trust/bias awareness → real app
screens shown **last** (so they don't anchor earlier answers). Consent
obtained verbally before recording; participants referred to by pseudonym.

**Second persona, "Meera," 24, Master's in Sociology, avid daily reader**
(grounded directly in Subject 2 below): reads a newspaper every morning,
plus a headlines app, Instagram, Telegram, TV. Checks news 2-3x/day
deliberately. Wants to understand *why* a story is framed a certain way,
not just what happened. Actively resents algorithmic curation as a loss of
agency. Maintains a mental "list of authors" by known political lean and
deliberately reads across them — manual triangulation as a practiced
skill. **Provisional read at n=2: Ananya and Meera may be two ends of a
real segment split (disengaged-cynic vs. active-triangulator) rather than
one modal persona** — see the contrast note after the Subject 2 table
below.

**Status: 2 of minimum 5 interviews complete.** Subject 1 ("Rahul,"
working professional, non-daily news reader — primary source is Android's
Google Discover feed, not a dedicated news app; last deliberate news search
was a month ago, for job-interview prep). Findings below are real but
preliminary.

| Observation (what was said) | Behavioral insight | Design implication |
|---|---|---|
| "I don't think I always get one side... both sides are extreme... there is very [few] number of times [when] I feel the news is actually depicting what it is." | Bias-*detection* is already strong and accurate — contradicts the assumption that readers don't notice bias. The gap is downstream of detection. | Don't design for "help readers notice bias" (already happening); design for what happens after they notice it. |
| "I just mostly ignore [it]... because I know whatever I try to find, it will be either of the other side... there is no newspaper which I can trust which shows it as it is." | **Biggest single revision to the problem statement.** Response to suspected bias is disengagement, driven by learned cynicism that *no* source is trustworthy — not that comparison is too effortful. | The pitch can't just be "comparison made easy" — it has to counter "there's no point, everyone's biased anyway." A specific, checkable verdict (fact-check pill) is evidence *against* "nothing is trustworthy," which a bare Compare tab doesn't provide. |
| "If there is... the same news, but written by a different author... right below that, then that might be something I'd prefer... rather than going back entirely and going manually." | Confirms effort matters, but the bar is razor-thin — zero-navigation adjacency is what makes comparison happen at all. | Validates the Compare tab's actual mechanism (sources on the same card, zero extra navigation). |
| "I would love to skim through news which satisfies more with my understanding and ideology. If I find news against what I believe... mostly I don't try to look at that page anymore... but I think everybody has that bias." | Self-aware confirmation bias / selective exposure, explicitly self-normalized ("everybody has that bias") rather than treated as a personal flaw. | A design that moralizes ("you're being biased!") will likely bounce off self-normalized behavior. Neutral, factual framing (verdict pills, ownership flags) lands better than anything that reads as a corrective. |
| "I decide to trust a news story if it aligns with what I'm thinking. If it does not, I may look for a different channel... where it is confirming my biases." | Trust heuristic is confirmation-driven, not source-quality-driven. | Ownership-flag/score cues have to compete with a *stronger*, already-dominant heuristic (agreement-with-prior-belief), not an absence of any heuristic. |
| "We just try to confirm the biases that we have... we tend to look for news that's going to prove our points, not what is the actual truth." (re: disagreements with friends/family) | Confirmation bias extends to social conflict resolution, not just solo reading. | A shareable badge could function as social ammunition ("see, I'm balanced, you're not") rather than genuine reflection — a real risk. |
| "Yes, it really matters to me that people know I'm someone who stays updated and has proper knowledge." | Direct confirmation that being seen as informed is a real, acknowledged motivator. | Supports the compass badge's core identity-signaling bet. |
| Shown the app: "What is the single source? At first glance I am not able to understand." / "What are these badges and where are the badges?" | Independent, unprompted confirmation that "Single source" wasn't self-explanatory and the compass badge wasn't discoverable on first look. | Already acted on: compass promoted to a prominent banner; "Single source" relabeled as a small secondary link rather than an equal-weight tab. |
| "If it is something more, maybe gamified rather than just simply reading, then yes, I might [use it]." | **Real tension with the reinforcement design.** The product deliberately has no streaks/points/leaderboards (to protect intrinsic motivation); this subject says gamification is what would get them to actually use it. | Kept the no-gamification decision (the reasoning still holds, n=1 shouldn't overturn a philosophy) but this is a real, evidenced adoption cost, not just a theoretical one — worth confronting directly if more subjects agree. |
| "Certain information we get from our friends and relatives as well... my first point of information was my friend — that's something you missed." | Word-of-mouth is a real news-discovery channel the app doesn't address at all. | Legitimate scope gap, not a bug — the app competes with apps/feeds, not interpersonal information flow. |
| "Can't I see what other people voted before me voting?" (re: outlet polls, deliberately hidden pre-vote) | Curiosity for social proof exists even where deliberately withheld for a good reason (anti-anchoring). | The blind-vote design is correct CB practice — a case where the *right* choice still generates friction, a defensible trade-off, not a bug to fix. |

**Subject 2 ("Meera," 24F, Master's in Sociology, avid daily reader) — the
opposite of Subject 1 on almost every axis that matters:**

| Observation | Behavioral insight | Design implication |
|---|---|---|
| "I have a list of authors... I'll read someone who writes for it, then I'll form my own opinion." | She already does, manually, what the Compare tab automates — triangulation as a practiced skill, not something she needs to be taught. | The pitch for this segment is "stop doing this by hand," not "learn to compare." Her mental model is author-level, not outlet-level — a real gap vs. the app's outlet-level scoring. |
| "This would depend on the content... government policy I'd check [official sources]... outside India, world newspapers... Bollywood, Instagram." | Source-checking is topic-contingent, not a fixed trait. | A single undifferentiated "Compare" affordance may undersell itself here. |
| "It's a head space thing... if it's for leisure, you just leave it... it takes time." | Friction-tolerance is mode-dependent (leisure vs. research), not a fixed personal trait. | The existing zero-navigation-adjacency design is right for the harder (leisure) case too. |
| "It's the algorithm that shapes what we read... it hampers individual agency... creates a black box." | Strongest, most articulate unprompted validation of the anti-algorithm philosophy found in either interview. | Quote directly in Part F — this isn't just internal philosophy, a real user names the exact harm it counters. |
| "When I share [news] with them, they find it interesting and share with others — it creates a change." | An active amplifier, unlike Subject 1 (who discusses "incidents," not news-as-such). | Natural early-adopter for the shareable-badge growth loop — already primed to share with attached framing. |
| "We tend to fact-check, and realize either one of us was wrong, or maybe both are right." (re: disagreements) | Directly contradicts Subject 1 ("we just try to prove our own point") — fact-check-forward, not motivated-reasoning-forward. | Real evidence the population isn't monolithic on this dimension. |
| "It gives me a sense of validation... makes me feel respected because of the knowledge currency that I have." | Cleanest direct statement of the identity/social-capital premise found in either interview — "knowledge currency" is near-verbatim the course's own framing. | Strongest available quote for Part F. |
| "I've read articles that made me create a negative bias towards the author... I never read that author again... on any platform." | Durable, author-level (not outlet-level) trust judgment, persists across platforms. | Same author-level gap as above — retrieval-cue mechanism is real, possibly mis-scoped at the outlet level for sophisticated readers. |
| "I guess 30% of the time [I know ownership]... No, it doesn't impact me that much." | Real complication for ownership-flagging: partial awareness already exists and doesn't move her trust judgment. | Don't assume the ownership-flag mechanism holds uniformly — may be redundant for already-sophisticated readers. Flag directly on the CB Theory Map. |

**The real finding at n=2 is the contrast itself, not either account
alone:** Subject 1 responds to suspected bias with disengagement; Subject 2
responds with active, effortful triangulation and already does by hand
close to what the Compare tab automates. If this divergence holds, the
product may need two value propositions ("evidence against your cynicism"
vs. "stop doing this manually") rather than one pitch assuming a uniform
starting behavior.

**Not yet interviewed:** someone who gets news mostly secondhand from
friends (a channel Subject 1 flagged as missing), and a third data point to
see which pattern above is closer to modal.

---

## 6. Part C — Consumer Behaviour Diagnosis

1. **Motivation (approach/avoidance):** readers aren't unmotivated to want
   balanced news — they avoid the specific *sub-task* of cross-checking
   because it's effortful with an abstract, delayed payoff. The
   Compare/Single-source tabs convert an invisible, effortful sub-task into
   a visible, zero-effort one — the comparison is already done before the
   reader decides whether they care.
2. **Perception & framing:** an unmarked single-source story and a
   well-corroborated one look identical by default — silence reads as
   completeness. "Not yet covered by [N outlets]" reframes an absence as a
   *stated fact*, a framing effect that changes what the same underlying
   data signals, with zero comparison work from the reader.
3. **Memory & retrieval cues:** outlet favicons and ownership-flag icons
   let a reader retrieve an existing attitude about a source ("that channel
   is always sensational") at the exact point of the trust decision,
   instead of requiring active recall or lookup.
4. **Decision-making (heuristics over deliberation):** most readers use
   System-1 heuristics for source trust rather than System-2 deliberation.
   The app supplies pre-computed, low-effort heuristic cues (ownership
   flag, verdict pill, compass zone color) that are cheap enough to use
   System-1-style while being backed by real research.
5. **Social influence & identity:** see Section 8 (Part F).
6. **Involvement & perceived risk:** news is mostly low-involvement,
   habitual consumption — a high-effort "go compare sources" ask fails
   because it demands high-involvement behavior from a low-involvement
   moment. The correction (badge, color, count) is kept low-involvement
   too, deliberately.

---

## 7. Part D — The Hook Model

**Target micro-habit:** "When I read a news story and something makes me
hesitate — a claim that sounds off, a headline that feels one-sided —
instead of shrugging it off, I open Sourced and check what else is being
said about it."

| Stage | Sourced's mechanism | CB principle |
|---|---|---|
| **Trigger (external, real & shipped)** | A reader shares their compass badge as a *rendered image* (not a link) via WhatsApp/Instagram — the person who *receives* it is the real target of the trigger. Seeing a friend's specific result prompts "what would mine be?" rather than a cold pitch — this is the acquisition path *in lieu of* the quiz being the only way in. Also: a push notification when a viewed story gets a new conflicting fact-check verdict. | External triggers work early; the goal is for the internal trigger (suspicion) to eventually take over. The shared-badge trigger specifically leverages social proof/reference-group influence (Cialdini), not just a reminder. |
| **Trigger (internal)** | The moment of hesitation/suspicion itself, once "check Sourced" is the learned response. | Same as above — this is the actual habit being built. |
| **Action** | Open the app → the story is already on the feed with its comparison state visible. No search, no second app, zero extra steps once the app is open. | Minimize physical/cognitive steps between trigger and payoff (Fogg-style). |
| **Variable reward** | *Reward of the Hunt:* whether a story is corroborated or contested is unpredictable until checked. *Reward of the Self:* the compass/profile screen gives a private sense of having reflected on one's own bias. | Variable reward keeps checking interesting rather than rote — an always-clean result would extinguish the habit. |
| **Investment** | Answering outlet-lean polls (feeds the compass), saving stories to lists, view history. Each makes the *next* visit more personally relevant without extra effort. | Investment should load the next trigger — a more accurate compass is itself a reason to return. |

**Shipped, real, not a mockup:** the shareable badge (native share sheet,
image capture) and a "Discover" tab (browsing other readers' badges/
curated picks, currently seeded with demo profiles) both actually exist in
the running app.

---

## 8. Part E — Reinforcement & Learning

- **Variable-ratio reinforcement:** most checked stories will be clean/
  corroborated; occasionally one reveals a real conflict or a "Misleading"
  verdict. This unpredictability keeps the checking behavior itself
  reinforcing rather than extinguishing.
- **Compass drift as delayed, cumulative reinforcement:** each poll answer
  moves the compass position only slightly; the visible weekly movement is
  a slower, cumulative signal encouraging repeated small engagements over
  one-off large ones.
- **Deliberate rejection of extrinsic gamification:** no streaks, points,
  or leaderboards on the compass/verdict mechanics — per the anti-algorithm/
  social-capital philosophy (Section 1): the bet is that extrinsic reward
  mechanics would make "checking sources" feel like a task performed for
  score rather than information, undermining the actual intrinsic
  motivation the product serves. **This is a real trade-off with a real,
  now-evidenced cost:** Subject 1 said they'd only use the app if it were
  "more gamified" — the exact cost this design predicted, now confirmed by
  an actual person, not just theorized. The decision was kept anyway (the
  reasoning holds, and n=1 shouldn't overturn a stated philosophy), but the
  trade-off is real and should be presented as such, not smoothed over.

---

## 9. Part F — Identity, Social & Cultural Layer

**Core distinction:** "This app helps me compare news" vs. "This app tells
me something true about how I actually see the world." Sourced reaches for
the second. The compass gauge isn't just a task tool — it's a durable,
semi-public **identity artifact**, which the competitive research (Section
2) found no direct competitor offers as a public-facing marker.

- **Identity signaling:** a reader confident in their "balanced" zone has a
  genuine, shareable claim about themselves.
- **Social comparison without ranking:** the distribution view (where a
  reader sits relative to others) invites comparison with deliberately no
  leaderboard, consistent with the anti-algorithm philosophy.
- **Real risk, named rather than glossed over:** a reader whose social
  circle skews one political lean may find their own accurate compass
  position socially costly to reveal — mitigated (not eliminated) by
  keeping the detailed distribution view visible only on the reader's own
  profile. Also: Subject 1's interview suggests a badge could become
  "social ammunition" in a disagreement rather than genuine reflection —
  a real risk surfaced by actual data, not hypothesized.
- **Cultural specificity:** ownership-flag icons carry real weight in the
  Indian media context specifically (concentrated conglomerate ownership of
  major outlets is a live public conversation) — a culturally specific
  instrument, not a generic "transparency" gesture.
- **Shipped:** the badge is now literally shareable as a rendered image via
  the native share sheet — the identity artifact travels through the
  reader's own social graph, not just displayed in-app. A "Discover" tab
  (currently seeded with demo profiles) lets readers browse others' badges
  and curated picks.

---

## 10. CB Theory Map (the assignment's required central table)

| App Feature | Consumer Insight | CB Concept/Theory | Why Theory Predicts It Will Work | Expected Behaviour |
|---|---|---|---|---|
| Compare/Single-source tabs + source-count badge | Readers want balanced news but won't do the extra work of finding a second source themselves | Effort/friction reduction; System 1 heuristic processing | Removing the action required converts an avoidance-prone task into a zero-effort perception | Readers notice comparison state passively, without deliberate search |
| "Not yet covered by..." silence signal | Silence reads as "nothing's missing," not as a gap | Framing effect; perceptual salience | Naming the gap explicitly changes what the same underlying state signals | Readers treat single-source stories with more caution, without extra effort |
| Outlet favicons + ownership-flag icons | Readers rely on gut-level source trust, not researched trust | Retrieval cues; heuristic-based decision-making | A recognizable cue at the decision point lets an existing attitude be retrieved cheaply | Faster, more consistent trust judgments across sessions |
| Fact-check verdict pills | Readers default to binary true/false gut calls on contested claims | Categorization; framing (color + label) | A pre-computed, color-coded verdict substitutes for effortful deliberation | Readers update belief on a specific claim without independent research |
| Compass gauge + weekly drift | No competitor gives readers a *public* personal-lean identity marker | Self-concept; identity signaling; symbolic consumption | A durable personal artifact gives readers something to say about themselves | Repeated voluntary engagement beyond any single article's minimum |
| Shareable badge image + Discover tab | People install apps their friends show them, not apps that advertise at them | Social proof; reference-group influence (Cialdini) | A specific friend's specific result prompts "what would mine be?" | Install/quiz-start events attributable to a shared badge |
| No gamification | Manufactured reward risks crowding out genuine interest in accuracy | Intrinsic vs. extrinsic motivation | Removing extrinsic scoring keeps the reason for checking tied to real information | Engagement driven by curiosity/suspicion, not point-chasing |
| Discovered sources kept separate from Compare | Treating unvetted sources as equal to curated ones undermines trust in the vetted set | Categorization integrity; trust transfer | Keeping the unscored tier structurally distinct protects the credibility signal | Readers extend less automatic trust to "discovered" sources |

---

## 11. Part G — The Prototype (real app, not a mockup)

Coding wasn't required by the brief (a 6-8 screen mockup would satisfy
it), but Sourced is a real, shipped, working app (Expo/React Native +
Supabase) — every design decision maps to something actually live.

**Screens needed as screenshots (currently pending, placeholder in slides):**
1. Feed — Compare tab (multi-source stories, source-count badges)
2. Feed — Single source view
3. Story page — "Not yet covered by" silence signal
4. Story page — outlet favicons, ownership flags, fact-check verdict pill
5. Compass gauge (quiz result screen)
6. Profile — compass distribution + weekly movement
7. Methodology screen
8. List detail
9. Discover tab (browsing other profiles)
10. Native share sheet with the rendered badge image

---

## 12. Part H — Consumer Journey (bonus)

**Riya, 24, scrolling Instagram at 11:40 PM.** A Reel claims a new
government policy will hurt small shopkeepers; comments are split between
outrage and "this is fake, check a real source."

| Stage | What she's doing/feeling | CB mechanism | App response |
|---|---|---|---|
| Trigger | Suspicion, mild anxiety about being misled either way | Internal trigger (hesitation) | — |
| Action | Opens Sourced instead of manually googling | Effort-minimization | Story already clustered with multiple outlets' coverage |
| Perception | Relief the comparison is already done | Framing, heuristic processing | Verdict pill + outlet spread visible immediately |
| Reward | Reads "Misleading — policy applies only to X category" | Variable reward — real new information | — |
| Investment | Saves the story to a "policy watch" list | Investment loop | Increases odds of returning for related updates |

---

## 13. Part I — Measuring Success (bonus)

Not downloads/DAU/time-in-app. Metrics must observe the actual target
behavior (checking a second source when something feels off):

| Question | Metric |
|---|---|
| Are readers actually comparing, not just seeing that they could? | % of multi-source story views where the reader engages more than one outlet's coverage |
| Is the silence signal changing behavior? | Click-through rate on "Not yet covered by" vs. unmarked stories |
| Is the compass a real reflection tool, not a novelty? | Return rate to the profile/compass screen in weeks after first visit |
| Is trust calibration happening? | Self-reported source trust before/after sustained use vs. actual ownership/bias data |

**Primary metric if forced to pick one:** % of viewed multi-source stories
where the reader engages with more than one outlet's coverage — the one
metric that can't be satisfied by passive scrolling or downloads alone.

---

## 14. Suggested 18-20 Slide Outline

1. **Title** — Sourced; one-line description; "Team: TBD" placeholder
2. **Project Objective** (Section 3)
3. **The Problem** — the behavioral gap statement (Section 4), NOT the
   revised version yet — set up the naive framing first
4. **Real Evidence: the supply-side constraint** — the 35-39% ceiling
   finding (Section 4)
5. **Real Evidence: Subject 1 upends the assumption** — the learned-cynicism
   finding (Section 4/5) — this is a strong, honest "we learned something"
   slide, lean into it
6. **Competitive Landscape** (Section 2) — table or logo-row comparison
7. **What Makes Sourced Different** (Section 2's differentiators)
8. **Persona: Ananya** (Section 5, marked provisional)
9. **Research Method** — the interview approach (Section 5)
10. **Key Interview Findings** (2-3 slides worth from the Section 5 table —
    pick the 4-5 strongest rows, don't cram all 11)
11. **CB Diagnosis Overview** (Section 6, condensed to headlines of the 6
    mechanisms)
12. **The Hook Model** (Section 7 table, likely needs its own wide slide or
    split across 2)
13. **Reinforcement & the Gamification Tension** (Section 8) — present the
    trade-off honestly, this is a strong "we're not hiding the hard part"
    slide
14. **Identity & Social Layer** (Section 9)
15. **CB Theory Map** (Section 10) — the assignment's required centerpiece,
    likely needs a wide/landscape slide or split in two
16. **Prototype Screens** (Section 11) — screenshot placeholders, 1-2
    slides
17. **Consumer Journey: Riya** (Section 12)
18. **Measuring Success** (Section 13)
19. **What's Next** — remaining interviews (4 more needed), open questions
    (the two flagged gaps in Section 3), any deferred features
20. **Team / Thank You** — placeholder names

Adjust freely — this is a suggestion, not a rigid template. Slides 10-11
and 15 are the densest; if trimming to 18, merge candidates are slide 3+4
(problem + evidence) and 6+7 (competitors + differentiation).
