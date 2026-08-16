"use client";

import { useEffect, useState } from "react";
import { getMessages, LOCALE_CHANGE_EVENT, type Locale, type Messages } from "@/lib/i18n";
import { vi } from "@/lib/i18n/messages/vi";

/**
 * Client-side message resolution. `getMessages` keeps EN as the default pack;
 * here we layer the `vi` pack on top when the user has chosen Vietnamese via
 * the locale cookie — without modifying the server-side dictionary registry.
 *
 * `vi` is structurally `Messages` with widened string values (it can't match
 * `en`'s `as const` literals), so we assert it back to `Messages` for the `t()`
 * reader, which only ever reads string leaves by key path. Safe by construction:
 * `vi.ts` is type-checked for exact key parity with `en`.
 */
function resolve(locale: Locale): Messages {
  return locale === "vi" ? (vi as unknown as Messages) : getMessages(locale);
}

function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith("locale="));
  return match?.split("=")[1] === "vi" ? "vi" : "en";
}

/**
 * Resolve messages on the client from the `locale` cookie. Starts at EN for a
 * stable first paint, then re-resolves after mount (avoids hydration drift).
 */
export function useMessages(): Messages {
  const [messages, setMessages] = useState<Messages>(() => resolve("en"));
  useEffect(() => {
    const sync = () => setMessages(resolve(readLocaleCookie()));
    sync();
    window.addEventListener(LOCALE_CHANGE_EVENT, sync);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, sync);
  }, []);
  return messages;
}

/**
 * The active locale from the `locale` cookie. Starts at EN for a stable first
 * paint, then re-resolves after mount (same hydration-safe pattern as
 * `useMessages`). Use it to route locale-dependent behavior (e.g. the language
 * the study coach answers in) to the user's chosen language.
 */
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    const sync = () => setLocale(readLocaleCookie());
    sync();
    window.addEventListener(LOCALE_CHANGE_EVENT, sync);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, sync);
  }, []);
  return locale;
}
