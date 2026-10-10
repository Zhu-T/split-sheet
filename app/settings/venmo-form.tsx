"use client";

import { useActionState } from "react";
import { setVenmoUsername, type VenmoFormState } from "@/app/actions/account";
import { Button, ErrorText, Field } from "@/components/ui";

export function VenmoForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(setVenmoUsername, {} as VenmoFormState);
  return (
    <form action={action} className="space-y-3">
      <Field label="Venmo username" hint="Optional. People in your groups see it so they can pay you from the settle-up screen.">
        <div className="flex items-center rounded-xl border border-line bg-surface transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20">
          <span className="pl-3 text-base text-muted">@</span>
          <input
            name="venmoUsername"
            defaultValue={current ?? ""}
            placeholder="your-username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={100}
            className="min-h-11 w-full rounded-xl bg-transparent px-1 text-base outline-none"
          />
        </div>
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <div className="flex items-center gap-3">
        <Button variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.saved && !pending && <span className="toast text-sm text-owed">Saved</span>}
      </div>
    </form>
  );
}
