import { useMutation } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";

export type OfficerToast = (msg: string, kind?: "success" | "error") => void;

type Link = { id: string; name: string; url: string; order: number };
type LinkPage = { data: Link[]; page: number; pageSize: number; total: number };

export function socialLinkPageOptions() {
  const queryKey = api.officer.listSocialMediaLinks.queryKey();
  return {
    queryKey,
    onMutate: async (
      patch: (page: LinkPage | undefined) => LinkPage | undefined,
    ) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<LinkPage>(queryKey);
      queryClient.setQueryData(queryKey, patch);
      return { previous };
    },
    onError: (_error: unknown, _input: unknown, context: unknown) => {
      queryClient.setQueryData(
        queryKey,
        (context as { previous?: LinkPage } | undefined)?.previous,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  };
}

/** React port of `createOfficerMutations` — same four mutations and handlers. */
export function useOfficerMutations(toast: OfficerToast) {
  const saveFormMutation = useMutation(
    api.officer.createProfilingForm.mutationOptions(),
  );
  const removeFormMutation = useMutation(
    api.officer.deleteProfilingForm.mutationOptions(),
  );
  const links = socialLinkPageOptions();
  const saveLinkMutation = useMutation(
    api.officer.upsertSocialMediaLink.mutationOptions({
      ...links,
      onMutate: ({
        id,
        name,
        url,
      }: {
        id?: string;
        name: string;
        url: string;
      }) =>
        links.onMutate((page) => {
          if (!page) return page;
          const previous = page.data.find((link) => link.id === id);
          if (id && !previous) return page;
          const data = id
            ? page.data.map((link) =>
                link.id === id ? { ...link, name, url } : link,
              )
            : [
                ...page.data,
                {
                  id: "optimistic-new",
                  name,
                  url,
                  order: page.data.length + 1,
                },
              ];
          return { ...page, data, total: page.total + (id ? 0 : 1) };
        }),
      onSuccess: (saved: Link, input: { id?: string }) => {
        queryClient.setQueryData<LinkPage>(
          links.queryKey,
          (page) =>
            page && {
              ...page,
              data: page.data.map((link) =>
                link.id === (input.id ?? "optimistic-new") ? saved : link,
              ),
            },
        );
      },
    }),
  );
  const deleteLinkMutation = useMutation(
    api.officer.deleteSocialMediaLink.mutationOptions({
      ...links,
      onMutate: ({ id }: { id: string }) =>
        links.onMutate(
          (page) =>
            page && {
              ...page,
              data: page.data.filter((link) => link.id !== id),
              total: Math.max(0, page.total - 1),
            },
        ),
    }),
  );
  const reorderLinksMutation = useMutation(
    api.officer.reorderSocialMediaLinks.mutationOptions({
      ...links,
      onMutate: ({ orderedIds }: { orderedIds: string[] }) =>
        links.onMutate((page) => {
          if (!page) return page;
          const byId = new Map(page.data.map((link) => [link.id, link]));
          if (
            orderedIds.length !== page.data.length ||
            orderedIds.some((id) => !byId.has(id))
          )
            return page;
          return {
            ...page,
            data: orderedIds.map((id, index) => ({
              ...byId.get(id)!,
              order: index + 1,
            })),
          };
        }),
    }),
  );

  async function handleSaveForm(title: string) {
    try {
      await saveFormMutation.mutateAsync({ title });
      queryClient.invalidateQueries({
        queryKey: ["officer", "getProfilingForm"],
      });
      toast("Google Form created");
    } catch (e) {
      toast(
        (e as Error).message || "Could not create the Google Form",
        "error",
      );
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

  async function handleSaveLink(
    name: string,
    url: string,
    id?: string,
    ts?: number,
  ) {
    try {
      await saveLinkMutation.mutateAsync({ id, name, url, ts });
      toast(id ? "Page updated" : "Page added");
      return true;
    } catch {
      toast("Could not save the page. Your draft is unchanged.", "error");
      return false;
    }
  }

  async function handleRemoveLink(id: string) {
    try {
      await deleteLinkMutation.mutateAsync({ id });
      toast("Page removed");
    } catch {
      toast("Could not remove the page", "error");
    }
  }

  async function handleReorderLinks(orderedIds: string[]) {
    try {
      await reorderLinksMutation.mutateAsync({ orderedIds });
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
