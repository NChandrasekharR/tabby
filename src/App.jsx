import React, { useState, useMemo, useEffect } from "react";

/* ------------------------------------------------------------------ *
 * Tabby — a bill splitter built like a receipt.
 * Itemize, and mark each line as it really was:
 *   · Shared    → divides equally across everyone
 *   · Assigned  → tap who actually had it (splits among them if >1)
 * Tax + tip distribute proportionally to each person's subtotal.
 * Or skip items entirely and split one total evenly.
 * The result prints as a per-person receipt you can copy to a chat.
 * ------------------------------------------------------------------ */

const PALETTE = [
  "#2E3A66", "#B5362A", "#3E7C5A", "#A8742C",
  "#6B4E8E", "#2D7A86", "#9C3A6B", "#506236",
];

const CURRENCIES = ["₹", "$", "€", "£", "¥"];

const uid = () => Math.random().toString(36).slice(2, 9);
const parseNum = (s) => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
};

const STORAGE_KEY = "tabby.v1";
const HISTORY_KEY = "tabby.history.v1";
const ONBOARD_KEY = "tabby.onboarded.v1";

function makeSeed() {
  const people = [
    { id: "p1", name: "Riya", color: PALETTE[0] },
    { id: "p2", name: "Arjun", color: PALETTE[1] },
    { id: "p3", name: "Sam", color: PALETTE[2] },
  ];
  const items = [
    { id: uid(), name: "Paneer Tikka", price: "340", split: "shared", assignedTo: [] },
    { id: uid(), name: "Lime Soda ×3", price: "240", split: "shared", assignedTo: [] },
    { id: uid(), name: "Veg Biryani", price: "280", split: "assigned", assignedTo: ["p2"] },
    { id: uid(), name: "Masala Dosa", price: "180", split: "assigned", assignedTo: ["p3"] },
    { id: uid(), name: "Butter Naan ×2", price: "120", split: "assigned", assignedTo: ["p1", "p2"] },
  ];
  return { people, items };
}

// Demo items for a fresh group — all Shared so they don't reference seed IDs.
function demoItems() {
  return [
    { id: uid(), name: "Paneer Tikka", price: "340", split: "shared", assignedTo: [] },
    { id: uid(), name: "Lime Soda ×3", price: "240", split: "shared", assignedTo: [] },
    { id: uid(), name: "Veg Biryani", price: "280", split: "shared", assignedTo: [] },
    { id: uid(), name: "Masala Dosa", price: "180", split: "shared", assignedTo: [] },
    { id: uid(), name: "Butter Naan ×2", price: "120", split: "shared", assignedTo: [] },
  ];
}

function hasOnboarded() {
  try {
    return localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return false;
  }
}

// Load persisted state (or null). Returns a partial state object.
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    return s;
  } catch {
    return null;
  }
}

// Saved-bill history (separate from the live draft).
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const h = JSON.parse(raw);
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

