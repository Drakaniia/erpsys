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
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
};

export interface TurnstileHandle {
  reset: () => void;
}

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

function loadScript(): Promise<void> {
  if ((window as unknown as { turnstile?: unknown }).turnstile)
    return Promise.resolve();
  if (
    document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')
  ) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(
        'script[src*="challenges.cloudflare.com/turnstile"]',
      ) as HTMLScriptElement | null;
      if (!existing) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Turnstile script failed")),
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed"));
    document.head.appendChild(script);
  });
}

function scheduleIdle(cb: () => void): number {
  const ric = (
    window as unknown as {
      requestIdleCallback?: (
        fn: () => void,
        opts?: { timeout: number },
      ) => number;
    }
  ).requestIdleCallback;
  if (ric) return ric(cb, { timeout: 1200 });
  return window.setTimeout(cb, 600);
}
function cancelIdle(id: number) {
  if (!id) return;
  const cic = (
    window as unknown as { cancelIdleCallback?: (id: number) => void }
  ).cancelIdleCallback;
  if (cic) cic(id);
  else clearTimeout(id);
}

export default function Turnstile({
  sitekey,
  action,
  onToken,
  onExpire,
  onError,
  ref,
}: Props & { ref?: Ref<TurnstileHandle> }) {
  const container = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [widgetError, setWidgetError] = useState(false);

  const isPlaceholder = !sitekey || sitekey.trim().length === 0;
  const hasError = loadError || widgetError;
  const isLoading = !isPlaceholder && !scriptLoaded && !hasError;

  // Latest callbacks without re-running the mount effect.
  const cb = useRef({ onToken, onExpire, onError });
  cb.current = { onToken, onExpire, onError };

  function renderWidget() {
    if (isPlaceholder || !container.current || !sitekey) return;
    const turnstile = (window as unknown as { turnstile?: TurnstileApi })
      .turnstile;
    if (!turnstile) return;
    if (widgetId.current) {
      try {
        turnstile.remove(widgetId.current);
      } catch {
        /* ignore */
      }
      widgetId.current = null;
    }
    setWidgetError(false);
    try {
      widgetId.current = turnstile.render(container.current, {
        sitekey,
        action,
        theme: "light",
        callback: (token: string) => {
          setWidgetError(false);
          setLoadError(false);
          cb.current.onToken(token);
        },
        "expired-callback": () => {
          cb.current.onToken("");
          cb.current.onExpire?.();
          if (widgetId.current) turnstile.reset(widgetId.current);
        },
        "error-callback": () => {
          cb.current.onToken("");
          setWidgetError(true);
          cb.current.onError?.();
        },
        "timeout-callback": () => {
          cb.current.onToken("");
          setWidgetError(true);
          cb.current.onError?.();
        },
      });
    } catch {
      setWidgetError(true);
      cb.current.onError?.();
    }
  }

  useImperativeHandle(ref, () => ({
    reset() {
      setWidgetError(false);
      setLoadError(false);
      if (!widgetId.current) {
        cb.current.onToken("");
        if (!isPlaceholder && container.current && scriptLoaded) renderWidget();
        return;
      }
      const turnstile = (window as unknown as { turnstile?: TurnstileApi })
        .turnstile;
      try {
        turnstile?.reset(widgetId.current);
        cb.current.onToken("");
      } catch {
        /* ignore */
      }
    },
  }));

  function handleRetry() {
    setLoadError(false);
    setWidgetError(false);
    cb.current.onToken("");
    if (!scriptLoaded) {
      loadScript()
        .then(() => {
          setScriptLoaded(true);
          renderWidget();
        })
        .catch(() => {
          setLoadError(true);
          cb.current.onError?.();
        });
    } else {
      renderWidget();
    }
  }

  useEffect(() => {
    if (isPlaceholder) {
      cb.current.onToken("");
      return;
    }
    let cancelled = false;
    const start = () => {
      loadScript()
        .then(() => {
          if (cancelled) return;
          setScriptLoaded(true);
        })
        .catch(() => {
          if (cancelled) return;
          setLoadError(true);
          cb.current.onError?.();
        });
    };
    const idleId = scheduleIdle(start);
    return () => {
      cancelled = true;
      cancelIdle(idleId);
      if (widgetId.current) {
        const turnstile = (window as unknown as { turnstile?: TurnstileApi })
          .turnstile;
        try {
          turnstile?.remove(widgetId.current);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaceholder]);

  // Render once the script is ready and the container exists.
  useEffect(() => {
    if (
      scriptLoaded &&
      container.current &&
      !isPlaceholder &&
      !widgetId.current &&
      !hasError
    ) {
      renderWidget();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, isPlaceholder, hasError]);

  if (isPlaceholder) {
    return (
      <div className="rounded-xl border border-dashed border-auth-border bg-surface px-3.5 py-2.5 text-xs leading-relaxed text-muted">
        Verification disabled (placeholder domain — will activate when
        production domain is set)
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="cf-turnstile flex min-h-[65px] justify-center"
        data-sitekey={sitekey}
        data-action={action}
        data-testid="turnstile-container"
        aria-live="polite"
      />
      {isLoading ? (
        <p className="sr-only" role="status" aria-live="polite">
          Loading verification…
        </p>
      ) : null}
      {hasError ? (
        <div
          className="auth-alert flex items-center justify-between gap-3"
          role="status"
          aria-live="polite"
        >
          <p role="alert">Verification failed — please try again.</p>
          <button
            type="button"
            className="shrink-0 rounded-full border border-error/30 bg-white/70 px-3 py-1 text-xs font-medium text-error transition-colors duration-140 ease-out hover:bg-white"
            aria-label="Retry verification challenge"
            onClick={handleRetry}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
