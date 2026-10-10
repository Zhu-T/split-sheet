import type { Metadata } from "next";
import { Suspense } from "react";
import { signInWithDiscord } from "@/app/actions/account";
import { cx } from "@/components/ui";

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
        We only see your Discord display name, user ID and email address. We can&apos;t read your messages or servers.
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
      {params.error && (
        <p role="alert" className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm text-danger">
          {params.error === "AccessDenied"
            ? "Sign-in needs a Discord account with a verified email address. Verify your email in Discord (User Settings → My Account), then try again."
            : `Sign-in didn't work. Please try again. (Error: ${String(params.error).slice(0, 40)})`}
        </p>
      )}
      <SignInButton next={next} />
    </>
  );
}

function SignInButton({ next }: { next: string }) {
  return (
    <form action={signInWithDiscord}>
      <input type="hidden" name="next" value={next} />
      {/* Discord's darker blurple keeps white text above WCAG AA contrast. */}
      <button
        className={cx(
          "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold",
          "bg-[#4752c4] text-white transition duration-150 ease-out hover:bg-[#3c45a5] active:scale-[0.97]",
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
          <path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.84a.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.25a18.3 18.3 0 0 0-5.43 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.1c.36.7.78 1.37 1.23 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .04-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.98 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z" />
        </svg>
        Continue with Discord
      </button>
    </form>
  );
}
