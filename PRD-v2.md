# Tabby — Product Requirements v2

**Supersedes:** `splitsheet-prd.md` (v1, in ~/Downloads). v1's strategic bones survive; this version re-bases them on the shipped reality.
**Status:** Live. Shipped PWA with real users onboarding via Twitter. Engine + distribution polish done (see `HANDOFF.md` §9 for the feature inventory).
**Author:** Chandra, with Claude
**One line:** The fastest, fairest way to split the messy group bill — shipped as a receipt-styled PWA today, growing toward scan-to-split.

---

## 0. What changed since v1 (read this first)

v1 was written before anything shipped, for a Swift/iOS app powered by Apple's on-device models, under venture-bet framing. Three corrections, learned the hard way-ish:

1. **The stack is React PWA, not Swift.** Chandra is a non-technical vibe-coder; the app exists, works, and has users *because* it stayed in the web stack. Native (Expo/React Native) is a later rung, taken only if stores/push/feel demand it. Apple Intelligence is demoted from "the whole architectural case" to "a possible future Swift module inside an Expo app."
2. **Extraction will be cloud-first, capped.** On-device models are the *weakest* extractor available and lock out Android. A small vision LLM (Haiku/Flash tier) behind a hard **$20/month spend cap**, key held server-side, is more accurate, cross-platform, and teaches the guardrail discipline (caps, rate limits, metering) that *is* commercialization-readiness. Local models are a cost optimization for later, if ever.
3. **The goal is learning-first, revenue-maybe.** Moat/absorption analysis (v1 §2, §4) is parked, not deleted. The only two questions that gate work now are: *does extraction work on real receipts?* and *does anyone assign on the image?*

**What survives from v1 unchanged:** the reframe (§1 below), the reconciliation invariant (§5), the kill-gate discipline (§7), the Kano read, the India-first context, and the honesty about blind spots.

---

## 1. The reframe (unchanged, still the point)

Bill splitters are a commodity. The product idea is: **the receipt is the interface.** The photographed receipt as the source of truth and the canvas you assign on. Tabby today is the *engine* for that product plus real distribution (PWA, onboarding, history, share). The receipt-as-canvas is the destination, reached through gates — not the next sprint.

## 2. The problem (unchanged)

Group eats; someone's vegetarian, someone didn't drink, someone ordered the expensive thing. Itemizing is annoying, so people even-split, and it's unfair exactly on the bills where fairness matters. Incumbents optimize the ledger; the single messy split is a form to fill. Tabby wins the two minutes at the table.

## 3. Users & context (unchanged from v1, condensed)

- **Organizer** (primary): paid the bill, does the work — scan/enter, assign, share. The whole app serves their two-minute job.
- **Participants**: need a fair breakdown and an easy way to pay. Served by shared receipt + (Phase 3) UPI links. No accounts, ever, in v1/v2.
- **India-first, deliberately:** ₹ defaults, GST + service charge patterns, UPI as the settle rail, thermal receipts. The demo data being India-themed is intentional, not an oversight. Re-validate everything before any global push.

## 4. Where the wedge actually lives now

v1 claimed private/free/offline (on-device) as the architectural case. Corrected:

| Wedge component | Status |
|---|---|
| **Speed of a focused tool** (no accounts, 2-minute job) | Real today. Protect it. |
| **Assign-on-receipt interaction** | The ambition. Gated (Phase 2 gate). |
| **Reconciliation as trust** ("₹180 unassigned / items don't sum") | Real, cheap, underrated. Build into scanner v1. |
| **UPI-native settle loop** | Phase 3. High leverage in India. |
| Private/free/offline extraction | Demoted to future nicety (possible on-device path on iOS, someday). |

## 5. The reconciliation invariant (unchanged — the trust contract)

```
Σ(ITEM) + Σ(TAX, SERVICE) − Σ(DISCOUNT) + tip == printed grand total
```

Two distinct user-facing gaps: **assignment gap** ("₹180 not assigned yet") and **extraction gap** ("items don't add up to the printed total — check the receipt"). A scanner users trust is one that visibly catches its own mistakes. This ships with scanner v1, not later.

**New in v2 — the rounding rule:** per-person displayed amounts can drift a paisa or two from the displayed total. Rule: **the Organizer absorbs the rounding remainder** (they paid; they absorb), stated in the receipt footnote. This is currently *unimplemented* and is part of the math-hardening work.

## 6. Current data model (as shipped) and its planned extension

Shipped: `Bill{billName,currency,mode,people[],items[],totalAmount,taxVal,taxMode,tipVal,tipMode}` · `Person{id,name,color}` · `Item{id,name,price,split:'shared'|'assigned',assignedTo[]}`. Draft in `tabby.v1`, history in `tabby.history.v1`, onboarding flag `tabby.onboarded.v1`.

