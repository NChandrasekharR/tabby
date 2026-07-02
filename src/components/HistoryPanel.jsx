import React, { useRef } from "react";

const fmtSavedDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "";
  }
};

const fmtTotal = (entry) =>
  (entry.bill.currency || "₹") +
  (isFinite(entry.total) ? entry.total : 0).toLocaleString(
    entry.bill.currency === "₹" ? "en-IN" : "en-US",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  );

/* Slide-in panel of saved bills, with backup export/import in the footer. */
export default function HistoryPanel({
  history, onClose, onLoad, onDelete, onExport, onImportFile, importMsg,
}) {
  const importRef = useRef(null);

  return (
    <div className="bs-overlay" onClick={onClose}>
      <aside
        className="bs-panel"
        role="dialog"
        aria-label="Saved bills"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bs-panel-head">
          <div className="bs-eyebrow">Saved bills</div>
          <button className="bs-x big" onClick={onClose} aria-label="Close history">×</button>
        </div>
        {history.length === 0 ? (
          <p className="bs-hint">
            No saved bills yet. Tap <strong>Save bill</strong> on a receipt to keep it here.
          </p>
        ) : (
          <ul className="bs-history">
            {history.map((e) => (
              <li key={e.id} className="bs-hentry">
                <button className="bs-hentry-main" onClick={() => onLoad(e)}>
                  <span className="bs-hentry-name">{e.bill.billName || "Untitled"}</span>
                  <span className="bs-hentry-meta">
                    {fmtSavedDate(e.savedAt)} · {e.peopleCount}{" "}
                    {e.peopleCount === 1 ? "guest" : "guests"}
                  </span>
                  <span className="bs-hentry-total">{fmtTotal(e)}</span>
                </button>
                <button
                  className="bs-x"
                  onClick={() => onDelete(e.id)}
                  aria-label={`Delete ${e.bill.billName || "bill"}`}
                >×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="bs-panel-foot">
          <button className="bs-ghost" onClick={onExport}>Export backup</button>
          <button className="bs-ghost" onClick={() => importRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              onImportFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        <p className="bs-hint">
          {importMsg ||
            "Bills live only on this device — export a backup file to keep them safe."}
        </p>
      </aside>
    </div>
  );
}
