import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ThemeToggleButton } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { safeRedirectPath } from "@/lib/rules";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome" };

/** After every sign-in. New users pick their name (pre-filled from Discord); others pass straight through. */
export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 pb-16">
      <div className="pt-safe fixed top-0 right-0 z-10 p-2">
        <ThemeToggleButton />
      </div>
      <Suspense fallback={<Skeleton rows={1} />}>
        <Welcome searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Welcome({ searchParams }: Pick<PageProps<"/welcome">, "searchParams">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : "/");
  const user = await requireUser();
  if (user.onboardedAt) redirect(next);

  return (
    <div className="rise">
      <h1 className="text-3xl font-semibold tracking-tight">What should we call you?</h1>
      <p className="mt-3 text-muted">
        This is the name your groups will see. We&apos;ve started with your Discord name; you can change it any time in
        Settings.
      </p>
      <WelcomeForm next={next} defaultName={user.name} />
    </div>
  );
}
