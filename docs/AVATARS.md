# Avatar packs — bring your own generator

The interviewer avatars are **pre-rendered video loops** crossfaded by agent
state at runtime (`<AvatarStage>`), so runtime cost is ~$0/min — just CDN
bytes. The app never calls a video vendor: it plays whatever assets exist.
That means avatar packs can be produced with **any generator** — Veo, Sora,
Runway, Kling, a local ComfyUI/LTX rig, or hand animation. There is no
blessed vendor; there is a **contract**.

Avatar packs are **curated artifacts, not build outputs**: video generation is
non-deterministic, so the committed prompt is provenance, not a reproducible
build recipe. Packs go through human review like any contribution.

Assets are always optional: with no assets present the app renders its calm
gradient stage (the mock-first rule applies to pixels too). Nothing may break
when a pack is missing.

## What a pack contains

For one persona (see `apps/web/lib/personas.ts` for the ids):

| Deliverable | Contract |
|---|---|
| Reference still (poster) | JPG/PNG, ≥1024px wide — the character's canonical look; visually the first frame of the loops |
| Idle loop | MP4 (H.264), ~8s, **first frame = last frame** (seamless), subtle breathing/blinking, no audio track |
| Speaking loop | MP4 (H.264), ~8s, seamless, same character/framing/background as idle, natural mouth movement + small gestures, no audio track |

Shared requirements: medium close-up, calm uncluttered background, static
camera, the **same character** across all three files, ≤25 MB per file.

## The IP-safety checklist (load-bearing — every pack, no exceptions)

- [ ] Original fictional character — resembles **no real person** (including
      the contributor) and **no existing franchise/character**
- [ ] No brand logos, trademarks, or copyrighted set dressing
- [ ] **Generator + full prompt disclosed** in the PR (AI-generated content
      must be labeled as such; the prompt is the reviewable recipe)
- [ ] Contributor affirms they hold/grant rights to the output under the
      project license and that the generator's terms permit this use

Packs that can't credibly tick every box are declined — same bar as the
question-bank content policy in [CONTRIBUTING.md](../CONTRIBUTING.md).

## How to contribute a pack

1. **Open a PR** with the persona entry (or a new persona following the
   [#53](https://github.com/ngoanpv/DeepInterview/issues/53) pattern), the
   generation prompt(s), and the checklist above — plus the rendered files
   **attached to the PR or linked** (release, Drive, etc.).
2. **Binaries never enter git history.** Do not commit media; `apps/web/
   public/avatars/` is gitignored as a local-dev drop-in only.
3. On acceptance, a maintainer publishes the files as **GitHub Release
   artifacts** (fork-survivable, archived) and to the CDN, then updates the
   persona's `poster_url` / `idle_url` / `speaking_url` and your `credit`
   line ("rendered by @you with <generator>").

## Reference implementation

`scripts/veo/` renders packs with Google Veo 3.1 if you have a Gemini API
key — it is **one way** to satisfy this contract, not the way. Model ids in
that script chase a moving vendor; the contract above does not.
