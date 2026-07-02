/* ------------------------------------------------------------------ *
 * Pure split math — no React, no storage, no DOM.
 * The whole product's correctness lives here; see split.test.js.
 * ------------------------------------------------------------------ */

export const parseNum = (s) => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
};

const centsOf = (n) => Math.round(n * 100);

/**
 * Compute the full split.
 *
 * @param {object} bill
 * @param {'itemized'|'even'} bill.mode
 * @param {Array<{id,name,price,split:'shared'|'assigned',assignedTo:string[]}>} bill.items
 * @param {Array<{id,name,color}>} bill.people — index 0 is the organizer
 * @param {string|number} bill.totalAmount — even mode only
 * @param {string|number} bill.taxVal
 * @param {'pct'|'flat'} bill.taxMode
 * @param {string|number} bill.tipVal
 * @param {'pct'|'flat'} bill.tipMode
 *
 * @returns {{
 *   counted: Array, unassigned: Array,
 *   billSubtotal: number, taxValue: number, tipValue: number, grand: number,
 *   breakdown: Array<{id,name,color,sub,tax,tip,total,totalRounded,lines}>,
 *   roundingAdjustment: number,
 * }}
 *
 * `total` is exact; `totalRounded` is the 2-decimal amount to display.
 * Rounding rule: displayed per-person amounts must sum exactly to the
 * displayed grand total — any paisa-level remainder is folded into the
 * organizer's share (they paid; they absorb). `roundingAdjustment` is
 * that signed remainder (0 when the split is exact).
 */
export function computeSplit({
  mode, items, people, totalAmount, taxVal, taxMode, tipVal, tipMode,
}) {
  const allIds = people.map((p) => p.id);
  const resolved = items.map((i) => {
    const priceNum = parseNum(i.price);
    const assignees =
      i.split === "shared" ? allIds : i.assignedTo.filter((id) => allIds.includes(id));
    return { ...i, priceNum, assignees };
  });
  const counted = resolved.filter((i) => i.priceNum > 0 && i.assignees.length > 0);
  const unassigned = resolved.filter(
    (i) => i.priceNum > 0 && i.assignees.length === 0 && i.split === "assigned"
  );

  const perPersonSub = {};
  people.forEach((p) => (perPersonSub[p.id] = 0));

  let billSubtotal;
  if (mode === "itemized") {
    counted.forEach((i) => {
      const share = i.priceNum / i.assignees.length;
      i.assignees.forEach((pid) => {
        if (pid in perPersonSub) perPersonSub[pid] += share;
      });
    });
    billSubtotal = counted.reduce((s, i) => s + i.priceNum, 0);
  } else {
    billSubtotal = parseNum(totalAmount);
    const n = people.length || 1;
    people.forEach((p) => (perPersonSub[p.id] = billSubtotal / n));
  }

  const taxValue = taxMode === "pct" ? (billSubtotal * parseNum(taxVal)) / 100 : parseNum(taxVal);
  const tipValue = tipMode === "pct" ? (billSubtotal * parseNum(tipVal)) / 100 : parseNum(tipVal);
  const grand = billSubtotal + taxValue + tipValue;

  const breakdown = people.map((p) => {
    const sub = perPersonSub[p.id] || 0;
    const ratio = billSubtotal > 0 ? sub / billSubtotal : people.length ? 1 / people.length : 0;
    const tax = taxValue * ratio;
    const tip = tipValue * ratio;
    const lines =
      mode === "itemized"
        ? counted
            .filter((i) => i.assignees.includes(p.id))
            .map((i) => ({
              name: i.name || "Item",
              amt: i.priceNum / i.assignees.length,
              tag:
                i.split === "shared"
                  ? "shared"
                  : i.assignees.length > 1
                  ? `÷${i.assignees.length}`
                  : "",
            }))
        : [];
    return { ...p, sub, tax, tip, total: sub + tax + tip, lines };
  });

  // Rounding: work in integer cents so the displayed rows always reconcile.
  const roundedCents = breakdown.map((b) => centsOf(b.total));
  const remainderCents =
    breakdown.length > 0
      ? centsOf(grand) - roundedCents.reduce((a, c) => a + c, 0)
      : 0;
  if (remainderCents !== 0) roundedCents[0] += remainderCents;
  breakdown.forEach((b, idx) => (b.totalRounded = roundedCents[idx] / 100));

  return {
    counted, unassigned, billSubtotal, taxValue, tipValue, grand,
    breakdown, roundingAdjustment: remainderCents / 100,
  };
}
