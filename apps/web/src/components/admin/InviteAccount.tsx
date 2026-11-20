import { useState } from "react";
import ActiveEditors, { useEditingLock } from "../ActiveEditors";
import { useMutation } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";

export default function InviteAccount({
  ontoast,
}: {
  ontoast: (message: string, kind?: "success" | "error") => void;
}) {
  const [open, setOpen] = useState(false);
  const lock = useEditingLock(open);
  const invite = useMutation(api.admin.inviteAccount.mutationOptions({
    onSuccess: () => {
      setOpen(false);
      ontoast("Account invitation sent.", "success");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  }));

  if (!open) return (
    <button type="button" onClick={() => { invite.reset(); setOpen(true); }} className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
      Add account
    </button>
  );

  return (
    <form
      aria-label="Invite an account"
      className="space-y-3 rounded-xl border border-border bg-surface-raised p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (lock.blocked || invite.isPending) return;
        const fields = new FormData(event.currentTarget);
        invite.mutate({ name: String(fields.get("name")).trim(), email: String(fields.get("email")).trim() });
      }}
    >
      <ActiveEditors resource="user" onBlockedChange={lock.onBlockedChange}>
      <p className="text-sm text-muted">Send a one-time link to choose a password. The link expires in one hour.</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Full name
          <input name="name" autoComplete="name" required maxLength={100} className="rounded-lg border border-border bg-surface px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email address
          <input name="email" type="email" autoComplete="email" required maxLength={254} className="rounded-lg border border-border bg-surface px-3 py-2" />
        </label>
      </div>
      {invite.isError && <p role="alert" className="text-sm text-error">{invite.error instanceof Error ? invite.error.message : "Could not send the invitation."}</p>}
      </ActiveEditors>
      <div className="flex gap-2">
        <button type="submit" disabled={lock.blocked || invite.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {invite.isPending ? "Sending…" : "Send invitation"}
        </button>
        <button type="button" disabled={invite.isPending} onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-muted disabled:opacity-50">Cancel</button>
      </div>
    </form>
  );
}
