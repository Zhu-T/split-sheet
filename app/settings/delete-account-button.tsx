"use client";

import { useTransition } from "react";
import { deleteAccount } from "@/app/actions/account";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui";

export function DeleteAccountButton() {
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  return (
    <>
      <Button
        variant="destructive"
        className="mt-3"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: "Delete your account?",
            message: "Your name, email and Discord ID are removed. Your past expenses stay in your groups so balances remain correct. This can't be undone.",
            confirmLabel: "Delete my account",
            destructive: true,
          });
          if (ok) startTransition(() => deleteAccount());
        }}
      >
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
      {confirmDialog}
    </>
  );
}
