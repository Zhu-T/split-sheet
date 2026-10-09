import type { Metadata } from "next";
import { Suspense } from "react";
import { signInWithGoogle } from "@/app/actions/account";
import { buttonStyles } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 pb-16">
      <div className="mb-10">
        <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-ink">
          <svg viewBox="0 0 64 64" className="size-9" aria-hidden>
            <path d="M20 44 44 20" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
            <circle cx="22" cy="22" r="6" fill="currentColor" />
            <circle cx="42" cy="42" r="6" fill="currentColor" />
          </svg>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Split expenses, not friendships.</h1>
        <p className="mt-3 text-muted">Track who paid what in your groups and settle up in a few taps.</p>
      </div>
      <Suspense fallback={<SignInButton next="/" />}>
        <SignInForm searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-sm text-muted">
        We only see your name and email address, nothing else in your Google account.
      </p>
    </main>
  );
}

async function SignInForm({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  return (
    <>
      {params.deleted && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">Your account was deleted.</p>}
      <SignInButton next={next} />
    </>
  );
}

function SignInButton({ next }: { next: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <button className={`${buttonStyles.primary} w-full`}>
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
          <path fill="currentColor" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" opacity=".8" />
          <path fill="currentColor" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14Z" opacity=".6" />
          <path fill="currentColor" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.7 9.4 6 12 6Z" opacity=".9" />
        </svg>
        Continue with Google
      </button>
    </form>
  );
}
