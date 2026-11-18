import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "react-router";
import BlueprintBackground from "./BlueprintBackground";

const ClearanceDeskIllustration = lazy(
  () => import("./ClearanceDeskIllustration"),
);

/**
 * Light drafting-sheet page: brand, form card and docs link stacked on the
 * left, the clearance-desk drawing beside them from 1080px. Below that the
 * drawing drops and the stack centres. Height is a minimum, never a frame.
 * `wide` gives long forms a two-column card and drops the drawing.
 */
export default function AuthShell({
  children,
  heading,
  wide = false,
}: {
  children: ReactNode;
  heading?: string;
  wide?: boolean;
}) {
  const showFigure = !wide;
  return (
    <div className="auth-page-enter relative flex min-h-dvh flex-col items-center bg-surface px-[clamp(16px,4vw,40px)] pt-[clamp(48px,9vh,112px)] pb-[clamp(20px,5vh,56px)] text-auth-ink [@media(max-height:700px)]:pt-6 [@media(max-height:700px)]:pb-4">
      <BlueprintBackground />

      <div
        className={`relative z-[1] my-auto grid w-full items-center justify-center ${
          showFigure
            ? "grid-cols-[minmax(0,440px)] min-[1080px]:grid-cols-[minmax(0,440px)_minmax(0,1fr)] min-[1080px]:justify-normal min-[1080px]:gap-[clamp(32px,5vw,72px)] min-[1080px]:ps-[clamp(0px,8vw,160px)]"
            : "grid-cols-[minmax(0,760px)]"
        }`}
      >
        <div className="flex w-full flex-col items-center gap-[clamp(16px,3vh,28px)]">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <img
              src="/images/cot-sbo-logo.webp"
              alt="COT-SBO"
              className="h-[clamp(64px,8vw,96px)] w-auto object-contain select-none [@media(max-height:820px)]:h-14"
            />
            <p className="mt-[clamp(6px,1.5vh,14px)] text-[clamp(22px,2.2vw,34px)] leading-tight font-semibold tracking-[-0.01em] whitespace-nowrap">
              ERPSYS
            </p>
            <p className="max-w-[40ch] text-[clamp(15px,1.1vw,17px)] leading-snug text-balance text-muted">
              COT-SBO Enrollment Requirements Processing System, Bukidnon State
              University
            </p>
            {heading ? (
              <h1 className="sr-only">
                {heading}
              </h1>
            ) : null}
          </div>

          <main
            className={`auth-enter relative w-full rounded-[14px] border border-border bg-white p-[clamp(22px,3vw,32px)] shadow-[0_1px_2px_rgb(15_26_51/6%)] ${wide ? "max-w-[760px]" : "max-w-[440px]"}`}
          >
            {children}
          </main>

          <Link
            to="/docs"
            className="text-[13px] text-muted underline decoration-auth-border underline-offset-4 transition-colors hover:text-auth-ink"
          >
            How ERPSYS works
          </Link>
        </div>

        {showFigure ? (
          <figure className="m-0 hidden w-full min-[1080px]:block">
            <Suspense fallback={null}>
              <ClearanceDeskIllustration
                animate="hover"
                title="An enrollment clearance desk: a live queue monitor, a ticket dispenser, a six-step checklist with an officer's stamp, requirement folders and student ID cards"
                className="mx-auto block max-h-[min(78vh,680px)] w-full"
              />
            </Suspense>
          </figure>
        ) : null}
      </div>
    </div>
  );
}
