import { describe, it, expect } from "vitest";
import { computeSplit, parseNum } from "./split";

const P = (id, name = id) => ({ id, name, color: "#000" });
const item = (price, split = "shared", assignedTo = [], name = "Item") => ({
  id: name + price, name, price: String(price), split, assignedTo,
});

const base = {
  mode: "itemized",
  items: [],
  people: [],
  totalAmount: "",
  taxVal: "0",
  taxMode: "pct",
  tipVal: "0",
  tipMode: "pct",
};

const totals = (r) => r.breakdown.map((b) => b.total);
const rounded = (r) => r.breakdown.map((b) => b.totalRounded);

describe("parseNum", () => {
  it("parses currency-ish strings and garbage safely", () => {
    expect(parseNum("340")).toBe(340);
    expect(parseNum("₹1,160.50")).toBe(1160.5);
    expect(parseNum("")).toBe(0);
    expect(parseNum("abc")).toBe(0);
    expect(parseNum(undefined)).toBe(0);
  });
});

describe("itemized mode", () => {
  it("splits a shared item equally across everyone", () => {
    const r = computeSplit({
      ...base,
      people: [P("a"), P("b"), P("c")],
      items: [item(300, "shared")],
    });
    expect(r.billSubtotal).toBe(300);
    expect(totals(r)).toEqual([100, 100, 100]);
  });

  it("gives an assigned item wholly to its single assignee", () => {
    const r = computeSplit({
      ...base,
      people: [P("a"), P("b")],
      items: [item(280, "assigned", ["b"])],
    });
    expect(totals(r)).toEqual([0, 280]);
  });

  it("splits an assigned item among its assignees only", () => {
    const r = computeSplit({
      ...base,
      people: [P("a"), P("b"), P("c")],
      items: [item(120, "assigned", ["a", "b"])],
    });
    expect(totals(r)).toEqual([60, 60, 0]);
  });

  it("handles a mixed shared + assigned bill (the demo bill)", () => {
    const r = computeSplit({
      ...base,
      people: [P("p1"), P("p2"), P("p3")],
      items: [
        item(340, "shared"),
        item(240, "shared"),
        item(280, "assigned", ["p2"]),
        item(180, "assigned", ["p3"]),
        item(120, "assigned", ["p1", "p2"]),
      ],
    });
    expect(r.billSubtotal).toBe(1160);
    // p1: 340/3 + 240/3 + 60 ≈ 253.33; p2: + 280 + 60; p3: + 180
    expect(totals(r).map((t) => Math.round(t * 100) / 100)).toEqual([
      253.33, 533.33, 373.33,
    ]);
  });

  it("ignores unpriced items and reports priced-but-unassigned ones", () => {
    const r = computeSplit({
      ...base,
      people: [P("a")],
      items: [
        item(0, "shared"),
        item("", "shared"),
        item(100, "assigned", []), // priced, nobody tapped
        item(50, "shared"),
      ],
    });
    expect(r.counted).toHaveLength(1);
    expect(r.unassigned).toHaveLength(1);
    expect(r.billSubtotal).toBe(50);
  });

  it("drops dangling assignedTo ids from removed people", () => {
    const r = computeSplit({
      ...base,
      people: [P("a")],
      items: [item(100, "assigned", ["ghost", "a"])],
    });
    // ghost is ignored; a pays the whole item
    expect(totals(r)).toEqual([100]);
    const r2 = computeSplit({
      ...base,
      people: [P("a")],
      items: [item(100, "assigned", ["ghost"])],
    });
    // only ghosts left → item is effectively unassigned, not counted
    expect(r2.unassigned).toHaveLength(1);
    expect(totals(r2)).toEqual([0]);
  });
});

