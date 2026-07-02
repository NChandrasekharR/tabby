# Tabby — Session Handoff & Project Log

**Date:** 2 Jul 2026 (sessions ran ~30 Jun – 2 Jul 2026)
**Purpose:** Complete record of the build sessions, decisions, open issues, and plans — so the next chat can pick up with zero context loss. Read this first, then `PRD-v2.md`.

---

## 1. What Tabby is, and how it got here

Tabby is a **receipt-style bill splitter PWA** (Vite + React). It began as a single downloaded file (`bill-splitter.jsx`, working name "Splitsheet") that Chandra asked Claude to review and deploy on Vercel as a PWA. Over ~a week it became a shipped product with real users being onboarded off a viral tweet.

**Repo:** https://github.com/NChandrasekharR/tabby (public, `main`)
**Local path:** `/Users/chandraramanujan/Documents/claude-code/tabby`
**Deploy:** Vercel via GitHub import — **Chandra does the import himself** (dashboard flow chosen over CLI). ⚠️ *Never explicitly confirmed in chat that the import happened, but users are being onboarded, so presumably live. Verify next session.*

### Commit history (all pushed, tree clean)
```
78ac946 Scroll to top after onboarding completes
1cec976 Add social link preview (Open Graph + Twitter Card)
6e5e09d Bundle fonts, fix input focus state, beige app chrome
5f237bb Make first-run onboarding immersive (full-bleed, safe-area aware)
dede3d6 Add first-run onboarding and Share button
11e5736 Add bill history, install prompt, and PORT-aware dev server
c144aee Tabby — receipt-style bill splitter PWA
```

---

## 2. Product decisions made (with rationale)

| Decision | Choice | Why |
|---|---|---|
| Name | **Tabby** (from options: Splitsheet, Bill Daddy, Divvy, Settle…) | Short, friendly, "bar tab." Chandra liked Bill Daddy but called it "a bit much." |
| Persistence | localStorage (`tabby.v1` draft, `tabby.history.v1` history, `tabby.onboarded.v1` flag) | No backend; PWA-friendly; survives refresh. |
| Deploy method | GitHub repo + Vercel dashboard import | Auto-deploys on push to `main`. |
| Repo visibility | Public | Portfolio side project. |
| History model | **Explicit "Save bill"** snapshots (not auto-archive) | Cleanest mental model; "New tab" starts fresh without touching history. |
| History UI | Slide-in panel from header button (with count badge) | Keeps main screen clean. |
| Onboarding | First-run only: your name → friends' names → seeds people list (user first). Demo items kept but **reset to Shared** (old assignedTo IDs would dangle). Gated by `tabby.onboarded.v1` + absence of saved draft. | Chandra wanted name + friends collected; demo items kept as worked example. |
| Share | `navigator.share` on mobile, clipboard fallback on desktop ("Link copied") | How friends discover it. |
| Install UX | `beforeinstallprompt` → "Install app" button (Android/desktop); iOS Safari gets Share→Add-to-Home-Screen hint | iOS has no auto-prompt. |
| Fonts | Self-hosted via `@fontsource` (Space Grotesk 400–700, IBM Plex Mono 400–600), Google Fonts @import removed | Offline correctness, no external request. Note: ships latin+latin-ext+vietnamese subsets (~40 files, ~520KB precache). Could trim to latin-only. |
| Theme | Everything beige `#ECEBE3` — html/body/#root bg, `theme-color` meta, manifest `theme_color` | Chandra hated the white status-bar band on the PWA. |
| Social preview | OG + Twitter Card tags in static index.html; 1200×630 `public/og.png` (generated from `public/og.svg` via sharp) | Rich card on WhatsApp/iMessage/X/Slack. **Relative** image path so it works on any domain; comment in index.html marks where to hard-code the absolute URL post-deploy. OG image text uses fallback fonts (generator lacked brand fonts) — acceptable, could regenerate with real fonts. |
| Demo data | Kept India-themed (₹, Paneer Tikka…) — "ship as-is" chosen over neutralizing | PRD later validated India-first as deliberate. Earlier flagged as a concern for global sharing; reconciled: it's intentional. |

## 3. Bugs found on Chandra's real phone & fixed

