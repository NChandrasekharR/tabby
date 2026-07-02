# Phase B Extraction Spike — Execution Plan

**For:** any coding agent (Claude Opus, Codex, …) executing this cold, plus Chandra.
**Decision owner:** Chandra. The agent builds and measures; the verdict comes from §9's table.
**Context:** Read `../PRD-v2.md` §7 Phase B and §8 first. This spike is the Phase-C gate: it decides whether receipt scanning becomes Tabby's primary path, an assist, or gets dropped.
**Scope guard:** Everything lives in `spike/`. Do **not** modify the shipped app (`src/`), do not deploy, do not touch the PWA config.

---

## 1. The question this spike answers

Photograph 25 real Indian restaurant receipts → send each to a small cloud vision LLM → get structured line items back. Measure two things the PRD calls load-bearing:

1. **Line-level accuracy** — how much of each receipt comes back right?
2. **Correction frequency & cost** — what fraction of receipts need manual fixes, how many fixes, and how long does fixing take?

**Kill gate (PRD §7B):** if a typical receipt can't reach fully-correct in well under a minute *including corrections*, scan is not the primary path. §9 makes this numeric.

A secondary question rides along: is Haiku-tier good enough, or does accuracy only arrive at Sonnet-tier (≈3× cost)? That distinguishes "scan is hard" from "scan needs a slightly better model."

---

## 2. What Chandra must do (nobody else can)

1. **Collect 25–30 receipt photos** on his phone. Diversity matters more than count:
   - ≥15 thermal restaurant receipts (the target case)
   - ≥5 with GST lines (CGST/SGST) and ≥5 with a service charge
   - ≥5 shot badly on purpose: dim light, crumpled, at an angle
   - 2–3 long ones (>15 items)
   - AirDrop/copy them into `spike/receipts/raw/` (HEIC or JPEG, any names).
2. **Get an Anthropic API key** at console.anthropic.com → API Keys. Put it in the shell, never in a file in this repo: `export ANTHROPIC_API_KEY=sk-ant-...`
3. **Set a hard monthly spend limit of $10** in the Anthropic Console (Settings → Limits/Billing). The whole spike should cost **under $2**; the cap is the safety net, per PRD §8.
4. **Two review sittings (~25 min each)** using the review tool the agent builds (§6). This is the measurement — treat it like using the future product: fix what's wrong, as fast as you comfortably can.

*(Phase B item 1 — the occasion count of the last ~20 real group splits — is a separate 20-minute manual task for Chandra. It's not part of this spike; don't build anything for it.)*

## 3. Ground rules for the executing agent

- **This repo is PUBLIC.** Receipt photos are personal data. `spike/receipts/`, `spike/out/`, and `spike/review/` must be in `.gitignore` **before** any photo lands in the tree. Verify with `git status` before every commit. Never commit an image, an extraction containing one, or an API key.
- The API key comes only from `ANTHROPIC_API_KEY`. If it's missing, print a friendly setup message (Chandra is non-technical) and exit — don't stack-trace.
- **Budget guard in code:** track cumulative token cost across all calls; hard-abort if the projected total exceeds **$5**. Expected spend is ~$0.30 (Haiku pass) + ~$0.90 (Sonnet pass).
- `spike/` gets its own `package.json` (deps: `@anthropic-ai/sdk`, `sharp`). Do not add dependencies to the app's root `package.json`.
- Keep everything runnable by a non-technical user: one npm script per step, clear console output, no flags required for the happy path.

## 4. Layout

```
spike/
  PLAN.md              ← this file (committed)
  package.json         ← committed
  prep.mjs             ← step 1 (committed)
  extract.mjs          ← step 2 (committed)
  review-server.mjs    ← step 3 (committed)
  review.html          ← step 3 UI (committed)
  score.mjs            ← step 4 (committed)
  REPORT.md            ← step 4 output (committed — numbers only, no images)
  receipts/raw/        ← Chandra's photos (gitignored)
  receipts/prepped/    ← r01.jpg … r30.jpg (gitignored)
  out/                 ← extractions + usage logs (gitignored)
  review/              ← corrected ground truth + edit/timing logs (gitignored)
```

## 5. Step 1 — `npm run prep` (prep.mjs)