describe("tax and tip", () => {
  it("distributes percentage tax proportionally to subtotals", () => {
    const r = computeSplit({
      ...base,
      people: [P("a"), P("b")],
      items: [item(300, "assigned", ["a"]), item(100, "assigned", ["b"])],
      taxVal: "10",
    });
    expect(r.taxValue).toBeCloseTo(40);
    expect(totals(r)[0]).toBeCloseTo(330); // 300 + 30
    expect(totals(r)[1]).toBeCloseTo(110); // 100 + 10
  });

  it("distributes flat tax and flat tip proportionally too", () => {
    const r = computeSplit({
      ...base,
      people: [P("a"), P("b")],
      items: [item(300, "assigned", ["a"]), item(100, "assigned", ["b"])],
      taxVal: "20", taxMode: "flat",
      tipVal: "40", tipMode: "flat",
    });
    expect(r.grand).toBeCloseTo(460);
    expect(totals(r)[0]).toBeCloseTo(345); // 300 + 15 + 30
    expect(totals(r)[1]).toBeCloseTo(115); // 100 + 5 + 10
  });

  it("mixes pct tax with flat tip", () => {
    const r = computeSplit({
      ...base,
      people: [P("a")],
      items: [item(200, "shared")],
      taxVal: "5", taxMode: "pct",
      tipVal: "30", tipMode: "flat",
    });
    expect(r.grand).toBeCloseTo(240);
    expect(totals(r)[0]).toBeCloseTo(240);
  });
});

describe("even mode", () => {
  it("splits the entered total equally", () => {
    const r = computeSplit({
      ...base,
      mode: "even",
      people: [P("a"), P("b"), P("c"), P("d")],
      totalAmount: "1000",
    });
    expect(totals(r)).toEqual([250, 250, 250, 250]);
  });

  it("still distributes flat tax when the subtotal is blank", () => {
    const r = computeSplit({
      ...base,
      mode: "even",
      people: [P("a"), P("b")],
      totalAmount: "",
      taxVal: "10", taxMode: "flat",
    });
    // ratio falls back to 1/n so the flat charge is shared evenly
    expect(totals(r)).toEqual([5, 5]);
  });
});

describe("edge cases", () => {
  it("handles zero people without crashing", () => {
    const r = computeSplit({ ...base, items: [item(100, "shared")] });
    expect(r.breakdown).toEqual([]);
    expect(r.billSubtotal).toBe(0); // shared item has no assignees → not counted
    expect(r.roundingAdjustment).toBe(0);
  });
});

describe("rounding — organizer absorbs the remainder", () => {
  it("gives the extra paisa to the organizer when shares round down", () => {
    const r = computeSplit({
      ...base,
      people: [P("org"), P("b"), P("c")],
      items: [item(100, "shared")],
    });
    // 33.333… each → displayed 33.34 / 33.33 / 33.33
    expect(rounded(r)).toEqual([33.34, 33.33, 33.33]);
    expect(r.roundingAdjustment).toBeCloseTo(0.01);
  });

  it("docks the organizer when shares round up", () => {
    const r = computeSplit({
      ...base,
      people: [P("org"), P("b"), P("c")],
      items: [item(0.2, "shared")],
    });
    // 0.0666… each → 0.07×3 = 0.21 vs 0.20 → organizer shows 0.06
    expect(rounded(r)).toEqual([0.06, 0.07, 0.07]);
    expect(r.roundingAdjustment).toBeCloseTo(-0.01);
  });

  it("keeps displayed rows summing exactly to the displayed total (messy bill)", () => {
    const r = computeSplit({
      ...base,
      people: [P("a"), P("b"), P("c"), P("d"), P("e"), P("f"), P("g")],
      items: [
        item(199, "shared"),
        item(333, "assigned", ["a", "b", "c"]),
        item(101, "assigned", ["d", "e", "f", "g"]),
        item(47.5, "shared"),
      ],
      taxVal: "5", taxMode: "pct",
      tipVal: "13", tipMode: "flat",
    });
    const displayedSum = rounded(r).reduce((a, b) => a + b, 0);
    expect(Math.round(displayedSum * 100)).toBe(Math.round(r.grand * 100));
  });

  it("reports no adjustment when the split is already exact", () => {
    const r = computeSplit({
      ...base,
      people: [P("a"), P("b")],
      items: [item(100, "shared")],
    });
    expect(rounded(r)).toEqual([50, 50]);
    expect(r.roundingAdjustment).toBe(0);
  });
});
