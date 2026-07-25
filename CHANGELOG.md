# Changelog

All notable changes, newest first. The README's [News](README.md#news) section
carries the latest handful of entries; everything lands here permanently.
Tagged releases: [GitHub Releases](https://github.com/ngoanpv/DeepInterview/releases).

## v0.2.0 — 2026-07-25

- **Gemini 3.6 Flash + LiveKit Agents 1.6.** Prep and scoring run on Gemini 3.6
  Flash; the live voice stack moved to livekit-agents 1.6 (Gemini 3-ready
  function calling on the turn path), and live captions read as one paragraph
  per speaker instead of per-fragment lines.
- **The community playbook library is live.** Question-bank packs in `skills/`
  are retrieved by role/level and injected into the question planner — packs
  the community writes get asked in real interviews. Ships with generic
  backend/frontend/SWE packs, `deepinterview skills lint`, a pack PR template,
  a content policy, and a browsable pack index.
- **The open-source build is fully uncapped — billing removed.** Self-host with
  your own keys: no plan gates, no interview caps, no billing tables. Payments
  live only in the hosted edition.
- **Hardening release.** Opt-in shared-secret auth for the agent API and
  knowledge sidecar, locked-down Supabase row policies, and periodic transcript
  checkpointing so a killed process loses seconds of an interview, not all of it.
- **The study coach grounds answers in *your* session.** Prep ingests the CV,
  JD, and company research into the knowledge sidecar keyed by session — coach
  answers cite your own materials.
- New logo family (outlined geometry — renders identically everywhere), README
  restructure (quickstart first), and first-contributor infrastructure
  (protected `main`, Discussions, issue templates for packs and code execution).

## v0.1.0 — 2026-06-24

- **Live voice interviews run on real providers.** The full loop — personalized
  prep (real Gemini CV/JD analysis + company research) → real-time voice
  interview on LiveKit (Deepgram STT · Gemini · Cartesia/ElevenLabs TTS) →
  scored report — runs end to end, with semantic end-of-turn detection and
  noise-robust, word-gated barge-in.
- **`docker compose up` verified.** All images build; the base stack (web +
  agent API + knowledge sidecar) comes up healthy with zero keys on mock
  adapters; `--profile live` adds the voice worker.
- **Relicensed to Apache 2.0** — permissive core, bring-your-own keys, no sign-in.
- Early build: cross-language `InterviewContext` contract (TS ↔ Pydantic)
  round-trips; prep/live/post pipelines and all web screens run offline with
  mock adapters.
