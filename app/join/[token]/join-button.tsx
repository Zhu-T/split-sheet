"use client";

import { useActionState } from "react";
import { joinGroup } from "@/app/actions/groups";
import { Button, ErrorText } from "@/components/ui";

export function JoinButton({ token }: { token: string }) {
  const [state, action, pending] = useActionState(() => joinGroup(token), {});
  return (
    <form action={action} className="mt-6 space-y-3">
      <Button className="w-full" disabled={pending}>
        {pending ? "Joining…" : "Join group"}
      </Button>
      <ErrorText>{state.error}</ErrorText>
    </form>
  );
}
