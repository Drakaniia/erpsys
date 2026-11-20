import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

type Props = {
  sitekey: string;
  action: string;
  onToken?: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
};

export interface TurnstileHandle {
  reset: () => void;
  execute: () => Promise<string>;
}

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;
let scriptPromise: Promise<void> | undefined;

function loadScript(): Promise<void> {
  if (api()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    );
    const script = existing ?? document.createElement("script");
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const loaded = () =>
      finish(api() ? undefined : new Error("Verification unavailable"));
    const failed = () => finish(new Error("Verification could not load"));
    const timer = window.setTimeout(failed, 15_000);
    script.addEventListener("load", loaded);
    script.addEventListener("error", failed);
    if (!existing) {
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    scriptPromise = undefined;
    throw error;
  });
  return scriptPromise;
}

export default function Turnstile({
  sitekey,
  action,
  onToken,
  onExpire,
  onError,
  ref,
}: Props & { ref?: Ref<TurnstileHandle> }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const token = useRef<{ value: string; expires: number } | null>(null);
  const consumed = useRef(false);
  const generation = useRef(0);
  const failure = useRef<string | null>(null);
  const pending = useRef<{
    promise: Promise<string>;
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timer: number;
  } | null>(null);
  const callbacks = useRef({ onToken, onExpire, onError });
  callbacks.current = { onToken, onExpire, onError };
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  function settle(error?: Error, value = "") {
    const call = pending.current;
    pending.current = null;
    if (!call) return;
    window.clearTimeout(call.timer);
    if (error) call.reject(error);
    else call.resolve(value);
  }

  function fail(message: string) {
    token.current = null;
    failure.current = message;
    setStatus("error");
    callbacks.current.onToken?.("");
    callbacks.current.onError?.();
    settle(new Error(message));
  }

  function reset() {
    generation.current++;
    settle(new Error("Verification reset"));
    token.current = null;
    consumed.current = false;
    failure.current = null;
    callbacks.current.onToken?.("");
    setStatus("loading");
    setAttempt((value) => value + 1);
  }

  useImperativeHandle(ref, () => ({
    reset,
    execute() {
      if (!sitekey.trim())
        return Promise.reject(new Error("Verification unavailable"));
      if (failure.current) return Promise.reject(new Error(failure.current));
      if (pending.current) return pending.current.promise;
      if (consumed.current)
        return Promise.reject(new Error("Verification already used"));
      if (token.current && token.current.expires > Date.now()) {
        const value = token.current.value;
        token.current = null;
        consumed.current = true;
        callbacks.current.onToken?.("");
        return Promise.resolve(value);
      }
      const expired = token.current !== null;
      token.current = null;
      let resolve!: (value: string) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<string>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      pending.current = {
        promise,
        resolve,
        reject,
        timer: window.setTimeout(
          () => fail("Verification timed out. Please retry."),
          120_000,
        ),
      };
      if (expired && widget.current !== null) {
        callbacks.current.onToken?.("");
        setStatus("loading");
        try {
          api()?.reset(widget.current);
        } catch {
          fail("Verification failed. Please retry.");
        }
      }
      return promise;
    },
  }));

  useEffect(() => {
    const version = ++generation.current;
    let id: string | null = null;
    const active = () => generation.current === version;
    token.current = null;
    consumed.current = false;
    failure.current = null;
    setStatus("loading");
    callbacks.current.onToken?.("");

    if (!sitekey.trim()) fail("Verification is not configured.");
    else
      void loadScript()
        .then(() => {
          if (!active() || !container.current) return;
          const turnstile = api();
          if (!turnstile)
            return fail("Verification unavailable. Please retry.");
          try {
            id = turnstile.render(container.current, {
              sitekey,
              action,
              theme: "light",
              appearance: "always",
              execution: "render",
              "response-field": false,
              retry: "never",
              "refresh-expired": "manual",
              "refresh-timeout": "manual",
              callback: (value: string) => {
                if (!active() || consumed.current || failure.current) return;
                if (!value) return fail("Verification failed. Please retry.");
                failure.current = null;
                setStatus("ready");
                if (pending.current) {
                  consumed.current = true;
                  callbacks.current.onToken?.("");
                  settle(undefined, value);
                } else {
                  token.current = { value, expires: Date.now() + 290_000 };
                  callbacks.current.onToken?.(value);
                }
              },
              "expired-callback": () => {
                if (!active() || consumed.current || failure.current) return;
                token.current = null;
                callbacks.current.onToken?.("");
                callbacks.current.onExpire?.();
                setStatus("loading");
                try {
                  if (id !== null) turnstile.reset(id);
                } catch {
                  fail("Verification expired. Please retry.");
                }
              },
              "error-callback": () => {
                if (active()) fail("Verification failed. Please retry.");
              },
              "timeout-callback": () => {
                if (active()) fail("Verification timed out. Please retry.");
              },
              "unsupported-callback": () => {
                if (active())
                  fail(
                    "Your browser cannot run verification. Try another browser.",
                  );
              },
            });
            widget.current = id;
          } catch {
            fail("Verification failed. Please retry.");
          }
        })
        .catch(() => {
          if (active())
            fail(
              "Verification could not load. Check your connection and retry.",
            );
        });

    return () => {
      if (active()) generation.current++;
      settle(new Error("Verification cancelled"));
      token.current = null;
      widget.current = null;
      if (id !== null) {
        try {
          api()?.remove(id);
        } catch {
          // The provider may already have removed the iframe.
        }
      }
    };
    // Callback refs keep changing form state from recreating the widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitekey, action, attempt]);

  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="flex min-h-[65px] justify-center"
        data-sitekey={sitekey}
        data-action={action}
        data-testid="turnstile-container"
        aria-label="Security verification"
        aria-busy={status === "loading"}
      />
      {status === "loading" ? (
        <p className="text-center text-xs text-muted" role="status">
          Loading security verification…
        </p>
      ) : null}
      {status === "error" ? (
        <div
          className="auth-alert flex items-center justify-between gap-3"
          role="alert"
        >
          <p>{failure.current}</p>
          <button
            type="button"
            className="shrink-0 rounded-full border border-error/30 bg-white/70 px-3 py-1 text-xs font-medium text-error transition-colors duration-140 ease-out hover:bg-white"
            aria-label="Retry verification challenge"
            onClick={reset}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
