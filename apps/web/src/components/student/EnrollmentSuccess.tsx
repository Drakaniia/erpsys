import { useEffect, useMemo, useState } from "react";

const CONFETTI_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#8b5cf6",
  "#f97316",
];

export default function EnrollmentSuccess({
  departmentName,
  semesterLabel,
  academicYearLabel,
  ondone,
}: {
  departmentName: string;
  semesterLabel: string;
  academicYearLabel: string;
  ondone: () => void;
}) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    setShowConfetti(true);
    const timer = setTimeout(() => setShowConfetti(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  const pieces = useMemo(
    () =>
      Array.from({ length: 100 }, (_, i) => ({
        left: Math.random() * 100,
        top: -20 + Math.random() * 10,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        duration: 2.5 + Math.random() * 2.5,
        delay: Math.random() * 2,
      })),
    [],
  );

  return (
    <>
      {showConfetti ? (
        <div
          className="pointer-events-none fixed inset-0 z-[61]"
          aria-hidden="true"
        >
          {pieces.map((p, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                backgroundColor: p.color,
                transform: `rotate(${p.rotate}deg)`,
                animation: `confetti-fall ${p.duration}s ${p.delay}s linear forwards`,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-surface px-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="success-check-container">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <svg
                className="success-check-icon"
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
          </div>
          <h1 className="display max-w-md px-6 text-balance lg:max-w-[560px]">
            You are now enrolled in{" "}
            <span className="text-primary">{departmentName}</span>,{" "}
            {semesterLabel} {academicYearLabel}
          </h1>
          <p className="max-w-sm text-sm text-muted">
            All six steps are complete — welcome to the semester.
          </p>
          <button
            type="button"
            onClick={ondone}
            className="mt-2 flex h-12 items-center justify-center rounded-xl bg-primary px-8 text-[15px] font-semibold text-white"
          >
            Done
          </button>
        </div>
      </div>

      <style>{`@keyframes confetti-fall{0%{transform:translateY(-10vh) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}.confetti-piece{position:absolute;width:.5rem;height:1rem}.success-check-container{animation:check-pop .5s cubic-bezier(.175,.885,.32,1.275) forwards}.success-check-icon{animation:check-draw .6s .3s ease-out both}@keyframes check-pop{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes check-draw{0%{stroke-dasharray:30;stroke-dashoffset:30}100%{stroke-dasharray:30;stroke-dashoffset:0}}`}</style>
    </>
  );
}
