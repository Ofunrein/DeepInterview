# Run DeepInterview on local models

Every AI stage — the LLM, speech-to-text and text-to-speech — can run on your own
machine. No OpenAI key, no Gemini key, no Deepgram key, no Cartesia key, and
nothing about your CV leaves your box.

```bash
LLM_PROVIDER=ollama   STT_PROVIDER=whisper   TTS_PROVIDER=kokoro
```

All three are reached over the **OpenAI HTTP shape**, so they take a base URL
instead of an API key, and any compatible server works — Ollama, vLLM, LM Studio,
llama.cpp, Speaches, kokoro-fastapi. DeepInterview added no new dependency for
this: it reuses `livekit-plugins-openai` with a `base_url` override.

> ### One honest caveat, up front
> **LiveKit is still the real-time transport.** Local models replace the *AI*
> vendors, not the WebRTC layer. You have two options:
> - point `LIVEKIT_URL` at LiveKit Cloud (free tier is enough for self-hosting), or
> - run `livekit-server --dev` locally for a genuinely offline stack.
>
> So the accurate claim is **"no cloud model keys / no per-minute AI vendor
> costs"** — not "no cloud at all". Everything else on this page is local.

---

## 1. Start the model servers

### LLM — Ollama

Run Ollama **natively**, not in Docker, on macOS and Windows: Docker Desktop has
no GPU passthrough, so a containerised Ollama is CPU-only and far too slow for a
live conversation. Native Ollama uses Metal on Apple Silicon.

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh   # or: brew install ollama

# The context length is NOT optional — see "Why 16k" below.
OLLAMA_CONTEXT_LENGTH=16384 ollama serve

ollama pull qwen3:8b        # ~5 GB on disk
```

**Why 16k.** The question planner's prompt is your CV + the job description +
company research + the JSON schema it must fill. Ollama's default context window
is smaller than that, and it truncates **silently** — you get a well-formed
interview plan about a candidate the model never actually read. This is the
single most likely way to get a disappointing local run.

**Model choice.** `qwen3:8b` is the smallest model verified to produce a real,
grounded question plan (see "What we verified" below). Smaller models tend to
fail the JSON contract, which lands you on the generic fallback plan. If you have
the memory, `qwen3:14b` has more headroom.

### STT — a local Whisper server

Any server exposing `POST /v1/audio/transcriptions`:

```bash
docker run -d -p 8001:8000 ghcr.io/speaches-ai/speaches:latest-cpu

# Speaches ships no weights — download the model once, or every transcription
# 404s with "Model ... is not installed locally".
curl -X POST http://localhost:8001/v1/models/Systran/faster-whisper-small
```

### TTS — Kokoro

```bash
docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

Kokoro-82M is small enough to run comfortably on CPU.

### Or bring them all up with the `local` profile

```bash
docker compose --profile local --profile live up
```

This starts Ollama (+ a one-shot model pull), the Whisper server and Kokoro
alongside the app. On a Mac, prefer the native Ollama above and point the
containers at it with `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`.

---

## 2. Configure

`pnpm deepinterview init` → **"100% local models"** sets all of this for you.
Or write it yourself:

```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:8b

STT_PROVIDER=whisper
WHISPER_BASE_URL=http://localhost:8001/v1

TTS_PROVIDER=kokoro
KOKORO_BASE_URL=http://localhost:8880/v1
KOKORO_MODEL=tts-1        # do not change — see below
KOKORO_VOICE=             # blank = pick the voice from the session language

# Company research is the one remaining outbound call. Mock it for a fully
# offline run; leave it on Tavily/Exa if you want real company intel.
SEARCH_PROVIDER=mock

# Local models are slower than cloud ones. Without these, prep and scoring hit
# their ceilings and silently degrade to generic results.
LLM_CALL_TIMEOUT_SEC=300
SCORE_STAGE_TIMEOUT_SEC=300
```

**`KOKORO_MODEL=tts-1` is load-bearing.** That id is what selects the raw-audio
transport in the OpenAI plugin; any other value routes synthesis down a
server-sent-events branch that yields **no audio and no error** — the agent
simply never speaks. `kokoro-fastapi` ignores the model name itself, so pinning
it costs nothing. The worker coerces a wrong value back to `tts-1` and logs a
warning rather than going silent.

---

## 3. Known differences from the cloud path

These are consequences of the design, not bugs. They are listed here so the
local path isn't oversold.

