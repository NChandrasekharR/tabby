import React, { useState } from "react";
import { PALETTE } from "../lib/constants";

/* First-run onboarding: your name → friends' names.
 * Calls onDone with the ordered name list (user first). */
export default function Onboarding({ onDone }) {
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