export default function App() {
  const seed = useMemo(makeSeed, []);
  const saved = useMemo(loadState, []);

  const [billName, setBillName] = useState(saved?.billName ?? "Dinner");
  const [currency, setCurrency] = useState(saved?.currency ?? "₹");
  const [mode, setMode] = useState(saved?.mode ?? "itemized"); // 'itemized' | 'even'
  const [people, setPeople] = useState(saved?.people ?? seed.people);
  const [items, setItems] = useState(saved?.items ?? seed.items);
  const [totalAmount, setTotalAmount] = useState(saved?.totalAmount ?? "1160");
  const [taxVal, setTaxVal] = useState(saved?.taxVal ?? "5");
  const [taxMode, setTaxMode] = useState(saved?.taxMode ?? "pct"); // 'pct' | 'flat'
  const [tipVal, setTipVal] = useState(saved?.tipVal ?? "0");
  const [tipMode, setTipMode] = useState(saved?.tipMode ?? "pct");
  const [newPerson, setNewPerson] = useState("");
  const [copied, setCopied] = useState(false);
  const [today] = useState(() => new Date());

  // Bill history + slide-in panel.
  const [history, setHistory] = useState(loadHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // First-run onboarding (only when there's no saved draft and never onboarded).
  const [onboarding, setOnboarding] = useState(() => !saved && !hasOnboarded());
  const [shared, setShared] = useState(false);

  // PWA install prompt (Android/desktop) + iOS detection.
  const [installEvt, setInstallEvt] = useState(null);
  const [isIOS] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !window.matchMedia("(display-mode: standalone)").matches &&
      !window.navigator.standalone
  );
  const [showIOSHint, setShowIOSHint] = useState(false);

  // Persist everything that matters whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          billName, currency, mode, people, items,
          totalAmount, taxVal, taxMode, tipVal, tipMode,
        })
      );
    } catch {
      /* storage unavailable (private mode / quota) — ignore */
    }
  }, [billName, currency, mode, people, items, totalAmount, taxVal, taxMode, tipVal, tipMode]);

  // Persist the saved-bill history.
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* storage unavailable — ignore */
    }
  }, [history]);

  // Capture the install prompt so we can offer an in-app "Install app" button.
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dateStr = today.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

  const fmt = (n) => {
    const v = isFinite(n) ? n : 0;
    const locale = currency === "₹" ? "en-IN" : "en-US";
    return (
      currency +
      v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  };

  /* ---------- people ---------- */
  const addPerson = () => {
    const name = newPerson.trim();
    if (!name) return;
    setPeople((p) => [...p, { id: uid(), name, color: PALETTE[p.length % PALETTE.length] }]);
    setNewPerson("");
  };
  const removePerson = (id) => {
    setPeople((p) => p.filter((x) => x.id !== id));
    setItems((its) => its.map((i) => ({ ...i, assignedTo: i.assignedTo.filter((x) => x !== id) })));
  };

  /* ---------- items ---------- */
  const addItem = () =>
    setItems((its) => [...its, { id: uid(), name: "", price: "", split: "assigned", assignedTo: [] }]);
  const updateItem = (id, patch) =>
    setItems((its) => its.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removeItem = (id) => setItems((its) => its.filter((i) => i.id !== id));
  const setSplit = (id, type) => updateItem(id, { split: type });
  const toggleAssign = (itemId, pid) =>
    setItems((its) =>
      its.map((i) =>
        i.id === itemId
          ? {
              ...i,
              assignedTo: i.assignedTo.includes(pid)
                ? i.assignedTo.filter((x) => x !== pid)
                : [...i.assignedTo, pid],
            }
          : i
      )
    );
  const assignAll = (itemId) =>
    setItems((its) =>
      its.map((i) => {
        if (i.id !== itemId) return i;
        const all = people.map((p) => p.id);
        const isAll = all.length > 0 && all.every((id) => i.assignedTo.includes(id));
        return { ...i, assignedTo: isAll ? [] : all };
      })
    );

  const resetAll = () => {
    setBillName("Dinner");
    setMode("itemized");
    setPeople([]);
    setItems([]);
    setTotalAmount("");
    setTaxVal("");
    setTipVal("");
  };

  /* ---------- math ---------- */
  const computed = useMemo(() => {
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

    return { counted, unassigned, billSubtotal, taxValue, tipValue, grand, breakdown };
  }, [mode, items, people, totalAmount, taxVal, taxMode, tipVal, tipMode]);

  const copySplit = () => {
    const L = [];
    L.push(`${billName || "Bill"} · ${dateStr}`);
    L.push("");
    computed.breakdown.forEach((b) => L.push(`${(b.name || "—").padEnd(12)} ${fmt(b.total)}`));
    L.push("");
    L.push(`Subtotal ${fmt(computed.billSubtotal)}`);
    if (computed.taxValue) L.push(`Tax      ${fmt(computed.taxValue)}`);
    if (computed.tipValue) L.push(`Tip      ${fmt(computed.tipValue)}`);
    L.push(`Total    ${fmt(computed.grand)}`);
    const text = L.join("\n");
    try {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        },
        () => {}
      );
    } catch (e) {
      /* clipboard unavailable in this context */
    }
  };

  /* ---------- history ---------- */
  // Snapshot the current bill into history (newest first).
  const saveBill = () => {
    const entry = {
      id: uid(),
      savedAt: new Date().toISOString(),
      total: computed.grand,
      peopleCount: people.length,
      bill: {
        billName, currency, mode, people, items,
        totalAmount, taxVal, taxMode, tipVal, tipMode,
      },
    };
    setHistory((h) => [entry, ...h]);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1600);
  };

  // Restore a saved bill into the live worksheet.
  const loadBill = (entry) => {
    const b = entry.bill;
    setBillName(b.billName ?? "");
    setCurrency(b.currency ?? "₹");
    setMode(b.mode ?? "itemized");
    setPeople(b.people ?? []);
    setItems(b.items ?? []);
    setTotalAmount(b.totalAmount ?? "");
    setTaxVal(b.taxVal ?? "");
    setTaxMode(b.taxMode ?? "pct");
    setTipVal(b.tipVal ?? "");
    setTipMode(b.tipMode ?? "pct");
    setHistoryOpen(false);
  };

  const deleteBill = (id) => setHistory((h) => h.filter((e) => e.id !== id));

  /* ---------- install ---------- */
  const installApp = async () => {
    if (installEvt) {
      installEvt.prompt();
      try {
        await installEvt.userChoice;
      } catch {
        /* ignore */
      }
      setInstallEvt(null);
    } else if (isIOS) {
      setShowIOSHint((v) => !v);
    }
  };

  const canInstall = !!installEvt || isIOS;

  /* ---------- onboarding ---------- */
  // names: ordered list (user first, then friends). Seeds people + keeps demo items.
  const finishOnboarding = (names) => {
    const clean = names.map((n) => n.trim()).filter(Boolean);
    const seededPeople = clean.map((name, idx) => ({
      id: uid(),
      name,
      color: PALETTE[idx % PALETTE.length],
    }));
    setPeople(seededPeople);
    setItems(demoItems());
    setMode("itemized");
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* ignore */
    }
    setOnboarding(false);
  };

  /* ---------- share ---------- */
  const shareApp = async () => {
    const url = window.location.origin || window.location.href;
    const data = {
      title: "Tabby",
      text: "Split the bill like a receipt — who had what, who owes what.",
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* user cancelled or share failed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const fmtSavedDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      });
    } catch {
      return "";
    }
  };

  const hasPeople = people.length > 0;
  const ready =
    hasPeople && (mode === "itemized" ? computed.counted.length > 0 : parseNum(totalAmount) > 0);

  /* ---------- receipt row ---------- */
  const RRow = ({ label, value, strong, red, small, ind, color }) => (
    <div className={`bs-rrow${small ? " sm" : ""}${ind ? " ind" : ""}`}>
      <span className="lab">
        {color && <span className="bs-dot" style={{ background: color }} />}
        {label}
      </span>
      <span className="dots" />
      <span className={`val${strong ? " b" : ""}${red ? " red" : ""}`}>{value}</span>
    </div>
  );

  return (
    <div className="bs">
      <style>{CSS}</style>

      {onboarding && <Onboarding onDone={finishOnboarding} />}

      <div className="bs-shell">
        {/* ---------------- header ---------------- */}
        <header className="bs-head">
          <div className="bs-title">
            <span className="bs-mark">⊟</span>
            <div>
              <h1>Tabby</h1>
              <p>Who had what — who owes what.</p>
            </div>
          </div>
          <div className="bs-head-actions">
            <label className="bs-cur" aria-label="Currency">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            {canInstall && (
              <button className="bs-ghost" onClick={installApp}>Install app</button>
            )}
            <button className="bs-ghost" onClick={shareApp}>
              {shared ? "Link copied" : "Share"}
            </button>
            <button className="bs-ghost" onClick={() => setHistoryOpen(true)}>
              History{history.length ? ` · ${history.length}` : ""}
            </button>
            <button className="bs-ghost" onClick={resetAll}>New tab</button>
          </div>
        </header>

        {showIOSHint && isIOS && (
          <div className="bs-ios-hint" role="note">
            To install: tap the <strong>Share</strong> icon in Safari, then{" "}
            <strong>Add to Home Screen</strong>.
            <button className="bs-x" onClick={() => setShowIOSHint(false)} aria-label="Dismiss">×</button>
          </div>
        )}

        <div className="bs-grid">
          {/* ================= WORKSHEET ================= */}
          <section className="bs-card" aria-label="Bill details">
            {/* bill name + mode */}
            <div className="bs-namewrap">
              <input
                className="bs-name"
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
                placeholder="Name this bill"
                aria-label="Bill name"
              />
              <span className="bs-date">{dateStr}</span>
            </div>

            <div className="bs-seg" role="tablist" aria-label="Split mode">
              <button
                role="tab"
                aria-selected={mode === "itemized"}
                className={mode === "itemized" ? "on" : ""}
                onClick={() => setMode("itemized")}
              >
                Itemize
              </button>
              <button
                role="tab"
                aria-selected={mode === "even"}
                className={mode === "even" ? "on" : ""}
                onClick={() => setMode("even")}
              >
                Even split
              </button>
            </div>

            {/* people */}
            <div className="bs-block">
              <div className="bs-eyebrow">People</div>
              <div className="bs-people">
                {people.map((p) => (
                  <span className="bs-chip person" key={p.id}>
                    <span className="bs-dot" style={{ background: p.color }} />
                    {p.name}
                    <button
                      className="bs-x"
                      onClick={() => removePerson(p.id)}
                      aria-label={`Remove ${p.name}`}
                    >×</button>
                  </span>
                ))}
                <span className="bs-add-person">
                  <input
                    value={newPerson}
                    onChange={(e) => setNewPerson(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPerson()}
                    placeholder="Add person"
                    aria-label="New person name"
                  />
                  <button onClick={addPerson} aria-label="Add person">+</button>
                </span>
              </div>
              {!hasPeople && <p className="bs-hint">Add who's splitting to begin.</p>}
            </div>

            {/* itemized */}
            {mode === "itemized" ? (
              <div className="bs-block">
                <div className="bs-eyebrow">Items</div>
                <div className="bs-items">
                  {items.map((i) => {
                    const shared = i.split === "shared";
                    const allOn =
                      people.length > 0 && people.every((p) => i.assignedTo.includes(p.id));
                    return (
                      <div className="bs-item" key={i.id}>
                        <div className="bs-item-top">
                          <input
                            className="bs-item-name"
                            value={i.name}
                            onChange={(e) => updateItem(i.id, { name: e.target.value })}
                            placeholder="Item"
                            aria-label="Item name"
                          />
                          <div className="bs-amount">
                            <span>{currency}</span>
                            <input
                              className="bs-item-price"
                              value={i.price}
                              inputMode="decimal"
                              onChange={(e) => updateItem(i.id, { price: e.target.value })}
                              placeholder="0"
                              aria-label="Item price"
                            />
                          </div>
                          <button
                            className="bs-x big"
                            onClick={() => removeItem(i.id)}
                            aria-label="Remove item"
                          >×</button>
                        </div>

                        {hasPeople && (
                          <div className="bs-item-split">
                            <div className="bs-seg mini">
                              <button
                                className={shared ? "on" : ""}
                                onClick={() => setSplit(i.id, "shared")}
                              >Shared</button>
                              <button
                                className={!shared ? "on" : ""}
                                onClick={() => setSplit(i.id, "assigned")}
                              >Assigned</button>
                            </div>
                            {shared && (
                              <span className="bs-shared-note">
                                Split across everyone · {people.length}
                              </span>
                            )}
                          </div>
                        )}

                        {hasPeople && !shared && (
                          <div className="bs-assign">
                            {people.map((p) => {
                              const on = i.assignedTo.includes(p.id);
                              return (
                                <button
                                  key={p.id}
                                  className={`bs-chip mini${on ? " on" : ""}`}
                                  style={on ? { borderColor: p.color, color: p.color } : undefined}
                                  onClick={() => toggleAssign(i.id, p.id)}
                                >
                                  <span className="bs-dot" style={{ background: p.color }} />
                                  {p.name}
                                </button>
                              );
                            })}
                            <button className="bs-allbtn" onClick={() => assignAll(i.id)}>
                              {allOn ? "Clear" : "Everyone"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button className="bs-additem" onClick={addItem}>+ Add item</button>
                </div>
              </div>
            ) : (
              <div className="bs-block">
                <div className="bs-eyebrow">Bill total</div>
                <div className="bs-amount big">
                  <span>{currency}</span>
                  <input
                    value={totalAmount}
                    inputMode="decimal"
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="0"
                    aria-label="Total amount"
                  />
                </div>
                <p className="bs-hint">Split equally across everyone above.</p>
              </div>
            )}

            {/* tax + tip */}
            <div className="bs-block bs-tt">
              <Adjuster
                label="Tax"
                value={taxVal}
                setValue={setTaxVal}
                mode={taxMode}
                setMode={setTaxMode}
                currency={currency}
              />
              <Adjuster
                label="Tip"
                value={tipVal}
                setValue={setTipVal}
                mode={tipMode}
                setMode={setTipMode}
                currency={currency}
                quick={["10", "15", "18", "20"]}
              />
            </div>
          </section>

          {/* ================= RECEIPT ================= */}
          <div className="bs-receipt-wrap">
            <div className="bs-receipt">
              <Perf />
              <div className="bs-r-head">
                <div className="bs-r-name">{(billName || "Untitled").toUpperCase()}</div>
                <div className="bs-r-meta">
                  {dateStr} · {people.length} {people.length === 1 ? "guest" : "guests"} ·{" "}
                  {mode === "itemized" ? "itemized" : "even split"}
                </div>
              </div>

              {!ready ? (
                <div className="bs-r-empty">
                  {hasPeople
                    ? mode === "itemized"
                      ? "Add priced items to print the split."
                      : "Enter the bill total to print the split."
                    : "Add people to print the split."}
                </div>
              ) : (
                <>
                  <div className="bs-r-section">
                    {computed.breakdown.map((b) => (
                      <div className="bs-person-block" key={b.id}>
                        <RRow label={b.name || "—"} value={fmt(b.total)} strong color={b.color} />
                        {b.lines.map((ln, idx) => (
                          <RRow
                            key={idx}
                            small
                            ind
                            label={`${ln.name}${ln.tag ? ` (${ln.tag})` : ""}`}
                            value={fmt(ln.amt)}
                          />
                        ))}
                        {(b.tax > 0 || b.tip > 0) && (
                          <RRow small ind label="tax + tip" value={fmt(b.tax + b.tip)} />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="bs-rule double" />

                  <div className="bs-r-section">
                    <RRow label="Subtotal" value={fmt(computed.billSubtotal)} />
                    {computed.taxValue > 0 && <RRow label="Tax" value={fmt(computed.taxValue)} />}
                    {computed.tipValue > 0 && <RRow label="Tip" value={fmt(computed.tipValue)} />}
                    <RRow label="TOTAL" value={fmt(computed.grand)} strong red />
                  </div>

                  {computed.unassigned.length > 0 && (
                    <div className="bs-warn">
                      {computed.unassigned.length} priced{" "}
                      {computed.unassigned.length === 1 ? "item is" : "items are"} unassigned —
                      mark them Shared or tap who had them.
                    </div>
                  )}

                  <div className="bs-stamp" aria-hidden="true">SETTLE UP</div>
                  <div className="bs-barcode" aria-hidden="true" />
                  <div className="bs-r-foot">
                    NO.{String(Math.abs(hashStr(billName + people.length))).slice(0, 8)} ·
                    THANK YOU
                  </div>

                  <div className="bs-r-actions">
                    <button className="bs-copy" onClick={copySplit}>
                      {copied ? "Copied to clipboard" : "Copy split"}
                    </button>
                    <button className="bs-copy ghost" onClick={saveBill}>
                      {justSaved ? "Saved to history" : "Save bill"}
                    </button>
                  </div>
                </>
              )}
              <Perf bottom />
            </div>
          </div>
        </div>
      </div>

      {/* ================= HISTORY PANEL ================= */}
      {historyOpen && (
        <div className="bs-overlay" onClick={() => setHistoryOpen(false)}>
          <aside
            className="bs-panel"
            role="dialog"
            aria-label="Saved bills"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bs-panel-head">
              <div className="bs-eyebrow">Saved bills</div>
              <button
                className="bs-x big"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close history"
              >×</button>
            </div>
            {history.length === 0 ? (
              <p className="bs-hint">
                No saved bills yet. Tap <strong>Save bill</strong> on a receipt to keep it here.
              </p>
            ) : (
              <ul className="bs-history">
                {history.map((e) => (
                  <li key={e.id} className="bs-hentry">
                    <button className="bs-hentry-main" onClick={() => loadBill(e)}>
                      <span className="bs-hentry-name">{e.bill.billName || "Untitled"}</span>
                      <span className="bs-hentry-meta">
                        {fmtSavedDate(e.savedAt)} · {e.peopleCount}{" "}
                        {e.peopleCount === 1 ? "guest" : "guests"}
                      </span>
                      <span className="bs-hentry-total">
                        {(e.bill.currency || "₹") +
                          (isFinite(e.total) ? e.total : 0).toLocaleString(
                            e.bill.currency === "₹" ? "en-IN" : "en-US",
                            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                          )}
                      </span>
                    </button>
                    <button
                      className="bs-x"
                      onClick={() => deleteBill(e.id)}
                      aria-label={`Delete ${e.bill.billName || "bill"}`}
                    >×</button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/* first-run onboarding */
function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);          // 0 = your name, 1 = friends
  const [me, setMe] = useState("");
  const [friends, setFriends] = useState([]);
  const [draft, setDraft] = useState("");

  const addFriend = () => {
    const n = draft.trim();
    if (!n) return;
    setFriends((f) => [...f, n]);
    setDraft("");
  };
  const removeFriend = (idx) => setFriends((f) => f.filter((_, i) => i !== idx));

  const goNext = () => {
    if (!me.trim()) return;
    setStep(1);
  };
  const finish = () => {
    // commit any half-typed friend, then seed: me first, then friends.
    const pending = draft.trim();
    const all = [me, ...friends, ...(pending ? [pending] : [])];
    onDone(all);
  };

  return (
    <div className="bs-onboard">
      <div className="bs-onboard-card">
        <span className="bs-mark big">⊟</span>
        {step === 0 ? (
          <>
            <h2>Welcome to Tabby</h2>
            <p className="bs-onboard-sub">Split any bill like a receipt. First — what's your name?</p>
            <div className="bs-onboard-field">
              <input
                autoFocus
                value={me}
                onChange={(e) => setMe(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goNext()}
                placeholder="Your name"
                aria-label="Your name"
              />
            </div>
            <button className="bs-onboard-btn" onClick={goNext} disabled={!me.trim()}>
              Next
            </button>
          </>
        ) : (
          <>
            <h2>Who are you splitting with?</h2>
            <p className="bs-onboard-sub">
              Add the friends you're eating out with. You can always add more later.
            </p>
            <div className="bs-onboard-field">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addFriend()}
                placeholder="Friend's name"
                aria-label="Friend's name"
              />
              <button className="bs-onboard-add" onClick={addFriend} aria-label="Add friend">+</button>
            </div>
            <div className="bs-onboard-chips">
              <span className="bs-chip person">
                <span className="bs-dot" style={{ background: PALETTE[0] }} />
                {me.trim() || "You"}
              </span>
              {friends.map((f, idx) => (
                <span className="bs-chip person" key={idx}>
                  <span className="bs-dot" style={{ background: PALETTE[(idx + 1) % PALETTE.length] }} />
                  {f}
                  <button className="bs-x" onClick={() => removeFriend(idx)} aria-label={`Remove ${f}`}>×</button>
                </span>
              ))}
            </div>
            <button className="bs-onboard-btn" onClick={finish}>
              Start splitting
            </button>
            <button className="bs-onboard-skip" onClick={() => onDone([me])}>
              Just me for now
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* tax / tip control */
function Adjuster({ label, value, setValue, mode, setMode, currency, quick }) {
  return (
    <div className="bs-adj">
      <div className="bs-adj-row">
        <span className="bs-eyebrow">{label}</span>
        <div className="bs-seg mini">
          <button className={mode === "pct" ? "on" : ""} onClick={() => setMode("pct")}>%</button>
          <button className={mode === "flat" ? "on" : ""} onClick={() => setMode("flat")}>{currency}</button>
        </div>
      </div>
      <div className="bs-amount">
        <span>{mode === "pct" ? "%" : currency}</span>
        <input
          value={value}
          inputMode="decimal"
          onChange={(e) => setValue(e.target.value)}
          placeholder="0"
          aria-label={`${label} ${mode === "pct" ? "percent" : "amount"}`}
        />
      </div>
      {quick && mode === "pct" && (
        <div className="bs-quick">
          {quick.map((q) => (
            <button key={q} className={value === q ? "on" : ""} onClick={() => setValue(q)}>
              {q}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Perf({ bottom }) {
  return (
    <div className={`bs-perf${bottom ? " bottom" : ""}`} aria-hidden="true">
      <span className="notch l" />
      <span className="line" />
      <span className="notch r" />
    </div>
  );
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h || 4827193;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.bs {
  --paper:#ECEBE3; --ink:#20201C; --pen:#2E3A66; --stamp:#B5362A;
  --muted:#8C897C; --line:#CFCCC0; --receipt:#F8F7F2;
  --disp:'Space Grotesk', system-ui, sans-serif;
  --mono:'IBM Plex Mono', ui-monospace, monospace;
  font-family:var(--disp); color:var(--ink); background:var(--paper);
  min-height:100vh; -webkit-font-smoothing:antialiased; position:relative;
}
.bs *{ box-sizing:border-box; }
.bs::before{
  content:""; position:fixed; inset:0; pointer-events:none; opacity:.5; z-index:0;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
}
.bs-shell{ position:relative; z-index:1; max-width:1040px; margin:0 auto; padding:clamp(16px,4vw,40px); }

.bs-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
.bs-title{ display:flex; align-items:center; gap:12px; }
.bs-mark{ font-size:30px; line-height:1; color:var(--pen); }
.bs-title h1{ font-size:24px; font-weight:700; letter-spacing:-.02em; margin:0; }
.bs-title p{ margin:2px 0 0; font-size:13px; color:var(--muted); font-family:var(--mono); }
.bs-head-actions{ display:flex; align-items:center; gap:8px; }
.bs-cur select{
  font-family:var(--mono); font-size:15px; border:1px solid var(--line); background:var(--receipt);
  border-radius:8px; padding:8px 10px; color:var(--ink); cursor:pointer;
}
.bs-ghost{
  font-family:var(--mono); font-size:13px; border:1px solid var(--line); background:transparent;
  border-radius:8px; padding:9px 12px; color:var(--ink); cursor:pointer; transition:background .15s;
}
.bs-ghost:hover{ background:#fff; }

.bs-grid{ display:grid; gap:24px; grid-template-columns:1fr; align-items:start; }
@media(min-width:860px){ .bs-grid{ grid-template-columns:1.04fr .96fr; } .bs-receipt-wrap{ position:sticky; top:24px; } }

.bs-card{
  background:var(--receipt); border:1px solid var(--line); border-radius:16px;
  padding:clamp(16px,3vw,24px);
  box-shadow:0 1px 0 rgba(0,0,0,.03), 0 24px 50px -34px rgba(32,32,28,.55);
}
.bs-namewrap{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; border-bottom:1px dashed var(--line); padding-bottom:14px; margin-bottom:16px; }
.bs-name{
  font-family:var(--disp); font-weight:600; font-size:22px; letter-spacing:-.01em;
  border:none; background:transparent; color:var(--ink); width:100%; padding:0;
}
.bs-name:focus-visible{ outline:none; }
.bs-date{ font-family:var(--mono); font-size:12px; color:var(--muted); white-space:nowrap; }

.bs-eyebrow{ font-family:var(--mono); font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); margin-bottom:10px; }
.bs-block{ margin-top:20px; }
.bs-hint{ font-family:var(--mono); font-size:12px; color:var(--muted); margin:10px 0 0; }

.bs-seg{ display:inline-flex; border:1px solid var(--line); border-radius:10px; padding:3px; background:#fff; gap:3px; }
.bs-seg button{
  font-family:var(--disp); font-weight:500; font-size:14px; border:none; background:transparent;
  padding:8px 18px; border-radius:7px; color:var(--muted); cursor:pointer; transition:.15s;
}
.bs-seg button.on{ background:var(--pen); color:#fff; }
.bs-seg.mini button{ padding:5px 12px; font-size:12.5px; }

.bs-people{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.bs-chip{
  display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line);
  border-radius:999px; padding:7px 12px; font-size:13px; font-family:var(--disp); background:#fff; line-height:1;
}
.bs-chip.person{ padding-right:8px; }
.bs-dot{ width:9px; height:9px; border-radius:50%; flex:none; display:inline-block; }
.bs-x{ border:none; background:transparent; color:var(--muted); cursor:pointer; font-size:16px; line-height:1; padding:0 2px; }
.bs-x:hover{ color:var(--stamp); }
.bs-x.big{ font-size:20px; align-self:center; }
.bs-add-person{ display:inline-flex; align-items:center; border:1px dashed var(--line); border-radius:999px; overflow:hidden; background:transparent; }
.bs-add-person input{ border:none; background:transparent; font-family:var(--disp); font-size:13px; padding:7px 4px 7px 12px; width:108px; color:var(--ink); }
.bs-add-person input:focus-visible{ outline:none; }
.bs-add-person button{ border:none; background:transparent; font-size:18px; color:var(--pen); cursor:pointer; padding:4px 12px 6px; }

.bs-items{ display:flex; flex-direction:column; gap:10px; }
.bs-item{ border:1px dashed var(--line); border-radius:12px; padding:12px; background:rgba(255,255,255,.4); }
.bs-item-top{ display:flex; gap:10px; align-items:center; }
.bs-item-name{ flex:1; min-width:0; border:none; border-bottom:1px solid var(--line); background:transparent; font-family:var(--disp); font-size:15px; padding:6px 2px; color:var(--ink); }
.bs-item-name:focus-visible{ outline:none; border-bottom-color:var(--pen); }
.bs-amount{ display:inline-flex; align-items:center; gap:4px; border:1px solid var(--line); border-radius:8px; background:#fff; padding:0 10px; }
.bs-amount span{ font-family:var(--mono); font-size:13px; color:var(--muted); }
.bs-amount input{ border:none; background:transparent; font-family:var(--mono); font-size:15px; padding:9px 0; width:78px; text-align:right; color:var(--ink); font-variant-numeric:tabular-nums; }
.bs-amount input:focus-visible{ outline:none; }
.bs-amount.big{ padding:2px 14px; }
.bs-amount.big input{ width:100%; min-width:120px; font-size:22px; text-align:left; padding:12px 0; }

.bs-item-split{ display:flex; align-items:center; gap:10px; margin-top:11px; flex-wrap:wrap; }
.bs-shared-note{ font-family:var(--mono); font-size:11.5px; color:var(--muted); letter-spacing:.02em; }

.bs-assign{ display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.bs-chip.mini{ padding:5px 9px; font-size:12px; cursor:pointer; transition:.12s; opacity:.55; }
.bs-chip.mini.on{ opacity:1; background:#fff; font-weight:500; }
.bs-allbtn{ font-family:var(--mono); font-size:11px; letter-spacing:.04em; border:1px solid var(--line); background:transparent; border-radius:999px; padding:5px 10px; color:var(--muted); cursor:pointer; }
.bs-allbtn:hover{ color:var(--ink); }
.bs-additem{ font-family:var(--mono); font-size:13px; border:1px dashed var(--line); background:transparent; border-radius:12px; padding:12px; color:var(--muted); cursor:pointer; transition:.15s; }
.bs-additem:hover{ color:var(--pen); border-color:var(--pen); background:rgba(46,58,102,.04); }

.bs-tt{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.bs-adj-row{ display:flex; align-items:center; justify-content:space-between; }
.bs-adj .bs-eyebrow{ margin-bottom:0; }
.bs-adj .bs-amount{ margin-top:10px; width:100%; }
.bs-adj .bs-amount input{ width:100%; }
.bs-quick{ display:flex; gap:5px; margin-top:8px; }
.bs-quick button{ flex:1; font-family:var(--mono); font-size:12px; border:1px solid var(--line); background:#fff; border-radius:6px; padding:6px 0; color:var(--muted); cursor:pointer; transition:.12s; }
.bs-quick button.on{ background:var(--pen); color:#fff; border-color:var(--pen); }

/* ---------------- receipt ---------------- */
.bs-receipt{ background:var(--receipt); border-radius:5px; padding:8px clamp(18px,3vw,30px); position:relative; box-shadow:0 26px 56px -30px rgba(0,0,0,.6); font-family:var(--mono); }
.bs-perf{ position:relative; height:18px; display:flex; align-items:center; }
.bs-perf .line{ flex:1; border-top:2px dashed var(--line); margin:0 6px; }
.bs-perf .notch{ width:16px; height:16px; border-radius:50%; background:var(--paper); flex:none; }
.bs-perf .notch.l{ margin-left:-30px; } .bs-perf .notch.r{ margin-right:-30px; }

.bs-r-head{ text-align:center; padding:6px 0 14px; }
.bs-r-name{ font-family:var(--disp); font-weight:700; font-size:18px; letter-spacing:.08em; }
.bs-r-meta{ font-size:11px; color:var(--muted); letter-spacing:.04em; margin-top:4px; }
.bs-r-empty{ text-align:center; color:var(--muted); font-size:13px; padding:34px 10px; line-height:1.6; }
.bs-r-section{ padding:6px 0; }
.bs-person-block{ padding:7px 0; }
.bs-person-block + .bs-person-block{ border-top:1px dotted var(--line); }

.bs-rrow{ display:flex; align-items:flex-end; gap:6px; padding:3px 0; font-size:14px; }
.bs-rrow.sm{ font-size:11.5px; color:var(--muted); padding:1px 0; }
.bs-rrow.ind{ padding-left:14px; }
.bs-rrow .lab{ display:inline-flex; align-items:center; gap:7px; }
.bs-rrow .dots{ flex:1; border-bottom:1px dotted var(--line); transform:translateY(-3px); min-width:14px; }
.bs-rrow .val{ font-variant-numeric:tabular-nums; white-space:nowrap; }
.bs-rrow .val.b{ font-weight:600; }
.bs-rrow .val.red{ color:var(--stamp); }
.bs-rrow .lab .bs-dot{ margin-bottom:1px; }

.bs-rule{ height:1px; background:var(--line); margin:6px 0; }
.bs-rule.double{ height:0; border-top:1px solid var(--ink); border-bottom:1px solid var(--ink); padding-top:3px; opacity:.65; }
.bs-r-section:last-of-type .bs-rrow:last-child{ font-size:17px; padding-top:6px; }

.bs-warn{ font-size:11px; color:var(--stamp); background:rgba(181,54,42,.07); border:1px solid rgba(181,54,42,.2); border-radius:6px; padding:8px 10px; margin-top:12px; line-height:1.5; }

.bs-stamp{ position:absolute; right:18px; bottom:96px; font-family:var(--disp); font-weight:700; font-size:18px; letter-spacing:.12em; color:var(--stamp); border:2px solid var(--stamp); border-radius:6px; padding:5px 9px; transform:rotate(-9deg); opacity:.16; pointer-events:none; }
.bs-barcode{ height:46px; margin:18px 0 6px; background-image:repeating-linear-gradient(90deg, var(--ink) 0 2px, transparent 2px 4px, var(--ink) 4px 5px, transparent 5px 9px, var(--ink) 9px 11px, transparent 11px 13px, var(--ink) 13px 16px, transparent 16px 18px); opacity:.82; }
.bs-r-foot{ text-align:center; font-size:10px; letter-spacing:.18em; color:var(--muted); padding-bottom:8px; }

.bs-r-actions{ display:flex; gap:8px; margin:6px 0 4px; }
.bs-copy{ flex:1; font-family:var(--mono); font-size:13px; letter-spacing:.06em; text-transform:uppercase; border:1px solid var(--ink); background:var(--ink); color:var(--receipt); border-radius:8px; padding:13px; cursor:pointer; transition:.15s; }
.bs-copy:hover{ background:transparent; color:var(--ink); }
.bs-copy.ghost{ background:transparent; color:var(--ink); }
.bs-copy.ghost:hover{ background:var(--ink); color:var(--receipt); }

/* iOS install hint */
.bs-ios-hint{ position:relative; font-family:var(--mono); font-size:12.5px; line-height:1.5; color:var(--ink); background:var(--receipt); border:1px solid var(--line); border-radius:10px; padding:12px 36px 12px 14px; margin:0 0 20px; }
.bs-ios-hint .bs-x{ position:absolute; top:8px; right:8px; }

/* history panel */
.bs-overlay{ position:fixed; inset:0; z-index:50; background:rgba(32,32,28,.34); display:flex; justify-content:flex-end; animation:bs-fade .15s ease; }
.bs-panel{ width:min(380px,90vw); height:100%; background:var(--paper); border-left:1px solid var(--line); box-shadow:-24px 0 50px -34px rgba(0,0,0,.6); padding:clamp(16px,4vw,24px); overflow-y:auto; animation:bs-slide .2s ease; }
.bs-panel-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.bs-panel-head .bs-eyebrow{ margin-bottom:0; }
.bs-history{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
.bs-hentry{ display:flex; align-items:stretch; gap:6px; border:1px solid var(--line); border-radius:12px; background:var(--receipt); overflow:hidden; }
.bs-hentry-main{ flex:1; display:grid; grid-template-columns:1fr auto; grid-template-areas:"name total" "meta total"; align-items:center; gap:0 10px; text-align:left; border:none; background:transparent; padding:12px 6px 12px 14px; cursor:pointer; transition:background .12s; }
.bs-hentry-main:hover{ background:#fff; }
.bs-hentry-name{ grid-area:name; font-family:var(--disp); font-weight:600; font-size:15px; }
.bs-hentry-meta{ grid-area:meta; font-family:var(--mono); font-size:11px; color:var(--muted); margin-top:2px; }
.bs-hentry-total{ grid-area:total; font-family:var(--mono); font-size:15px; font-variant-numeric:tabular-nums; }
.bs-hentry > .bs-x{ padding:0 12px; }
@keyframes bs-fade{ from{ opacity:0; } to{ opacity:1; } }
@keyframes bs-slide{ from{ transform:translateX(16px); opacity:.4; } to{ transform:translateX(0); opacity:1; } }

/* onboarding */
.bs-onboard{ position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(32,32,28,.42); animation:bs-fade .18s ease; }
.bs-onboard-card{ width:min(420px,100%); background:var(--receipt); border:1px solid var(--line); border-radius:18px; padding:clamp(22px,5vw,32px); box-shadow:0 30px 60px -30px rgba(0,0,0,.6); animation:bs-pop .22s ease; }
.bs-onboard-card .bs-mark.big{ display:block; font-size:38px; color:var(--pen); margin-bottom:8px; }
.bs-onboard-card h2{ font-family:var(--disp); font-weight:700; font-size:22px; letter-spacing:-.02em; margin:0 0 6px; }
.bs-onboard-sub{ font-family:var(--mono); font-size:13px; line-height:1.55; color:var(--muted); margin:0 0 18px; }
.bs-onboard-field{ display:flex; gap:8px; align-items:center; border:1px solid var(--line); border-radius:10px; background:#fff; padding:0 6px 0 14px; }
.bs-onboard-field input{ flex:1; border:none; background:transparent; font-family:var(--disp); font-size:16px; padding:13px 0; color:var(--ink); }
.bs-onboard-field input:focus-visible{ outline:none; }
.bs-onboard-add{ border:none; background:transparent; font-size:22px; color:var(--pen); cursor:pointer; padding:4px 10px 6px; }
.bs-onboard-chips{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.bs-onboard-btn{ width:100%; margin-top:18px; font-family:var(--mono); font-size:13px; letter-spacing:.06em; text-transform:uppercase; border:1px solid var(--ink); background:var(--ink); color:var(--receipt); border-radius:9px; padding:14px; cursor:pointer; transition:.15s; }
.bs-onboard-btn:hover:not(:disabled){ background:transparent; color:var(--ink); }
.bs-onboard-btn:disabled{ opacity:.4; cursor:not-allowed; }
.bs-onboard-skip{ width:100%; margin-top:8px; font-family:var(--mono); font-size:12px; border:none; background:transparent; color:var(--muted); cursor:pointer; padding:6px; }
.bs-onboard-skip:hover{ color:var(--ink); }
@keyframes bs-pop{ from{ transform:translateY(10px) scale(.98); opacity:.5; } to{ transform:translateY(0) scale(1); opacity:1; } }

.bs input:focus-visible, .bs button:focus-visible, .bs select:focus-visible{ outline:2px solid var(--pen); outline-offset:2px; }

@media(max-width:520px){
  .bs-tt{ grid-template-columns:1fr; }
  .bs-stamp{ bottom:104px; right:10px; }
}
@media(prefers-reduced-motion:reduce){ .bs *{ transition:none !important; } .bs-overlay, .bs-panel, .bs-onboard, .bs-onboard-card{ animation:none !important; } }
`;