For each file in `receipts/raw/`: convert HEIC→JPEG if needed, auto-rotate per EXIF then **strip EXIF** (GPS!), downscale to **1568px on the long edge** (the max useful resolution for Haiku/Sonnet vision; bigger only wastes tokens — a 1568×1176 image costs ≈(w×h)/750 ≈ 2,460 tokens), save as `receipts/prepped/r01.jpg` … in stable sorted order, print a manifest table (id, source name, dimensions, KB).

## 6. Step 2 — `npm run extract` (extract.mjs)

One API call per receipt per model. No separate OCR stage — the photo goes straight to the vision model (decided in HANDOFF §6; capture-time document detection is a Phase-C concern, not a spike concern).

- **Primary: `claude-haiku-4-5`** ($1/M input, $5/M output) — this is the tier the product would ship on, so it's the one Chandra reviews.
- **Secondary: `claude-sonnet-4-6`** ($3/M in, $15/M out) — same prompt, auto-scored later against the ground truth from Chandra's review of the Haiku pass. Tells us the headroom if Haiku disappoints.
- Use the TypeScript SDK (`new Anthropic()`), image as a base64 `image` block + the prompt text, and **structured outputs** so JSON is guaranteed: pass `output_config: {format: {type: "json_schema", schema: EXTRACTION_SCHEMA}}` on `client.messages.create()`. Do NOT use an assistant-prefill to force JSON — that 400s on Sonnet 4.6.
- `max_tokens: 4096`, no temperature param. Retry once on 429/5xx (the SDK already retries; that's enough).
- Write `out/<model>/r01.json` per receipt: `{receiptId, model, extraction, usage: {input_tokens, output_tokens}, latencyMs}`. Print a running cost total.
- Optional stretch (only if everything else is done): run Haiku a second time on 10 receipts and diff, to eyeball run-to-run variance.

**Extraction schema** (the typed-line model from PRD §6, which Phase C will inherit):

```json
{
  "type": "object",
  "properties": {
    "lines": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name":       { "type": "string" },
          "qty":        { "type": ["number", "null"] },
          "amount":     { "type": ["number", "null"] },
          "type":       { "type": "string", "enum": ["ITEM", "TAX", "SERVICE", "DISCOUNT", "TOTAL", "IGNORED"] },
          "confidence": { "type": "number" }
        },
        "required": ["name", "amount", "type", "confidence"],
        "additionalProperties": false
      }
    },
    "printed_total": { "type": ["number", "null"] },
    "currency":      { "type": "string" },
    "notes":         { "type": ["string", "null"] }
  },
  "required": ["lines", "printed_total", "currency"],
  "additionalProperties": false
}
```

**Extraction prompt** (use verbatim as the starting point; small wording fixes are fine, log any change in REPORT.md):

> You are reading a photo of a restaurant bill, most likely an Indian thermal receipt. Extract every printed line that carries an amount.
>
> For each line give: `name` (as printed, trimmed), `qty` (number of units if printed, else null), `amount` (the line's total amount as printed, as a number), `type`, and `confidence` (0–1, your honest confidence that name+amount+type are all correct).
>
> Types: `ITEM` = food/drink line. `TAX` = CGST, SGST, IGST, VAT, cess. `SERVICE` = service charge. `DISCOUNT` = discounts and round-off adjustments — keep the sign as printed (discounts are negative). `TOTAL` = the printed grand total (also copy its value into `printed_total`). `IGNORED` = subtotals, "amount saved", loyalty points, or anything else with an amount that isn't one of the above.
>
> Rules: amounts exactly as printed — never compute, never "fix" arithmetic. Quantity lines like "Butter Naan x2 … 120" mean qty 2, amount 120. If a name is truncated by the printer, transcribe what's visible. If a line is unreadable, still emit it with your best guess and low confidence. `currency` is the symbol used (₹ unless printed otherwise). Use `notes` only for something structurally odd (two columns, handwritten additions, part of the bill cut off).

**Reconciliation** (computed by our code, never trusted from the model): with DISCOUNT amounts signed as printed,
`Σ ITEM + Σ TAX + Σ SERVICE + Σ DISCOUNT == printed_total` within ₹1. This is PRD §5's invariant; the ₹1 tolerance absorbs paise round-off.

## 7. Step 3 — `npm run review` (review-server.mjs + review.html)

A tiny local web app (plain Node http server + one HTML file, no framework) that turns Chandra's review into ground truth **and** into the correction metrics, in one pass. This deliberately simulates scanner v1's correction UX.

- Shows one receipt at a time: photo on the left (zoomable), the **Haiku** extraction on the right as editable rows (name, qty, amount, type dropdown).
- Chandra can: edit any field, delete a row (hallucinated), add a row (missed), and must confirm or correct the **printed total** field (this forces checking the total, which catches silently-missed items).
- A live reconciliation strip shows `Σ lines vs printed total` and turns green when they match — Chandra keeps fixing until green (or flags the receipt).
- Two flag buttons: **"photo unusable — would retake"** and **"receipt too weird — skip"**.
- Timing: the clock starts when the receipt renders and stops at **Save & next**. No pausing; if interrupted, there's a "discard timing" flag on save.
- On save, write `review/r01.json`: the corrected extraction (= ground truth) plus an auto-computed edit log — for each change: `{kind: "price-fix" | "name-fix" | "type-fix" | "qty-fix" | "line-added" | "line-deleted" | "total-fix", …}` — plus `elapsedSeconds` and flags. Name edits that only fix cosmetic truncation (user toggles a "cosmetic" checkbox on the row) are logged as `name-fix-cosmetic` and excluded from the correction counts — a truncated-but-recognizable name wouldn't block a real user.
- Progress indicator ("7 of 25"), resumes where it left off.

## 8. Step 4 — `npm run score` (score.mjs) → REPORT.md

**Primary metrics (Haiku, from the review diffs):** per receipt and aggregate —

- `lineAccuracy` = untouched ITEM lines ÷ ground-truth ITEM lines
- `edits` = count of non-cosmetic edit-log entries; `needsFix` = edits > 0
- `timeToCorrect` = elapsedSeconds (report median and p90)
- `reconciledRaw` = did the *uncorrected* extraction satisfy the reconciliation invariant?
- `costPerReceipt` from usage tokens × pricing

**Secondary metrics (Sonnet, auto-scored against the ground truth):** match lines by amount (±0.01) + normalized-name token overlap ≥ 0.5; report ITEM-line precision/recall, price accuracy on matched lines, type accuracy, `reconciledRaw`, cost. (Auto-scoring is fuzzier than a human diff — say so in the report; it's for direction, not decimals.)

**REPORT.md structure:** summary verdict against §9 first; then the two metric tables; a per-receipt table (id, condition tags, edits, seconds, reconciled, flags); cost totals; distribution of edit kinds (are failures mostly prices? names? missed lines? — this shapes Phase C's correction UI); flagged/unusable receipts; any prompt changes made; threats to validity (small N, one phone, one reviewer, ground truth derived from correcting the model's own output — errors Chandra didn't notice stay invisible except where reconciliation catches them).

## 9. Decision table

Computed on unflagged receipts. `needsBigFix` = receipt with ≥3 non-cosmetic edits.

| Verdict | Criteria (all must hold) | Meaning |
|---|---|---|
| 🟢 **Scan is the primary path** | median `timeToCorrect` ≤ 45s **and** `needsBigFix` ≤ 25% of receipts **and** ≥ 60% of receipts reconcile raw (zero-fix) | Build Phase C with conviction. Phase D (assign-on-receipt) stays alive. |
| 🟡 **Scan as assist** | median `timeToCorrect` ≤ 90s **and** `needsBigFix` ≤ 50% | Build Phase C as list-prefill assist; manual entry stays the headline. Phase D is dead unless Sonnet's numbers are 🟢 (then the fix is model tier, ~3× cost — Chandra's call). |
| 🔴 **Kill scan (for now)** | anything worse | Tabby stays a great manual splitter — PRD explicitly calls this a fine outcome. Re-run this spike when models improve; the harness is reusable. |

Also report, regardless of verdict: **fraction of receipts needing any correction** — PRD §9 says if the correction UX is the *median* case (> 50%), the assign-on-receipt hero drowns in repair work even if totals are fixable quickly.

## 10. Definition of done

- [ ] `.gitignore` covers receipts/out/review **before** photos arrive; no image or key ever committed
- [ ] `npm run prep / extract / review / score` all work end-to-end
- [ ] Both model passes run on all prepped receipts, under the $5 code guard
- [ ] Chandra completed review of the Haiku pass; ground truth + timing captured
- [ ] `REPORT.md` committed with the §9 verdict on top and threats-to-validity noted
- [ ] Total spend reported (expect < $2)
- [ ] Update `../HANDOFF.md` §7/§8: spike done, verdict, and what Phase C inherits (schema, prompt, reconciliation code)
