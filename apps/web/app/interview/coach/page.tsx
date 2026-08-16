import { getPersona } from "@/lib/personas";
import { LiveRoom } from "@/components/interview/live-room";

export const dynamic = "force-dynamic";

/**
 * Socratic coach room. Static path so `/interview/coach` is not captured by
 * `/interview/[id]` (which 404s when LiveKit is on and `coach` is not a session).
 * Preview mode until a real session is created from setup.
 */
export default async function SocraticCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>;
}) {
  const { persona: personaId } = await searchParams;
  const persona = getPersona(personaId);
  return (
    <LiveRoom sessionId="coach" persona={persona} token={null} url={null} />
  );
}
