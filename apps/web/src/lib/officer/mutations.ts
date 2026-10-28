import { useMutation } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";

export type OfficerToast = (msg: string, kind?: "success" | "error") => void;

/** React port of `createOfficerMutations` — same four mutations and handlers. */
export function useOfficerMutations(toast: OfficerToast) {
  const saveFormMutation = useMutation(
    api.officer.createProfilingForm.mutationOptions(),
  );
  const removeFormMutation = useMutation(
    api.officer.deleteProfilingForm.mutationOptions(),
  );
  const saveLinkMutation = useMutation(
    api.officer.upsertSocialMediaLink.mutationOptions(),
  );
  const deleteLinkMutation = useMutation(
    api.officer.deleteSocialMediaLink.mutationOptions(),
  );
  const reorderLinksMutation = useMutation(
    api.officer.reorderSocialMediaLinks.mutationOptions(),
  );

  async function handleSaveForm(title: string) {
    try {
      await saveFormMutation.mutateAsync({ title });
      queryClient.invalidateQueries({
        queryKey: ["officer", "getProfilingForm"],
      });
      toast("Google Form created");
    } catch (e) {
      toast((e as Error).message || "Could not create the Google Form", "error");
    }
  }

  async function handleRemoveForm() {
    try {
      await removeFormMutation.mutateAsync(undefined);
      queryClient.invalidateQueries({
        queryKey: ["officer", "getProfilingForm"],
      });
      toast("Profiling form unlinked");
    } catch {
      toast("Could not unlink the profiling form", "error");
    }
  }

  async function handleSaveLink(name: string, url: string, id?: string) {
    try {
      await saveLinkMutation.mutateAsync({ id, name, url });
      queryClient.invalidateQueries({ queryKey: ["officer"] });
      toast(id ? "Page updated" : "Page added");
    } catch {
      toast("Could not save the page", "error");
    }
  }

  async function handleRemoveLink(id: string) {
    try {
      await deleteLinkMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["officer"] });
      toast("Page removed");
    } catch {
      toast("Could not remove the page", "error");
    }
  }

  async function handleReorderLinks(orderedIds: string[]) {
    try {
      await reorderLinksMutation.mutateAsync({ orderedIds });
      queryClient.invalidateQueries({ queryKey: ["officer"] });
      toast("Order updated");
    } catch {
      toast("Could not reorder the pages", "error");
    }
  }

  return {
    saveFormMutation,
    removeFormMutation,
    saveLinkMutation,
    deleteLinkMutation,
    reorderLinksMutation,
    handleSaveForm,
    handleRemoveForm,
    handleSaveLink,
    handleRemoveLink,
    handleReorderLinks,
  };
}