1. **Onboarding card floated mid-screen, worksheet bleeding through above/below** (looked "cut off" in PWA standalone). → Made immersive: opaque paper+grain full-viewport backdrop, `100dvh` + `env(safe-area-inset-*)`, edge-to-edge borderless card ≤560px, body scroll locked while open. Desktop keeps floating card.
2. **Double focus outline on text inputs** (wrapper border + inner input ring). → Wrapper shows single navy border + soft halo on `:focus-within`; inner input outline suppressed (`:focus` and `:focus-visible`, for onboarding fields and `.bs-amount` fields).
3. **White status-bar band** above the beige app. → Beige everywhere (see theme decision).
4. **Post-onboarding landed mid-page** (virtual keyboard leaves page scrolled). → `window.scrollTo(0,0)` in scroll-lock effect cleanup, immediately + `requestAnimationFrame` again to beat keyboard collapse.

## 4. Technical environment notes (save future debugging time)

- **Vite doesn't honor `PORT` env by default** — `vite.config.js` now reads `process.env.PORT` so the Claude preview harness's `autoPort` works. Port 5173 is permanently occupied by an unrelated project (`screen-room`, PID 15081).
- Preview harness quirks: `.claude/launch.json` lives at the *session root* (`/Users/chandraramanujan/Documents/claude-code/.claude/launch.json`), config name `tabby-dev`, `npm --prefix tabby run dev`, `autoPort: true`. `location.reload()` in preview_eval drops the connection (re-eval after). Preview screenshots capture full scrollable page height, not just viewport — a sliver of content below a fixed overlay in a screenshot is an artifact, not a bug.
- Icon/OG generation: `sharp` installed with `--no-save` per use, script must run from project dir (not /tmp). Icons: `public/favicon.svg` (source), pwa-192/512, apple-touch-icon 180.
- Write tool requires reading existing files first; `git commit` co-author trailer used throughout.

## 5. Marketing assets produced (in chat, not in repo)

- **Walkthrough video script** (~45–55s, 7 shots): icon tap → onboarding step 1 (name) → step 2 (friends) → START SPLITTING → scroll sample bill, demo Assigned toggle → receipt + "Copy split" → close on "Who had what — who owes what." Pre-roll: clear site data so onboarding fires. Exact on-screen copy strings verified against code.
- **Tweet** (chosen: warm tone, user-facing benefits, single tweet): "Didn't expect the response to Tabby this weekend — genuinely overwhelmed, thank you 🙏 / I've started onboarding people. What's new since: • Onboarding — just add your name + who you're splitting with • Bill history, saved right on your device • Add it to your home screen, works offline • Itemize who had what, split tax + tip fairly, share a clean receipt / Want in? DM me to onboard you — or try it 👇 [link]" (+ a tighter 280-char variant was provided).

## 6. Strategy discussions & conclusions

### Native vs cross-platform (the ladder, not a fork)
Chandra: completely non-technical, vibe-coding; wants iOS + Android; real driver is **OCR / voice / on-device models**. Conclusion:
1. **Rung 1 (do regardless):** camera + cloud OCR + voice on the existing PWA. Validates the killer feature cheaply.
2. **Rung 2 (if validated, wants stores/push):** **Expo / React Native** — keeps him in JS, reuses split-math logic, one codebase both stores. Flutter rejected (new language, no reuse). Pure Swift rejected (iOS-only, double work).
3. **Rung 3 (only if it differentiates):** small native Swift module inside Expo for Apple Intelligence.
**Key insight:** Apple Intelligence (FoundationModels) is Swift-only/iOS-26+/small-model — the *least* capable extractor available and the most locked-in. Cloud vision models are more accurate and cross-platform. Don't let the shiniest option dictate architecture.

### OCR pipeline (decoding the Twitter guy's advice)
His pipeline: capture (with document detector) → OCR (Tesseract/Surya/Paddle local, or Azure Document Intelligence receipt model cloud) → structuring (spaCy, or small vision LLM with structured JSON output) → use data. His fork: commercialize → cloud is fine; free → need local models working.
**Our refinements:** for a prototype, skip stages 1–2 — photo straight to a vision LLM (Haiku/Flash tier) returning JSON items, one call. Keep his "document detector at capture" advice regardless (garbage in = garbage out). Local pipeline is real ML engineering — wrong first move for a learner.

