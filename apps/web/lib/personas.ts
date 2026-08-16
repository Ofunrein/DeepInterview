/**
 * Avatar persona catalog.
 *
 * WP-1 created the stub (`id`/`name`/`style`/`poster_url`). WP-9 extends each
 * entry with the pre-rendered Veo 3.1 loop URLs (`idle_url` + `speaking_url`)
 * consumed by `<AvatarStage>`.
 *
 * Leave media URLs empty until real assets exist. `<AvatarStage>` and the
 * setup picker skip `<video>`/`<img>` requests when these are blank (so the
 * live site does not 404 `/avatars/*.jpg`). Paste R2 URLs here after
 * `scripts/veo/render.mjs` (see `scripts/veo/README.md`).
 *
 * Pure data — no `server-only`, no env reads — safe to import from any server
 * or client component.
 */

/** Stable persona ids used across the pipeline and the Veo render scripts. */
export type PersonaId = "anime" | "superhero" | "recruiter" | "professor";

export interface Persona {
  /** Stable id sent through the interview pipeline. */
  id: PersonaId;
  /** Display name shown on the picker card. */
  name: string;
  /** One-line interviewer style/tone, surfaced under the name. */
  style: string;
  /** Poster image path — first frame of the idle loop (placeholder). */
  poster_url: string;
  /** Idle / listening / thinking loop (subtle breathing, blink). Placeholder. */
  idle_url: string;
  /** Speaking loop (talking mouth, nods, gestures). Placeholder. */
  speaking_url: string;
  /** Optional contribution credit, e.g. "rendered by @user with Sora 2".
   * Shown in the avatar gallery / release notes (see docs/AVATARS.md). */
  credit?: string;
}

export const PERSONAS: Persona[] = [
  {
    id: "anime",
    name: "Mika",
    style: "Bright, encouraging anime mentor who keeps the energy up.",
    poster_url: "",
    idle_url: "",
    speaking_url: "",
  },
  {
    id: "superhero",
    name: "Vanguard",
    style: "Bold superhero coach who pushes you to your best answer.",
    poster_url: "",
    idle_url: "",
    speaking_url: "",
  },
  {
    id: "recruiter",
    name: "Dana",
    style: "Calm, professional recruiter — true-to-life screening tone.",
    poster_url: "",
    idle_url: "",
    speaking_url: "",
  },
  {
    id: "professor",
    name: "Dr. Chen",
    style: "Calm, thoughtful academic who probes deeply and values precision.",
    poster_url: "",
    idle_url: "",
    speaking_url: "",
  },
];

/** Default persona when the user hasn't picked one yet. */
export const DEFAULT_PERSONA_ID = "recruiter";

/** Look up a persona by id, falling back to the default. */
export function getPersona(id: string | undefined): Persona {
  const fallback =
    PERSONAS.find((p) => p.id === DEFAULT_PERSONA_ID) ?? PERSONAS[0];
  // The catalog is always non-empty, so a fallback exists.
  return PERSONAS.find((p) => p.id === id) ?? (fallback as Persona);
}