Scanner extension (v1's typed-line model, adapted): items gain optional `type: ITEM|TAX|SERVICE|DISCOUNT|TOTAL|IGNORED`, `confidence: 0–1`, and (only if/when assign-on-receipt happens) `bbox`. Charges are typed lines, never assigned, distributed proportionally. Migration must be backward-compatible with existing users' localStorage (versioned keys exist for this reason).

## 7. Roadmap with gates

### Phase A — Harden what users already depend on ⚠️ *before any new feature*
1. **Data safety:** confirm-or-snapshot on "New tab" (currently wipes instantly — the #1 live risk); export/backup path for localStorage.
2. **Math trust:** extract split math into a pure tested module (~12 cases: shared/assigned mixes, tax/tip pct+flat, removed-person dangling IDs, zero-people, rounding). Implement the Organizer-absorbs-remainder rule.
3. **Codebase prep:** split the 1,189-line `App.jsx` (math / storage / styles / Onboarding / HistoryPanel) so scanner work is tractable for AI-assisted sessions.

*No gate — this is owed to existing users.*

### Phase B — The two cheap answers (v1's best questions, still open)
1. **Occasion count (20 min):** of the friend group's last ~20 real splits, how many were messy-itemized? 3/20 → Tabby is a polished feature, calibrate ambition down. 10/20 → it's a product, proceed with conviction.
2. **Extraction spike (the Phase-0 gate, rebased):** 20–30 real receipts (thermal, dim, crumpled, GST + service charge) → capped cloud vision LLM → JSON lines. Measure **line-level accuracy** AND **correction frequency** (what fraction of receipts need any manual fix, and how many fixes each).
   - **Kill gate:** if a typical receipt can't reach correct in well under a minute including corrections, scan is not the primary path — Tabby stays a great manual splitter with scan-as-assist, and that's a fine outcome for a learning project.

### Phase C — Scanner v1: the boring version, deliberately
Photo (with capture-time document detection/cropping — the one piece of the Twitter-guy pipeline kept regardless) → vision LLM (structured JSON, server-side key, $20 hard cap, per-user rate limit) → **items pre-filled into the existing list UI** → reconciliation strip live from day one → assign/edit exactly as today.
- Yes, this is the commodity flow v1 disdained. It's also shippable in the real stack, delivers the wow, and generates the usage data that justifies (or kills) the fancy version.
- Manual entry stays one tap away. Never a dead end.

### Phase D — Assign-on-receipt (the v1 hero, now gated)
Only if Phase B says "product" and Phase C shows corrections are rare (the 30% must not be the median): the pen model, tap-on-image bands, bboxes, synchronized list view, correction sheet — the full v1 §8 spec, which remains the reference design and does not need rewriting.
- **Gate at alpha:** if users flip to the list and ignore the image, the differentiator is dead — accept gracefully; the list *is* the product.

### Phase E — Close the loop (habit)
UPI deep-link requests pre-filled per person; shareable split link. Then, later/maybe: collaborative claiming, multi-payer, Expo/React Native wrapper for stores + push (the "ladder" — see HANDOFF §6), possible Swift module for on-device extraction.

**Not doing (unchanged from v1):** ledger/running balances, wallet/payments custody, travel mode, accounts, unequal fractional shares per line.

## 8. Cost & safety guardrails (new section — the learning-project contract)

- API keys live **server-side only** (a tiny proxy endpoint), never in the client bundle.
- **Hard monthly spend cap** (~$20) at the provider; worst case is "scanning pauses until next month," never a surprise bill.
- Per-user/device rate limit on the scan endpoint.
- A usage meter Chandra actually looks at.
- These four are the curriculum: they're precisely what makes later commercialization safe.

## 9. Risks & blind spots (carried forward, updated)

- **Correction frequency is the load-bearing unknown** — it decides whether the hero interaction can exist. Measured explicitly in Phase B.
- **Real users raised the stakes early.** Data loss and math correctness now matter more than new features. Phase A exists because of this.
- **Context overfitting** (India, this friend group) — deliberate, flagged, re-validate before generalizing.
- **Happy-path pull** — v1's discipline stands: correction and recovery flows are first-class, not stubs.
- **Absorption risk** (Splitwise ships tap-on-image) — parked under learning-first framing; revisit only if commercializing.

## 10. Immediate next actions (for the next session)

1. Phase A item 1: New-tab confirm/auto-snapshot + export. (~30 min, agreed as next work.)
2. Phase A items 2–3: extract + test math, split App.jsx.
3. Verify the Vercel deploy is actually live; optionally hard-code absolute OG URLs.
4. Phase B: occasion count + extraction spike.
