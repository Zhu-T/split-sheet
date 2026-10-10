"use client";

import { useActionState } from "react";
import { completeWelcome, type NameFormState } from "@/app/actions/account";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";

export function WelcomeForm({ next, defaultName }: { next: string; defaultName: string }) {
  const [state, action, pending] = useActionState(completeWelcome.bind(null, next), {} as NameFormState);
  return (
    <form action={action} className="mt-8 space-y-4">
      <Field label="Your name">
        <input
          name="name"
          defaultValue={defaultName}
          required
          maxLength={60}
          autoFocus
          autoComplete="name"
          enterKeyHint="go"
          className={inputClass}
        />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <Button className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
