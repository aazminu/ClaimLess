# ClaimLess

ClaimLess is an AI medical-bill advocate built for the Arya Health × Twilio AI Healthcare Hack NYC.

Patients upload an itemized hospital bill. ClaimLess audits every line, asks a guided set of questions about the patient's experience and desired outcome, prepares a bounded negotiation plan, requests explicit approval, and makes a real Twilio call to the hospital or insurer. The live agent records confirmed facts, offers, reference numbers, outcomes, and next steps.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). One command starts Next.js, the ConversationRelay WebSocket server, and the ngrok tunnel used by Twilio.

## Demo

1. Choose **Launch the live demo**.
2. Review the three flagged issues on Jordan Lee's $4,400 bill.
3. Complete the five-question advocate interview.
4. Enter the phone number of the person playing the billing representative.
5. Approve the plan, then choose **Call now**.
6. Answer the real Twilio call and play the representative.
7. Watch the transcript, offer, outcome, reference number, and next steps appear live.

The agent treats detected issues as investigation leads, not proven errors. It cannot authorize payment, accept a binding agreement, or call before the user approves the target and boundaries.

## Environment

The existing `.env.local` is intentionally preserved. It should contain OpenAI, Twilio, phone-number, and ngrok credentials.
