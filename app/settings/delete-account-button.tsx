"use client";

import { useTransition } from "react";
import { deleteAccount } from "@/app/actions/account";
import { Button } from "@/components/ui";

export function DeleteAccountButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="danger"
      className="mt-3"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete your account? This can't be undone.")) startTransition(() => deleteAccount());
      }}
    >
      {pending ? "Deleting…" : "Delete my account"}
    </Button>
  );
}
