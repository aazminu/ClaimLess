"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ActivityEvent, BillCase, InterviewAnswers } from "@/lib/types";

type Payload = { case: BillCase; events: ActivityEvent[] };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const goals = ["Remove incorrect charges", "Lower my total balance", "Fix insurance processing", "Understand what I was billed for"];
const outcomes = ["Correct and reissue the bill", "Rebill insurance", "Apply the largest available discount", "Open a formal coding review"];

export default function CaseWorkspace({ caseId }: { caseId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [answers, setAnswers] = useState<InterviewAnswers>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState(0);
  const [tab, setTab] = useState<"advocate" | "bill" | "call" | "review" | "activity">("advocate");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const choseInitialTab = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/cases/${caseId}`, { cache: "no-store" });
    if (!response.ok) return;
    const next = await response.json() as Payload;
    setPayload(next);
    if (!choseInitialTab.current) {
      if (next.case.status === "completed" || next.case.status === "needs_follow_up") setTab("review");
      choseInitialTab.current = true;
    }
    setSelected((current) => current.length ? current : next.case.issues.filter((issue) => issue.selected).map((issue) => issue.id));
    setAnswers((current) => Object.keys(current).length ? current : next.case.interview);
  }, [caseId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 1400);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const value = payload?.case;
  const activeCall = value?.calls.at(-1);
  const stage = !value ? 0 : value.status === "interview" ? 1 : value.status === "plan_ready" ? 2 : value.status === "approved" ? 3 : 4;
  async function post(path: string, body?: unknown) {
    setBusy(path);
    setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Action failed");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally { setBusy(""); }
  }

  if (!value) return <div className="loading-screen"><div className="pulse-logo">C</div><p>Opening your bill review…</p></div>;

  const questions = [
    <Question key="goal" kicker="Let’s start with the outcome" title="What do you want ClaimLess to accomplish?">
      <ChoiceGrid options={goals} selected={answers.goal} onSelect={(goal) => setAnswers({ ...answers, goal })} />
      <label className="field-label">Or tell me in your own words<textarea placeholder="Example: I think I was charged twice for the same lab and I want the balance lowered." value={answers.desiredOutcome || ""} onChange={(event) => setAnswers({ ...answers, desiredOutcome: event.target.value })} /></label>
    </Question>,
    <Question key="issues" kicker="Your experience matters" title="Did you receive every service on this bill?">
      <ChoiceGrid options={["Yes, as far as I know", "No, something is listed that I did not receive", "I’m not sure"]} selected={answers.servicesNotReceived} onSelect={(servicesNotReceived) => setAnswers({ ...answers, servicesNotReceived })} />
      <label className="field-label">Anything specific we should challenge?<textarea placeholder="Tell us what looks wrong or unfamiliar." value={answers.additionalContext || ""} onChange={(event) => setAnswers({ ...answers, additionalContext: event.target.value })} /></label>
    </Question>,
    <Question key="insurance" kicker="Insurance context" title="What did your insurer say?">
      <ChoiceGrid options={["They paid but the balance looks wrong", "They denied part of the bill", "I have not received an EOB", "This is self-pay"]} selected={answers.insuranceContext} onSelect={(insuranceContext) => setAnswers({ ...answers, insuranceContext })} />
      <label className="field-label">Have you contacted anyone already?<input placeholder="Optional: who you spoke with and what they said" value={answers.priorContact || ""} onChange={(event) => setAnswers({ ...answers, priorContact: event.target.value })} /></label>
    </Question>,
    <Question key="outcome" kicker="Set the negotiation target" title="What result should the advocate ask for?">
      <ChoiceGrid options={outcomes} selected={answers.desiredOutcome} onSelect={(desiredOutcome) => setAnswers({ ...answers, desiredOutcome })} />
      <div className="split-fields"><label>Target bill reduction<strong>{answers.targetReductionPercent ?? 25}%</strong><input type="range" min="0" max="100" step="5" value={answers.targetReductionPercent ?? 25} onChange={(event) => setAnswers({ ...answers, targetReductionPercent: Number(event.target.value) })} /></label><label>Minimum savings worth accepting<input type="number" min="0" placeholder="$0" value={answers.minimumAcceptableSavings ?? ""} onChange={(event) => setAnswers({ ...answers, minimumAcceptableSavings: Number(event.target.value) })} /></label></div>
    </Question>,
    <Question key="target" kicker="Choose who we call" title="Where should ClaimLess advocate for you?">
      <div className="target-toggle"><button className={answers.officeType !== "insurer" ? "active" : ""} onClick={() => setAnswers({ ...answers, officeType: "hospital", officeName: value.provider.name, officePhone: value.provider.phone || "" })}>Hospital billing</button><button className={answers.officeType === "insurer" ? "active" : ""} onClick={() => setAnswers({ ...answers, officeType: "insurer", officeName: value.insurer?.name || "", officePhone: value.insurer?.phone || "" })}>Insurance company</button></div>
      <div className="split-fields"><label>Office name<input value={answers.officeName ?? (answers.officeType === "insurer" ? value.insurer?.name : value.provider.name) ?? ""} onChange={(event) => setAnswers({ ...answers, officeName: event.target.value })} /></label><label>Phone number<input placeholder="+1 212 555 0123" value={answers.officePhone ?? (answers.officeType === "insurer" ? value.insurer?.phone : value.provider.phone) ?? ""} onChange={(event) => setAnswers({ ...answers, officePhone: event.target.value })} /></label></div>
      <label className="consent"><input type="checkbox" checked={answers.authorizationConfirmed || false} onChange={(event) => setAnswers({ ...answers, authorizationConfirmed: event.target.checked })} /><span><strong>I authorize ClaimLess to make this call.</strong><small>It may discuss this bill and request corrections or discounts. It cannot authorize payment or accept a binding agreement.</small></span></label>
    </Question>,
  ];

  return (
    <main className="workspace">
      <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">C</span>ClaimLess</Link><div className="case-title"><strong>{value.provider.name}</strong><span>Account {value.patient.accountNumber || value.id}</span></div><div className="top-status"><span className="live-dot" /> {value.status.replaceAll("_", " ")}</div></header>
      <div className="progress-strip">
        {["Bill audit", "Your goals", "Approve plan", "Live call", "Resolution"].map((label, index) => <div className={index <= stage ? "complete" : ""} key={label}><span>{index < stage ? "✓" : index + 1}</span>{label}</div>)}
      </div>
      <div className="workspace-grid">
        <aside className="case-sidebar">
          <div className="patient-block"><span className="avatar">{value.patient.name.split(" ").map((part) => part[0]).join("")}</span><div><strong>{value.patient.name}</strong><small>{value.bill.serviceDates || "Medical bill review"}</small></div></div>
          <div className="balance-card"><small>Patient responsibility</small><strong>{money(value.bill.patientResponsibility)}</strong><span>of {money(value.bill.totalCharges)} charged</span><div className="balance-bar"><i style={{ width: `${Math.min(100, value.bill.patientResponsibility / Math.max(1, value.bill.totalCharges) * 100)}%` }} /></div></div>
          <nav className="side-nav">
            <button className={tab === "advocate" ? "active" : ""} onClick={() => setTab("advocate")}><span>✦</span> Advocate</button>
            <button className={tab === "bill" ? "active" : ""} onClick={() => setTab("bill")}><span>▤</span> Bill audit <b>{value.issues.length}</b></button>
            <button className={tab === "call" ? "active" : ""} onClick={() => setTab("call")}><span>◉</span> Call room {activeCall?.status === "in_progress" && <i />}</button>
            <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}><span>◎</span> Call review {activeCall?.status === "completed" && <b>Ready</b>}</button>
            <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}><span>↻</span> Activity</button>
          </nav>
          <div className="guardrail"><span>⌾</span><div><strong>Human-controlled</strong><small>No call or agreement happens without your approval.</small></div></div>
        </aside>

        <section className="case-main">
          {tab === "advocate" && value.status === "interview" && <div className="interview-panel">
            <div className="agent-message"><span className="agent-avatar">C</span><div><small>ClaimLess advocate</small><p>I reviewed all {value.bill.lineItems.length} charges. I found <strong>{value.issues.length} things worth asking about</strong>, affecting up to {money(value.issues.reduce((sum, issue) => sum + issue.amountAtStake, 0))}. Before I call, I need to understand what happened and what you want.</p></div></div>
            <div className="question-progress"><span>Question {question + 1} of {questions.length}</span><i><b style={{ width: `${(question + 1) / questions.length * 100}%` }} /></i></div>
            {questions[question]}
            <div className="question-actions"><button className="secondary" disabled={question === 0} onClick={() => setQuestion(question - 1)}>Back</button>{question < questions.length - 1 ? <button className="primary" onClick={() => setQuestion(question + 1)}>Continue →</button> : <button className="primary" disabled={!answers.authorizationConfirmed || !(answers.officePhone ?? value.provider.phone)} onClick={() => void post(`/api/cases/${caseId}/plan`, { answers: { ...answers, officeType: answers.officeType || "hospital", officeName: answers.officeName || value.provider.name, officePhone: answers.officePhone || value.provider.phone }, selectedIssueIds: selected })}>{busy ? "Building the plan…" : "Build my call plan →"}</button>}</div>
          </div>}

          {tab === "advocate" && value.plan && <PlanPanel value={value} busy={busy} error={error} onApprove={() => void post(`/api/cases/${caseId}/plan`, { action: "approve" })} onCall={() => void post(`/api/cases/${caseId}/call`)} />}

          {tab === "bill" && <BillAudit value={value} selected={selected} setSelected={setSelected} />}
          {tab === "call" && <CallRoom value={value} busy={busy} onSendGuidance={(callId, promptId, answer) => void post(`/api/cases/${caseId}/calls/${callId}/guidance`, { promptId, answer })} />}
          {tab === "review" && <CallReview value={value} onOpenTranscript={() => setTab("call")} />}
          {tab === "activity" && <Activity events={payload?.events || []} />}
          {error && tab !== "advocate" && <p className="form-error">{error}</p>}
        </section>
      </div>
    </main>
  );
}

function Question({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return <div className="question-card"><span className="step-kicker">{kicker}</span><h2>{title}</h2>{children}</div>;
}

function ChoiceGrid({ options, selected, onSelect }: { options: string[]; selected?: string; onSelect: (value: string) => void }) {
  return <div className="choice-grid">{options.map((option) => <button className={selected === option ? "selected" : ""} key={option} onClick={() => onSelect(option)}><span>{selected === option ? "✓" : "○"}</span>{option}</button>)}</div>;
}

function BillAudit({ value, selected, setSelected }: { value: BillCase; selected: string[]; setSelected: (ids: string[]) => void }) {
  return <div><div className="panel-heading"><div><span className="step-kicker">AI bill audit</span><h2>{value.issues.length} items worth investigating</h2><p>{value.analysisSummary}</p></div><span className="amount-badge">{money(value.issues.reduce((sum, issue) => sum + issue.amountAtStake, 0))} flagged</span></div>
    <div className="issue-list">{value.issues.map((issue) => <article className="issue-card" key={issue.id}><label><input type="checkbox" checked={selected.includes(issue.id)} onChange={() => setSelected(selected.includes(issue.id) ? selected.filter((id) => id !== issue.id) : [...selected, issue.id])} /><span className={`severity ${issue.confidence}`} /></label><div><div className="issue-top"><strong>{issue.title}</strong><span>{money(issue.amountAtStake)}</span></div><p>{issue.explanation}</p><small>Evidence · {issue.evidence}</small><em>{issue.type.replaceAll("_", " ")}</em></div></article>)}</div>
    <div className="line-items"><h3>Every charge</h3><div className="table"><div className="tr th"><span>Date</span><span>Description</span><span>Code</span><span>Qty</span><span>Amount</span></div>{value.bill.lineItems.map((line) => <div className="tr" key={line.id}><span>{line.date || "—"}</span><span>{line.description}</span><span>{line.code || "—"}</span><span>{line.quantity}</span><strong>{money(line.amount)}</strong></div>)}</div></div>
  </div>;
}

function PlanPanel({ value, busy, error, onApprove, onCall }: { value: BillCase; busy: string; error: string; onApprove: () => void; onCall: () => void }) {
  const plan = value.plan!;
  const approved = Boolean(plan.approvedAt);
  return <div><div className="panel-heading"><div><span className="step-kicker">{approved ? "Approved advocacy plan" : "Review before anything happens"}</span><h2>{approved ? "ClaimLess is ready to call" : "Your call plan is ready"}</h2><p>Target: {plan.officeName} · {plan.officePhone}</p></div><span className={`approval-badge ${approved ? "approved" : ""}`}>{approved ? "✓ Approved" : "Approval required"}</span></div>
    <div className="plan-hero"><div><small>Primary objective</small><h3>{plan.objective}</h3></div><div><small>Target savings</small><strong>{money(plan.targetSavings)}</strong></div></div>
    <div className="plan-grid"><article><h3>What the agent will raise</h3>{plan.talkingPoints.map((point) => <p key={point}><span>✓</span>{point}</p>)}</article><article><h3>Hard boundaries</h3>{plan.boundaries.map((boundary) => <p key={boundary}><span>⌾</span>{boundary}</p>)}</article></div>
    <div className="call-preview"><span className="phone-orb">☎</span><div><strong>Real Twilio call</strong><small>The person at {plan.officePhone} will receive the call and play the billing representative.</small></div>{approved ? <button className="primary call-button" disabled={Boolean(busy) || value.status === "calling"} onClick={onCall}>{value.status === "calling" ? "Calling…" : "Call now"}</button> : <button className="primary" disabled={Boolean(busy)} onClick={onApprove}>{busy ? "Approving…" : "Approve this plan"}</button>}</div>
    {error && <p className="form-error">{error}</p>}
  </div>;
}

function CallRoom({ value, busy, onSendGuidance }: { value: BillCase; busy: string; onSendGuidance: (callId: string, promptId: string, answer: string) => void }) {
  const call = value.calls.at(-1);
  const [guidance, setGuidance] = useState("");
  if (!call) return <div className="empty-state"><span>☎</span><h2>No call yet</h2><p>Complete the advocate interview and approve the plan first.</p></div>;
  const waitingPrompt = call.guidancePrompts?.find((item) => item.status === "waiting");
  return <div><div className="call-header"><div className="call-identity"><span className={`phone-orb ${call.status === "in_progress" ? "ringing" : ""}`}>☎</span><div><small>{call.status === "in_progress" ? "LIVE CALL" : call.status.toUpperCase()}</small><h2>{value.plan?.officeName}</h2><p>{call.to}</p></div></div><div className="objective-score"><strong>{call.objectives.filter((item) => item.done).length}/{call.objectives.length}</strong><span>objectives confirmed</span></div></div>
    {waitingPrompt && <section className="guidance-prompt"><div><small>PRIVATE · AVERY NEEDS YOUR INPUT</small><h3>{waitingPrompt.question}</h3><p>{waitingPrompt.context}</p><div className="guidance-suggestions">{waitingPrompt.suggestedReplies.map((reply) => <button type="button" key={reply} onClick={() => setGuidance(reply)}>{reply}</button>)}</div></div><form onSubmit={(event) => { event.preventDefault(); const answer = guidance.trim(); if (!answer) return; onSendGuidance(call.id, waitingPrompt.id, answer); setGuidance(""); }}><textarea autoFocus value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="Tell Avery privately what to say…" /><button className="primary" disabled={!guidance.trim() || Boolean(busy)}>{busy ? "Sending…" : "Send to Avery"}</button></form></section>}
    <div className="call-grid"><div className="transcript"><h3>Hospital / insurance representative <span className="live-dot" /></h3>{call.transcript.length ? call.transcript.map((turn, index) => <div className={`turn ${turn.role}`} key={`${turn.at}-${index}`}><small>{turn.role === "agent" ? "Avery" : "Representative"}</small><p>{turn.text}</p></div>) : <div className="waiting"><i /><p>Waiting for the representative to speak first…</p></div>}</div><aside className="call-notes"><h3>Call intelligence</h3>{call.offeredAdjustment !== undefined && <div className="result-tile"><small>Offer captured</small><strong>{money(call.offeredAdjustment)}</strong></div>}<h4>Confirmed facts</h4>{call.confirmedFacts.map((fact) => <p key={fact.at}>✓ {fact.fact}</p>)}{call.summary && <><h4>Outcome summary</h4><p>{call.summary}</p></>}{call.nextSteps.map((step) => <p key={step}>→ {step}</p>)}</aside></div>
  </div>;
}

function CallReview({ value, onOpenTranscript }: { value: BillCase; onOpenTranscript: () => void }) {
  const call = [...value.calls].reverse().find((item) => item.status === "completed");
  if (!call) return <div className="empty-state"><span>◎</span><h2>No completed call to review</h2><p>The structured review will appear here as soon as the call ends.</p></div>;
  const outcomeLabels: Record<string, string> = {
    adjustment_promised: "Charge adjustment promised",
    discount_offered: "Discount offered",
    insurance_rebilling: "Being rebilled to insurance",
    investigation_opened: "Billing investigation opened",
    payment_plan_offered: "Payment plan offered",
    no_resolution: "No resolution yet",
    follow_up_required: "Follow-up required",
  };
  const completed = call.objectives.filter((item) => item.done).length;
  return <div className="review-page">
    <div className="review-success"><span>✓</span><div><small>CALL CAPTURED &amp; ANALYZED</small><h2>{call.outcome ? outcomeLabels[call.outcome] : "Call completed—review the details"}</h2><p>{call.summary || "ClaimLess saved the conversation and organized everything that was confirmed."}</p></div></div>
    <div className="review-metrics">
      <article><small>Adjustment / offer</small><strong>{call.offeredAdjustment !== undefined ? money(call.offeredAdjustment) : "Pending"}</strong><span>Target was {money(value.plan?.targetSavings || 0)}</span></article>
      <article><small>Facts confirmed</small><strong>{call.confirmedFacts.length}</strong><span>Saved from the conversation</span></article>
      <article><small>Objectives completed</small><strong>{completed} of {call.objectives.length}</strong><span>{call.confirmedFacts.length} facts confirmed</span></article>
    </div>
    <div className="review-grid">
      <article className="review-card"><div className="review-card-title"><span>01</span><h3>What the representative confirmed</h3></div>{call.confirmedFacts.length ? call.confirmedFacts.map((fact) => <p className="review-fact" key={fact.at}><span>✓</span>{fact.fact}</p>) : <p className="review-muted">No concrete facts were captured. Review the transcript before following up.</p>}</article>
      <article className="review-card"><div className="review-card-title"><span>02</span><h3>What happens next</h3></div>{call.nextSteps.length ? call.nextSteps.map((step, index) => <p className="next-step" key={step}><span>{index + 1}</span>{step}</p>) : <p className="review-muted">Review the saved conversation and request a written decision if follow-up is needed.</p>}</article>
    </div>
    <article className="review-card review-transcript-preview"><div className="review-card-title"><span>03</span><div><h3>Conversation record</h3><small>{call.transcript.length} turns · full audit trail saved</small></div><button className="secondary" onClick={onOpenTranscript}>Open full transcript →</button></div><div className="quote-strip">{call.transcript.slice(-4).map((turn, index) => <p key={`${turn.at}-${index}`}><strong>{turn.role === "agent" ? "Avery" : "Representative"}</strong>{turn.text}</p>)}</div></article>
    <div className="review-disclaimer"><span>⌾</span><p><strong>Human review checkpoint.</strong> Confirm the representative’s statements before relying on them. ClaimLess records the conversation but does not guarantee that an adjustment has been processed.</p></div>
  </div>;
}

function Activity({ events }: { events: ActivityEvent[] }) {
  return <div><div className="panel-heading"><div><span className="step-kicker">Audit trail</span><h2>Every action, traceable</h2><p>ClaimLess records what each agent did and when.</p></div></div><div className="timeline">{[...events].reverse().map((event) => <div key={event.id}><span>✦</span><div><small>{event.actor.replaceAll("_", " ")} · {new Date(event.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small><p>{event.message}</p></div></div>)}</div></div>;
}
