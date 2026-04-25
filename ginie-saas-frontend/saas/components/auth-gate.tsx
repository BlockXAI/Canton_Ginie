"use client";

import { useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

// Routes that anonymous (not signed-in) users may visit.
const PUBLIC_ROUTES = ["/login"];
// Routes reserved for users who have signed in but not yet linked a party.
const NEEDS_PARTY_ROUTES = ["/setup"];

function isPublic(path: string): boolean {
  return PUBLIC_ROUTES.some((p) => path === p || path.startsWith(`${p}/`));
}

function isSetup(path: string): boolean {
  return NEEDS_PARTY_ROUTES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function AuthGate({ children }: { children: ReactNode }): ReactNode {
  const { hydrated, isAuthenticated, needsParty, partyId } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";

  useEffect(() => {
    // Wait until sessionStorage has been read; otherwise we would race against
    // hydration and bounce a freshly-authenticated user to /login on every full
    // page load (e.g. window.location.href navigation to /sandbox/<jobId>).
    if (!hydrated) return;

    // Anonymous users → /login (except already on a public route).
    if (!isAuthenticated && !isPublic(pathname)) {
      router.replace("/login");
      return;
    }
    // Authenticated but no party yet → /setup wizard.
    if (isAuthenticated && (needsParty || !partyId) && !isSetup(pathname) && !isPublic(pathname)) {
      router.replace("/setup");
      return;
    }
    // Already authenticated and visiting /login → bounce home.
    if (isAuthenticated && partyId && !needsParty && isPublic(pathname)) {
      router.replace("/");
    }
  }, [hydrated, isAuthenticated, needsParty, partyId, pathname, router]);

  // Render nothing while hydrating or while a redirect is about to happen,
  // to avoid a flash of gated content.
  if (!hydrated) return null;
  if (!isAuthenticated && !isPublic(pathname)) return null;
  if (isAuthenticated && (needsParty || !partyId) && !isSetup(pathname) && !isPublic(pathname)) {
    return null;
  }

  return <>{children}</>;
}
