import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import Turnstile, { type TurnstileHandle } from "./Turnstile";

type RenderCall = {
  id: string;
  opts: {
    execution: string;
    callback: (token: string) => void;
    "error-callback": () => void;
  };
};

function stubTurnstile() {
  const calls: RenderCall[] = [];
  const api = {
    render: vi.fn((_el: HTMLElement, opts: RenderCall["opts"]) => {
      const id = `w${calls.length}`;
      calls.push({ id, opts });
      return id;
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  vi.stubGlobal("turnstile", api);
  return { api, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Turnstile", () => {
  it("runs the challenge on render and consumes a ready token only once", async () => {
    const { api, calls } = stubTurnstile();
    const ref = createRef<TurnstileHandle>();
    const onToken = vi.fn();
    render(
      <Turnstile ref={ref} sitekey="key" action="login" onToken={onToken} />,
    );

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(calls[0].opts.execution).toBe("render");
    act(() => calls[0].opts.callback("token-123"));
    expect(onToken).toHaveBeenLastCalledWith("token-123");

    await act(async () => {
      await expect(ref.current!.execute()).resolves.toBe("token-123");
    });
    expect(onToken).toHaveBeenLastCalledWith("");
    await expect(ref.current!.execute()).rejects.toThrow("already used");
  });

  it("waits for the provider callback when submitted before the token is ready", async () => {
    const { calls } = stubTurnstile();
    const ref = createRef<TurnstileHandle>();
    render(<Turnstile ref={ref} sitekey="key" action="login" />);
    await waitFor(() => expect(calls).toHaveLength(1));

    await act(async () => {
      const pending = ref.current!.execute();
      expect(ref.current!.execute()).toBe(pending);
      calls[0].opts.callback("token-123");
      await expect(pending).resolves.toBe("token-123");
    });
  });

  it("rejects a pending submission when the provider reports failure", async () => {
    const { calls } = stubTurnstile();
    const ref = createRef<TurnstileHandle>();
    render(<Turnstile ref={ref} sitekey="key" action="login" />);
    await waitFor(() => expect(calls).toHaveLength(1));

    await act(async () => {
      const failed = expect(ref.current!.execute()).rejects.toThrow("failed");
      calls[0].opts["error-callback"]();
      await failed;
    });
    await expect(ref.current!.execute()).rejects.toThrow("failed");
  });
});
