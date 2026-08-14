import "./lib/orpc.server";
import { building } from "$app/environment";
import { auth } from "@steps/auth";
import type { Handle } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";

export const handle: Handle = async ({ event, resolve }) => {
  const authInstance = auth;

  return svelteKitHandler({
    event,
    resolve,
    auth: authInstance,
    building,
  });
};
