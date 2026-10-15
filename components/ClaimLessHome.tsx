"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ClaimLessHome() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function create(demo: boolean) {
    setLoading(true);
    setError("");
    try {
      const response = demo
        ? await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo: true }) })
        : await fetch("/api/cases", { method: "POST", body: (() => { const form = new FormData(); if (file) form.set("bill", file); return form; })() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not analyze the bill");
      router.push(`/cases/${result.case.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main className="landing">
      <nav className="nav shell">
        <a className="brand" href="#"><span className="brand-mark">C</span>ClaimLess</a>
        <div className="nav-proof"><span className="live-dot" /> Voice advocacy powered by Twilio</div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow">Your AI medical bill advocate</div>
          <h1>Understand the bill.<br /><em>Make the call.</em></h1>
          <p className="hero-sub">Upload an itemized medical bill. ClaimLess finds charges worth questioning, learns what you want, then calls billing on your behalf—with your approval and boundaries.</p>
          <div className="trust-row">
            <span>✓ Evidence-grounded</span><span>✓ Human approved</span><span>✓ Full call transcript</span>
          </div>
        </div>

        <div className="upload-card">
          <div className="upload-card-top">
            <span className="step-kicker">Start a bill review</span>
            <span className="secure-pill">Private by design</span>
          </div>
          <button className={`dropzone ${file ? "has-file" : ""}`} onClick={() => input.current?.click()} type="button">
            <input ref={input} hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <span className="upload-icon">{file ? "✓" : "↑"}</span>
            <strong>{file ? file.name : "Drop your itemized bill here"}</strong>
            <small>{file ? `${(file.size / 1024).toFixed(0)} KB · Ready to audit` : "PDF, photo, or text · up to 12 MB"}</small>
          </button>
          <button className="primary wide" disabled={!file || loading} onClick={() => void create(false)}>
            {loading && file ? "ClaimLess is reading every line…" : "Analyze my bill"}
          </button>
          <div className="or"><span>or</span></div>
          <button className="demo-button" disabled={loading} onClick={() => void create(true)}>
            <span className="play">▶</span><span><strong>Launch the live demo</strong><small>Preloaded $4,400 hospital bill</small></span><span>→</span>
          </button>
          {error && <p className="form-error">{error}</p>}
        </div>
      </section>

      <section className="how shell">
        <div className="section-label">One bill. One advocate. A clear outcome.</div>
        <div className="steps-grid">
          {[
            ["01", "Bill intelligence", "Reads every line, checks the math, and surfaces duplicates, unclear charges, and insurance mismatches."],
            ["02", "Patient interview", "Asks what happened, what you want changed, and the outcome you are comfortable authorizing."],
            ["03", "Live advocacy", "Calls the hospital or insurer through Twilio, handles pushback, and asks for a documented resolution."],
            ["04", "Proof & next steps", "Saves the transcript, confirmed outcome, and exactly what needs to happen next."],
          ].map(([number, title, body]) => <article className="step-card" key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}
        </div>
      </section>
      <footer className="shell footer"><span>ClaimLess</span><span>AI Healthcare Hack NYC · Arya Health × Twilio</span></footer>
    </main>
  );
}
