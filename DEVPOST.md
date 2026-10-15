# ClaimLess

> An AI medical-bill advocate that finds questionable charges and calls hospitals or insurers through Twilio to pursue corrections, discounts, and clear next steps.

## Inspiration

Medical bills are confusing, stressful, and difficult to challenge. Patients often notice a suspicious charge but do not know what to ask, who to call, or how to navigate a hospital billing department. ClaimLess was inspired by the idea that AI could do more than explain a bill—it could help patients take action.

## What it does

ClaimLess is an AI medical-bill advocate. A patient uploads an itemized bill, and the system identifies charges worth investigating, including possible duplicates, unusual quantities, unclear descriptions, insurance mismatches, and negotiable balances.

The patient answers a few questions, selects the desired outcome, and approves a call plan. ClaimLess then uses Twilio to call the hospital or insurance company.

During the call, Avery, the voice advocate:

- Explains every detected issue in plain language.
- Works through unresolved issues individually.
- Requests corrections, rebilling, reviews, or financial assistance.
- Privately asks the patient for guidance on the website when necessary.
- Respects boundaries and never authorizes payments or binding agreements.
- Saves the live transcript, confirmed facts, outcomes, and next steps.

## How we built it

We built ClaimLess as a Next.js and TypeScript application powered by OpenAI and Twilio ConversationRelay.

OpenAI extracts structured information from uploaded PDFs and images, analyzes individual line items, and builds a grounded advocacy plan. The voice agent receives only the approved bill facts, detected issues, patient goals, and safety boundaries.

Twilio provides the live telephone connection, speech recognition, and ElevenLabs voice synthesis. A WebSocket server connects the phone conversation to the AI agent in real time.

The application also includes:

- Itemized-bill extraction and analysis.
- A patient interview and approval checkpoint.
- A live call room with a real-time transcript.
- Private patient-to-agent guidance during calls.
- Structured fact and outcome capture.
- A complete post-call review.
- Local JSON persistence and an auditable activity history.

## Challenges we ran into

The hardest challenge was making the voice agent behave like a real, competent advocate instead of a chatbot reading a checklist.

Early versions spoke for too long, repeated billing codes, asked questions whose answers were already on the bill, and sometimes ended after resolving only one issue. We added conversation-state tracking, unresolved objectives, grounded issue categories, strict completion rules, and natural-response constraints.

We also handled several telephony challenges, including Twilio trial-account behavior, WebSocket routing, temporary ngrok URLs, call timing, interruptions, speech-recognition mistakes, and maintaining a live connection while waiting for private patient guidance.

## Accomplishments that we're proud of

We are proud that ClaimLess completes the full workflow rather than stopping at bill analysis.

A patient can upload a bill, understand the potential problems, define a desired outcome, approve the strategy, launch a real Twilio call, follow the conversation live, privately guide the agent, and review everything that happened afterward.

We are especially proud of the human-control system. ClaimLess can operate independently, but it pauses when information, consent, or a meaningful patient decision is required.

## What we learned

We learned that successful healthcare voice agents require more than a good model. They need grounded data, explicit objectives, conversational memory, human approval, safety boundaries, and reliable recovery when speech is unclear.

We also learned that natural conversations depend on restraint. Short responses, focused questions, uncertainty-aware language, and knowing when to ask the patient are more valuable than long, impressive-sounding answers.

## What's next for ClaimLess

Next, we want to add secure cloud storage, authentication, multilingual calls, provider-directory integrations, encrypted document processing, and HIPAA-ready infrastructure.

We also want to support explanation-of-benefits documents, insurance denials, prior-authorization disputes, and automated follow-up calls. Longer term, ClaimLess could integrate with FHIR-compatible health systems and track a billing dispute from the original statement through final resolution.
