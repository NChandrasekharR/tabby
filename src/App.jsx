import React, { useState, useMemo, useEffect } from "react";
import { computeSplit, parseNum } from "./lib/split";
import {
  hasOnboarded, markOnboarded, loadState, saveState,
  loadHistory, saveHistory, buildBackup, mergeHistory,
} from "./lib/storage";
import { PALETTE, CURRENCIES, uid } from "./lib/constants";
import { makeSeed, demoItems } from "./lib/seed";
import Onboarding from "./components/Onboarding";
import HistoryPanel from "./components/HistoryPanel";
import "./styles.css";

/* ------------------------------------------------------------------ *
 * Tabby — a bill splitter built like a receipt.
 * Itemize, and mark each line as it really was:
 *   · Shared    → divides equally across everyone
 *   · Assigned  → tap who actually had it (splits among them if >1)
 * Tax + tip distribute proportionally to each person's subtotal.
 * Or skip items entirely and split one total evenly.
 * The result prints as a per-person receipt you can copy to a chat.
 *
 * Split math lives in src/lib/split.js (pure, tested);
 * persistence in src/lib/storage.js.
 * ------------------------------------------------------------------ */

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

  // "New tab" confirmation + backup import feedback.
  const [confirmNew, setConfirmNew] = useState(false);
  const [importMsg, setImportMsg] = useState("");

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
    saveState({
      billName, currency, mode, people, items,
      totalAmount, taxVal, taxMode, tipVal, tipMode,
    });
  }, [billName, currency, mode, people, items, totalAmount, taxVal, taxMode, tipVal, tipMode]);

  // Persist the saved-bill history.
  useEffect(() => {
    saveHistory(history);
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

  // Lock body scroll while the immersive onboarding is open, and reset to the
  // top of the bill once it closes (the keyboard can leave the page scrolled).
  useEffect(() => {
    if (!onboarding) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      // Reset now and again next frame — the virtual keyboard can re-scroll
      // the page as it collapses after the overlay unmounts.
      window.scrollTo(0, 0);
      requestAnimationFrame(() => window.scrollTo(0, 0));
    };
  }, [onboarding]);

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
    setConfirmNew(false);
  };

  // Anything on the worksheet that would hurt to lose?
  const hasBillContent =
    items.some((i) => parseNum(i.price) > 0) ||
    (mode === "even" && parseNum(totalAmount) > 0);

  const requestNewTab = () => {
    if (!hasBillContent && people.length === 0) {
      resetAll();
      return;
    }
    setConfirmNew(true);
  };

  const saveAndReset = () => {
    saveBill();
    resetAll();
  };

  /* ---------- math (pure module — see src/lib/split.js + tests) ---------- */
  const computed = useMemo(
    () => computeSplit({ mode, items, people, totalAmount, taxVal, taxMode, tipVal, tipMode }),
    [mode, items, people, totalAmount, taxVal, taxMode, tipVal, tipMode]
  );

  const copySplit = () => {
    const L = [];
    L.push(`${billName || "Bill"} · ${dateStr}`);
    L.push("");
    computed.breakdown.forEach((b) => L.push(`${(b.name || "—").padEnd(12)} ${fmt(b.totalRounded)}`));
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
    } catch {
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

  /* ---------- backup (localStorage is evictable — give users a file) ---------- */
  const exportBackup = () => {
    const draft = {
      billName, currency, mode, people, items,
      totalAmount, taxVal, taxMode, tipVal, tipMode,
    };
    const blob = new Blob([JSON.stringify(buildBackup(draft, history), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tabby-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const flashImportMsg = (msg) => {
    setImportMsg(msg);
    setTimeout(() => setImportMsg(""), 3000);
  };

  const importBackup = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => flashImportMsg("Couldn't read that file.");
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const { merged, added, found } = mergeHistory(history, data?.history);
        if (added === 0) {
          flashImportMsg(found ? "Those bills are already here." : "No bills found in that file.");
          return;
        }
        setHistory(merged);
        flashImportMsg(`Imported ${added} ${added === 1 ? "bill" : "bills"}.`);
      } catch {
        flashImportMsg("That doesn't look like a Tabby backup.");
      }
    };
    reader.readAsText(file);
  };

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
    markOnboarded();
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
            <button className="bs-ghost" onClick={requestNewTab}>New tab</button>
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
                        <RRow label={b.name || "—"} value={fmt(b.totalRounded)} strong color={b.color} />
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

                  {computed.roundingAdjustment !== 0 && people[0] && (
                    <div className="bs-r-note">
                      {computed.roundingAdjustment > 0 ? "+" : "−"}
                      {fmt(Math.abs(computed.roundingAdjustment))} rounding goes to{" "}
                      {people[0].name} so the shares add up exactly.
                    </div>
                  )}

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

      {/* ================= NEW TAB CONFIRM ================= */}
      {confirmNew && (
        <div className="bs-overlay center" onClick={() => setConfirmNew(false)}>
          <div
            className="bs-confirm"
            role="dialog"
            aria-label="Start a new tab"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Start a new tab?</h3>
            <p>
              {hasBillContent
                ? "This clears the current bill and everyone on it. Save it to history first?"
                : "This clears the people on the current tab."}
            </p>
            {hasBillContent && (
              <button className="bs-copy" onClick={saveAndReset}>Save & start new</button>
            )}
            <button className="bs-copy ghost" onClick={resetAll}>
              {hasBillContent ? "Start new without saving" : "Start new"}
            </button>
            <button className="bs-confirm-cancel" onClick={() => setConfirmNew(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ================= HISTORY PANEL ================= */}
      {historyOpen && (
        <HistoryPanel
          history={history}
          onClose={() => setHistoryOpen(false)}
          onLoad={loadBill}
          onDelete={deleteBill}
          onExport={exportBackup}
          onImportFile={importBackup}
          importMsg={importMsg}
        />
      )}
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
