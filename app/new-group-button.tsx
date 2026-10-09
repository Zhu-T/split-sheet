"use client";

import { useActionState, useState } from "react";
import { createGroup } from "@/app/actions/groups";
import { CurrencySelect } from "@/components/currency-select";
import { Sheet } from "@/components/sheet";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";

export function NewGroupButton({ homeCurrency, variant = "primary" }: { homeCurrency: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createGroup, {});

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        New group
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New group"
        footer={
          <Button form="new-group" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create group"}
          </Button>
        }
      >
        <form id="new-group" action={action} className="space-y-4">
          <Field label="Name">
            <input name="name" required maxLength={60} autoComplete="off" placeholder="Roommates, Japan trip…" className={inputClass} />
          </Field>
          <Field label="Currency" hint="Balances are shown in this currency. It can't change once there are expenses.">
            <CurrencySelect name="baseCurrency" defaultValue={homeCurrency} />
          </Field>
          <ErrorText>{state.error}</ErrorText>
        </form>
      </Sheet>
    </>
  );
}