| | Cloud path | Local path |
|---|---|---|
| **Live captions** | word-by-word | **per utterance** — the OpenAI-compatible STT is a batch endpoint, so the worker VAD-segments your speech and transcribes each chunk. There are no interim results. |
| **Barge-in** | word-gated on interim transcripts | fires later, since the gate can only run once a whole utterance is transcribed |
| **Voice languages** | 7+, incl. Vietnamese | **Kokoro has no Vietnamese voice.** A `vi` session with `TTS_PROVIDER=kokoro` honestly falls through to a cloud voice rather than reading Vietnamese with an American accent. Kokoro covers en, ja, zh, es, fr, hi, it, pt. |
| **Turn latency** | tuned and measured | **not benchmarked.** It depends heavily on your hardware and model size. |
| **CI coverage** | mock adapters, every PR | the local path is **maintainer-verified, not CI-tested** — CI has no models. |

Because Kokoro encodes the language in the voice-id prefix (`af_`/`am_` = American
English, `bf_` = British, `jf_` = Japanese, `zf_` = Chinese, `ef_` = Spanish,
`ff_` = French, `hf_` = Hindi, `if_` = Italian, `pf_` = Portuguese), picking a
voice *is* picking a language. Leave `KOKORO_VOICE` blank and the session
language chooses; set it to pin one.

---

## 4. What we verified

On an Apple M5 Pro (24 GB), Ollama 0.32.5 + `qwen3:8b`, Speaches
(`faster-whisper-small`) and kokoro-fastapi, all on CPU/Metal locally:

- **Prep → question plan on the local LLM: 121s.** Six questions, difficulty
  ramping 1→5, each grounded in the specific CV and job description — it asked
  about Postgres logical replication from the CV and Rust from the JD — with
  zero degraded stages and no fallback to the generic plan.
- **TTS → STT round trip through the real worker builders.** Kokoro synthesized
  *"Tell me about a hard bug you fixed in a payment system."* into 3.25s of PCM
  at 24 kHz, and the Whisper server transcribed that audio back **verbatim**.
  This exercises the exact code path the live worker uses, so it rules out both
  silent failure modes (the no-audio SSE branch and an empty transcript).
- Provider selection, fallback, and the language/voice routing are covered by
  unit tests that run with no models installed.

**Not verified, and therefore not claimed:** turn latency, barge-in feel, and a
full microphone-in-a-LiveKit-room session — that last one needs a human to speak,
so it is not something CI or a scripted check can stand in for. Non-English local
voice is untested, as is any hardware other than the above.

## 5. When it goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Interview asks one question titled **"mock"** | the model's JSON didn't parse, so the planner fell back | check the agent log for `question_planner failed, using minimal generic plan`; try a larger model |
| A plausible plan that mentions **nothing from your CV** | context window truncated the prompt | set `OLLAMA_CONTEXT_LENGTH=16384` |
| Agent **never speaks**, no error | `KOKORO_MODEL` isn't `tts-1` | set it back; check the worker log for the coercion warning |
| Speech is **chipmunk or slow-motion** | your TTS server isn't returning 24 kHz audio | the plugin decodes at a fixed 24 kHz; Kokoro's native rate already matches |
| Agent **never hears you** | Whisper server unreachable or rejecting requests | the worker refuses to start a session against an unreachable local server and names the URL + env var; check that error first |
| Turns die after ~10s | per-request ceiling | handled automatically — selecting any local provider widens it to 30s (`LOCAL_PROVIDER_TIMEOUT_SEC`) |

---

## Related work

If you want a **pure local voice pipeline** rather than a full interview
platform, look at [`huggingface/speech-to-speech`](https://github.com/huggingface/speech-to-speech)
(Apache-2.0) — Hugging Face's cascaded VAD → STT → LLM → TTS stack, with MLX
support on Apple Silicon and an OpenAI Realtime-compatible WebSocket API. It is
the closest sibling to this page's setup and a great starting point if you're
assembling your own local speech loop.

It is **not** wired in as a provider here, and the reason is worth stating: it
exposes only a complete speech-to-speech session (`/v1/realtime`) — no
`/v1/audio/transcriptions`, no `/v1/audio/speech`, and no way to disable its LLM
stage. DeepInterview needs to own the LLM turn itself (the interviewer calls
`save_answer` / `get_next_question`, and an adaptive Director sits behind it), so
a black-box pipeline that answers for us can't slot into the cascade. If it ever
grows a transcription-only session mode, it would drop straight into
`STT_PROVIDER`.
