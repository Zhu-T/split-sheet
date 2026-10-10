"use client";

import { useActionState } from "react";
import { updateMyName, type NameFormState } from "@/app/actions/account";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";

export function NameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(updateMyName, {} as NameFormState);
  return (
    <form action={action} className="space-y-3">
      <Field label="Your name" hint="Shown to everyone in your groups. Changing it updates every group you're in.">
        <input name="name" defaultValue={current} required maxLength={60} autoComplete="name" className={inputClass} />
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