### Commercialization & cost fear
Chandra: "building for my own learning, maybe payments later, don't want a surprise $100k bill."
**Reframe delivered:** the risk isn't paid APIs, it's *uncapped* paid APIs. Real numbers: vision-LLM scan ≈ $0.001–0.005/receipt; 10k scans/mo ≈ $10–50. Horror stories come from: no spend cap, leaked keys (key must live server-side, never in the app), no per-user rate limit, not watching the meter. Plan: **cloud with a hard $20/mo cap** — the guardrail work (server-side key, rate limits, monitoring) *is* the commercialization-readiness work. Local-models-first would teach ML-ops, not product.

### PRD v1 review (splitsheet-prd.md, in ~/Downloads)
Strong doc. Best parts to preserve: **§0 "the receipt is the interface"** reframe; **§2 occasion-count kill question** (messy splits out of last 20 — still unanswered!); **§6 reconciliation invariant** (trust contract — the quiet star); **§10 phased kill gates**.
Three assumptions have drifted: (1) "private/free/offline" rested on Apple on-device models — now known to be the weakest option; wedge must rest on interaction + UPI speed instead. (2) PRD is iOS/Swift-shaped; reality is React PWA, vibe-coded. (3) PRD carries venture-bet pressure; actual goal is learning-first.
Substantive critique: **the correction UX (the "30%") may be the median case on Indian thermal receipts** — if so, the assign-on-receipt hero drowns in repair work and the list view becomes the product. Phase 0 must measure *correction frequency*, not just accuracy.
Decision: don't rewrite v1 — write **PRD v2** rebased on the real stack and goal. → See `PRD-v2.md`.

## 7. OPEN ISSUES — ranked (from the full-project review)

1. **🔴 Data-loss landmine:** "New tab" wipes the current bill instantly, no confirmation, and the wipe auto-persists. With real users this WILL lose someone's bill. Fix: confirm before reset, or auto-snapshot to history on "New tab." Also: localStorage is evictable — add an export/backup path. **This is the agreed next work item.**
2. **🔴 Zero tests on the split math.** The entire product's correctness lives in one untested `useMemo`. Extract to a pure module + ~12 test cases before any new feature.
3. **🟡 Rounding fairness unimplemented:** displayed per-person shares can sum a paisa or two off the displayed total. PRD's answer (organizer absorbs remainder, stated in footnote) is right and not built.
4. **🟡 App.jsx is 1,189 lines** with the whole stylesheet as a template string. Split (math / storage / CSS / Onboarding / HistoryPanel) before building the scanner, or AI-assisted sessions get expensive and risky.
5. **🟡 Verify the Vercel deploy actually happened** + optionally hard-code absolute OG URLs once domain known.
6. **🟢 Nice-to-haves parked:** trim fonts to latin subset; regenerate OG image with real brand fonts; rename/re-save history entries; neutralized demo data if ever going global.

## 8. Agreed next steps (in order)

1. **Data-safety fixes** (issue #1) — ~30 min, protects real users now.
2. **Extract + test split math; split App.jsx** (issues #2, #4).
3. **Phase 0 spike, rebased:** 20–30 of Chandra's real receipts → capped cloud vision model → JSON items. Measure line accuracy **and correction frequency**. This gates the scanner build.
4. **The occasion count** (20 min, from PRD §2): of the friend group's last ~20 splits, how many were messy-itemized? 3/20 → feature; 10/20 → product.
5. Then: scanner v1 = boring **list-prefill** (photo → vision LLM → items appear in list). Assign-on-receipt stays the gated ambition (see PRD v2).

## 9. Current feature inventory (as shipped)

Itemize mode (Shared / Assigned per item, per-person chips) · Even-split mode · Proportional tax + tip (% or flat, quick-pick tips) · Multi-currency symbol (₹ $ € £ ¥) · Per-person receipt with copy-to-clipboard · Save bill → History panel (reopen/delete) · First-run onboarding (name + friends) · Share (native sheet / copy link) · Install prompts · Offline PWA (precached, autoUpdate SW) · Draft auto-persist · Social link previews · Immersive onboarding, beige chrome, scroll-to-top fix.

**Storage keys:** `tabby.v1` (live draft), `tabby.history.v1` (saved bills array, newest first: `{id, savedAt, total, peopleCount, bill:{billName,currency,mode,people,items,totalAmount,taxVal,taxMode,tipVal,tipMode}}`), `tabby.onboarded.v1` (`"1"`).
**Item model:** `{id, name, price(string), split:'shared'|'assigned', assignedTo:[personId]}`. **Person:** `{id, name, color}` (8-color palette, user is index 0).
