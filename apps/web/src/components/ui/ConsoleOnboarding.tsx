import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  readSeenTips,
  rememberTip,
  type OnboardingTip,
} from "$lib/ui/onboarding";

const ANCHOR = "data-onboarding-tip";
const MODAL = '[role="dialog"][aria-modal="true"]';
const EDGE = 12;
const GAP = 10;

type Surface = "officer" | "instructor";
type Target = { id: string; node: HTMLElement };
const HelpContext = createContext<{
  open: boolean;
  toggle: () => void;
  panelId: string;
} | null>(null);

export function OnboardingHelp() {
  const help = useContext(HelpContext);
  if (!help) return null;
  return (
    <button
      type="button"
      data-onboarding-help
      data-console-onboarding-ui
      aria-expanded={help.open}
      aria-controls={help.open ? help.panelId : undefined}
      onClick={help.toggle}
      className="press rounded-md px-2 py-1 text-sm font-medium text-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
    >
      Help
    </button>
  );
}

export default function ConsoleOnboarding({
  surface,
  accountId,
  tips,
  children,
}: {
  surface: Surface;
  accountId: string;
  tips: readonly OnboardingTip[];
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const helpPanel = useRef<HTMLElement>(null);
  const helpReturn = useRef<HTMLElement | null>(null);
  const panelId = useId();
  const storageKey = `erpsys:onboarding:v1:${surface}:${accountId}`;
  const [seen] = useState(() => readSeenTips(storageKey));
  const [helpOpen, setHelpOpen] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [visible, setVisible] = useState<Target[]>([]);
  const [modal, setModal] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState<Target | null>(null);
  const replay = useRef<string | null>(null);
  const previouslyVisible = useRef<Target[]>([]);
  const shown = active && visible.includes(active) && !helpOpen ? active : null;
  const tip = tips.find(({ id }) => shown?.id === id);

  useEffect(() => {
    const rootNode = root.current;
    if (!rootNode) return;
    const page: HTMLDivElement = rootNode;
    const known = new Set(tips.map(({ id }) => id));
    let items: Target[] = [];
    let top: HTMLElement | null = null;
    const intersecting = new Set<HTMLElement>();
    function publishVisible() {
      const next = items.filter(({ node }) => intersecting.has(node));
      setVisible((current) => (sameTargets(current, next) ? current : next));
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            intersecting.add(entry.target as HTMLElement);
          } else {
            intersecting.delete(entry.target as HTMLElement);
          }
        }
        publishVisible();
      },
      { threshold: [0, 0.01] },
    );

    function sync() {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>(MODAL));
      const nextModal =
        dialogs.findLast(
          (node) => !node.closest('[hidden], [inert], [aria-hidden="true"]'),
        ) ?? null;
      const scope = nextModal ?? page;
      const next = Array.from(
        scope.querySelectorAll<HTMLElement>(`[${ANCHOR}]`),
      )
        .filter(
          (node) =>
            node.closest(MODAL) === nextModal &&
            !node.closest('[hidden], [inert], [aria-hidden="true"]'),
        )
        .flatMap((node) => {
          const id = node.getAttribute(ANCHOR);
          if (!id || !known.has(id)) return [];
          return [
            items.find((item) => item.node === node && item.id === id) ?? {
              id,
              node,
            },
          ];
        });
      if (top !== nextModal) {
        top = nextModal;
        setModal(top);
      }
      if (sameTargets(items, next)) return;
      for (const { node } of items) {
        if (next.some((item) => item.node === node)) continue;
        observer.unobserve(node);
        intersecting.delete(node);
      }
      for (const { node } of next) {
        if (!items.some((item) => item.node === node)) observer.observe(node);
      }
      items = next;
      setTargets(next);
      publishVisible();
    }
    sync();
    const mutations = new MutationObserver(sync);
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [ANCHOR, "aria-modal", "hidden", "inert", "aria-hidden"],
    });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [tips]);

  useEffect(() => {
    if (helpOpen) return;
    const entered = visible.filter(
      (item) => !previouslyVisible.current.includes(item),
    );
    previouslyVisible.current = visible;
    if (replay.current) {
      const requested = visible.find(({ id }) => id === replay.current);
      if (requested) {
        replay.current = null;
        setActive(requested);
        return;
      }
      if (targets.some(({ id }) => id === replay.current)) return;
    }
    const next = entered.find(({ id }) => !seen.has(id));
    if (next && accountId) {
      setActive(next);
    } else {
      setActive((current) =>
        current && visible.includes(current) ? current : null,
      );
    }
  }, [accountId, helpOpen, seen, targets, visible]);

  useEffect(() => {
    if (shown && accountId && !seen.has(shown.id))
      rememberTip(storageKey, seen, shown.id);
  }, [accountId, seen, shown, storageKey]);

  function openHelp(trigger: HTMLElement | null) {
    replay.current = null;
    setActive(null);
    helpReturn.current = trigger;
    setHelpOpen(true);
  }

  useEffect(() => {
    function openFromMenu() {
      openHelp(
        root.current?.querySelector<HTMLElement>("[data-onboarding-help]") ??
          null,
      );
    }
    const eventName = `${surface}:open-onboarding`;
    window.addEventListener(eventName, openFromMenu);
    return () => window.removeEventListener(eventName, openFromMenu);
  }, [surface]);

  useEffect(() => {
    if (!helpOpen) return;
    helpPanel.current?.focus({ preventScroll: true });
    function pressEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setHelpOpen(false);
      if (helpPanel.current?.contains(document.activeElement))
        helpReturn.current?.focus();
    }
    function dismissOutside(event: PointerEvent) {
      const node = event.target;
      if (
        node instanceof Node &&
        !helpPanel.current?.contains(node) &&
        !(node instanceof Element && node.closest("[data-onboarding-help]"))
      ) {
        setHelpOpen(false);
      }
    }
    window.addEventListener("keydown", pressEscape);
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      window.removeEventListener("keydown", pressEscape);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [helpOpen]);

  useEffect(() => {
    if (modal) setHelpOpen(false);
  }, [modal]);

  function showAgain(id: string, target?: Target) {
    replay.current = id;
    setHelpOpen(false);
    helpReturn.current?.focus({ preventScroll: true });
    target?.node.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
  }

  function showOnInteraction(node: EventTarget) {
    if (!accountId || helpOpen || shown || !(node instanceof Element)) return;
    const anchor = node.closest(`[${ANCHOR}]`);
    const target = visible.find(
      (item) => item.node === anchor && !seen.has(item.id),
    );
    if (target) setActive(target);
  }

  return (
    <HelpContext.Provider
      value={{
        open: helpOpen,
        panelId,
        toggle: () =>
          helpOpen
            ? setHelpOpen(false)
            : openHelp(
                root.current?.querySelector<HTMLElement>(
                  "[data-onboarding-help]",
                ) ?? null,
              ),
      }}
    >
      <div
        ref={root}
        className="flex h-full flex-col"
        onFocus={(event) => showOnInteraction(event.target)}
        onPointerOver={(event) => showOnInteraction(event.target)}
      >
        {children}
        {helpOpen && !modal && (
          <aside
            id={panelId}
            ref={helpPanel}
            tabIndex={-1}
            aria-label="Console tips"
            data-console-onboarding-ui
            className="fixed right-3 top-20 z-40 max-h-[min(70dvh,32rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-auto overscroll-contain rounded-xl border border-border bg-surface-raised p-3 text-ink shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-2">
              <h2 className="text-sm font-semibold">Console tips</h2>
              <button
                type="button"
                className="press rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface hover:text-ink"
                onClick={() => {
                  setHelpOpen(false);
                  helpReturn.current?.focus();
                }}
              >
                Close Help
              </button>
            </div>
            <ul className="space-y-1">
              {tips.map((item) => {
                const target = targets.find(({ id }) => id === item.id);
                return (
                  <li key={item.id}>
                    {target ? (
                      <button
                        type="button"
                        className="press w-full rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-surface"
                        onClick={() => showAgain(item.id, target)}
                      >
                        {item.title}
                        <span className="ml-2 text-xs font-normal text-muted">
                          Show highlight
                        </span>
                      </button>
                    ) : (
                      <details className="rounded-lg px-2 py-2 text-sm hover:bg-surface">
                        <summary className="cursor-pointer font-medium">
                          {item.title}
                        </summary>
                        <p className="mt-1 text-muted">
                          {item.context} {item.body}
                        </p>
                        <button
                          type="button"
                          className="press mt-2 rounded-md px-1 py-1 text-xs font-medium text-primary hover:underline"
                          onClick={() => showAgain(item.id)}
                        >
                          Highlight when available
                        </button>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        )}
        {!helpOpen && shown && tip && (
          <TipCallout
            key={tip.id}
            tip={tip}
            target={shown.node}
            scope={modal}
            onDismiss={() => setActive(null)}
          />
        )}
      </div>
    </HelpContext.Provider>
  );
}

function sameTargets(a: Target[], b: Target[]) {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function TipCallout({
  tip,
  target,
  scope,
  onDismiss,
}: {
  tip: OnboardingTip;
  target: HTMLElement;
  scope: HTMLElement | null;
  onDismiss: () => void;
}) {
  const callout = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const descriptionId = useId();

  useEffect(() => {
    const card = callout.current;
    const outline = ring.current;
    if (!card || !outline) return;
    let frame = 0;
    function place() {
      if (!card || !outline) return;
      const rect = target.getBoundingClientRect();
      const width = document.documentElement.clientWidth || window.innerWidth;
      const height = window.innerHeight;
      const left = Math.max(
        EDGE,
        Math.min(rect.left, width - card.offsetWidth - EDGE),
      );
      const below = rect.bottom + GAP;
      const above = rect.top - card.offsetHeight - GAP;
      const top =
        below + card.offsetHeight <= height - EDGE ||
        (above < EDGE && below < height - rect.top)
          ? Math.min(below, Math.max(EDGE, height - card.offsetHeight - EDGE))
          : Math.max(EDGE, above);
      const overlayParent = card.offsetParent;
      // Confirm dialogs may establish a fixed-position containing block while animating.
      const origin =
        overlayParent instanceof HTMLElement && overlayParent !== document.body
          ? overlayParent.getBoundingClientRect()
          : { left: 0, top: 0 };
      Object.assign(card.style, {
        left: `${left - origin.left}px`,
        top: `${top - origin.top}px`,
        visibility: "visible",
      });
      const radius = getComputedStyle(target).borderRadius;
      Object.assign(outline.style, {
        left: `${rect.left - origin.left - 3}px`,
        top: `${rect.top - origin.top - 3}px`,
        width: `${rect.width + 6}px`,
        height: `${rect.height + 6}px`,
        borderRadius: radius === "0px" ? "8px" : radius,
        visibility: "visible",
      });
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    }
    place();
    const resize = new ResizeObserver(schedule);
    resize.observe(target);
    resize.observe(card);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    scope?.addEventListener("transitionend", schedule);
    const describedBy = new Set(
      (target.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter(Boolean),
    );
    describedBy.add(descriptionId);
    target.setAttribute("aria-describedby", [...describedBy].join(" "));
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      scope?.removeEventListener("transitionend", schedule);
      const remaining = (target.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter((id) => id && id !== descriptionId);
      if (remaining.length)
        target.setAttribute("aria-describedby", remaining.join(" "));
      else target.removeAttribute("aria-describedby");
    };
  }, [descriptionId, scope, target]);

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none invisible fixed z-40 border-2 border-primary"
        ref={ring}
      />
      <div
        ref={callout}
        data-console-onboarding-ui
        className="pointer-events-none invisible fixed z-40 flex max-h-[calc(100dvh-1.5rem)] w-[min(17rem,calc(100vw-1.5rem))] items-start gap-2 overflow-auto rounded-xl border border-primary/35 bg-surface-raised p-3 text-ink shadow-lg"
      >
        <p
          id={descriptionId}
          role="status"
          className="min-w-0 flex-1 text-sm leading-snug text-muted"
        >
          <strong className="mb-0.5 block text-sm font-semibold text-ink">
            {tip.title}
          </strong>
          {tip.body}
        </p>
        <button
          type="button"
          aria-label={`Dismiss tip: ${tip.title}`}
          className="press pointer-events-auto -mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-base text-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) {
              const returnTo = target.matches(
                "button:not(:disabled), input:not(:disabled), [href]",
              )
                ? target
                : scope
                  ? scope.querySelector<HTMLElement>("button:not(:disabled)")
                  : document.querySelector<HTMLElement>(
                      "[data-onboarding-help]",
                    );
              returnTo?.focus({ preventScroll: true });
            }
            onDismiss();
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </>,
    scope ?? document.body,
  );
}
