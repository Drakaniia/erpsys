import { useLayoutEffect, useRef } from "react";
import { MemoryRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { Easing, interpolate } from "remotion";
import Header from "../src/components/Header";
import { StudentPage } from "../src/app/student-page";
import { OfficerPage } from "../src/app/officer-page";
import { InstructorPage } from "../src/app/instructor-page";
import { QueuePage } from "../src/app/queue-page";
import { AdminPage } from "../src/app/admin-page";
import { SceneData, type Surface } from "./session";
import { queryClient } from "./api";

const page = {
  student: StudentPage,
  officer: OfficerPage,
  instructor: InstructorPage,
  admin: AdminPage,
  queue: QueuePage,
};
type Cue = { from: number; hit: number; label: string };
const cues: Record<Surface, Cue[]> = {
  student: [
    { from: 9, hit: 41, label: "Profiling" },
    { from: 64, hit: 110, label: "I've submitted" },
  ],
  officer: [
    { from: 8, hit: 41, label: "Review" },
    { from: 52, hit: 84, label: "Stamp as verified" },
    { from: 98, hit: 138, label: "Stamp" },
  ],
  instructor: [
    { from: 9, hit: 44, label: "Serve" },
    { from: 57, hit: 90, label: "Validate" },
    { from: 106, hit: 140, label: "Confirm Enrollment" },
  ],
  admin: [{ from: 82, hit: 113, label: "Reports" }],
  queue: [],
};
// Measure the real DOM control in app coordinates, including any responsive tab scrolling.
// No recorded pixels, mouse events, or dependencies on playback history.
function Pointer({ surface, frame }: { surface: Surface; frame: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const cursor = ref.current,
      host = cursor?.parentElement;
    if (!cursor || !host) return;
    if (surface === "admin") {
      const scroller = host.querySelector<HTMLElement>(
        '[aria-label="Admin sections"] .apple-scrollbar',
      );
      const report = host.querySelector<HTMLElement>("#admin-tab-reports");
      if (scroller && report)
        scroller.scrollLeft = interpolate(
          frame,
          [75, 90],
          [0, Math.max(0, report.offsetLeft - scroller.clientWidth + 180)],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
      const main = host.querySelector("main");
      if (main)
        main.scrollTop =
          frame >= 114
            ? 0
            : interpolate(frame, [30, 68], [0, 230], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.25, 0.75, 0.25, 1),
              });
    }
    const cue = cues[surface].find((c) => frame >= c.from && frame <= c.hit);
    const visible = Boolean(cue);
    cursor.style.display = visible ? "block" : "none";
    if (!cue) return;
    const buttons = Array.from(
      host.querySelectorAll<HTMLElement>('button,[role="tab"]'),
    );
    const button = buttons.find(
      (b) =>
        b.getBoundingClientRect().width > 0 &&
        (b.innerText.trim() === cue.label ||
          (cue.label === "Profiling" &&
            b.classList.contains("step-card") &&
            b.innerText.includes("Profiling")) ||
          (cue.label === "Reports" && b.innerText.includes("Reports"))),
    );
    if (!button) {
      cursor.style.display = "none";
      return;
    }

    const rect = button.getBoundingClientRect(),
      root = host.getBoundingClientRect();
    const zoom = root.width / host.clientWidth;
    const x = (rect.left - root.left + rect.width * 0.52) / zoom,
      y = (rect.top - root.top + rect.height * 0.57) / zoom;
    const k = interpolate(frame, [cue.from, cue.hit - 6], [0, 1], {
      easing: Easing.bezier(0.25, 0.65, 0.2, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    cursor.style.left = `${x + 95 * (1 - k)}px`;
    cursor.style.top = `${y + 55 * (1 - k)}px`;
    cursor.style.opacity = String(Math.min(1, (frame - cue.from + 1) / 5));
    cursor.style.scale = frame >= cue.hit - 2 ? ".86" : "1";
  }, [surface, frame]);
  return (
    <div
      ref={ref}
      style={{
        display: "none",
        position: "absolute",
        zIndex: 120,
        pointerEvents: "none",
        transformOrigin: "0 0",
      }}
    >
      <svg
        width="28"
        height="34"
        viewBox="0 0 28 34"
        style={{ filter: "drop-shadow(0px 2px 2px #0005)" }}
      >
        <path
          d="M2 2L24 17L14 19L9 30Z"
          fill="#142a46"
          stroke="white"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
export function Application({
  surface,
  frame,
}: {
  surface: Surface;
  frame: number;
}) {
  const Page = page[surface];
  const route =
    surface === "admin" && frame >= 114
      ? "/admin?tab=reports&report=enrollment-summary"
      : `/${surface}`;
  return (
    <div
      className="film-app bg-surface text-ink"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        transform: "translateZ(0)",
        fontFamily: "var(--font-sans)",
        fontSize: 16,
        lineHeight: 1.5,
        letterSpacing: "normal",
      }}
    >
      <SceneData.Provider value={{ surface, frame }}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter key={route} initialEntries={[route]}>
            <div className="relative grid h-full grid-rows-[auto_1fr]">
              <Header />
              <div className="min-h-0 overflow-hidden">
                <Page />
              </div>
            </div>
          </MemoryRouter>
        </QueryClientProvider>
      </SceneData.Provider>
      <Pointer surface={surface} frame={frame} />
    </div>
  );
}
