import { useState } from "react";
import { PieCenter } from "@/components/charts/pie-center";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { accountSlices, type AccountRole, type AdminOverview } from "$lib/admin/overview";
import Skeleton from "../../ui/Skeleton";
import { Panel } from "./Panel";

const ROLE_COLORS: Record<AccountRole, string> = {
  STUDENT: "var(--chart-1)",
  SBO_OFFICER: "var(--chart-3)",
  ENROLLMENT_ADVISER: "var(--chart-2)",
  ADMIN: "var(--chart-4)",
};

const SIZE = 176;

export function AccountMix({
  data,
  index,
  onopenusers,
}: {
  data: AdminOverview | undefined;
  index: number;
  onopenusers: (role: AccountRole) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const slices = data ? accountSlices(data) : [];
  const total = slices.reduce((n, s) => n + s.value, 0);
  const pieData = slices.map((s) => ({
    label: s.label,
    value: s.value,
    color: ROLE_COLORS[s.role],
  }));

  return (
    <Panel
      title="Who has an account"
      description="Active accounts by role. Pick a role to manage those users."
      index={index}
    >
      <div className="flex flex-1 flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="shrink-0" style={{ width: SIZE, height: SIZE }}>
          {!data ? (
            <Skeleton h={`${SIZE}px`} w={`${SIZE}px`} radius="999px" />
          ) : total === 0 ? (
            <div className="flex size-full items-center justify-center rounded-full border border-dashed border-border text-xs text-muted">
              No accounts
            </div>
          ) : (
            <PieChart
              data={pieData}
              size={SIZE}
              innerRadius={SIZE / 2 - 22}
              padAngle={0.03}
              cornerRadius={4}
              hoveredIndex={hovered}
              onHoverChange={setHovered}
            >
              {pieData.map((_, i) => (
                <PieSlice key={i} index={i} hoverEffect="grow" hoverOffset={4} />
              ))}
              <PieCenter defaultLabel="Accounts" />
            </PieChart>
          )}
        </div>

        <ul className="flex w-full min-w-0 flex-col gap-0.5">
          {(data ? slices : []).map((s, i) => {
            const share = total ? Math.round((s.value / total) * 100) : 0;
            return (
              <li key={s.role}>
                <button
                  type="button"
                  onClick={() => onopenusers(s.role)}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  className={`ov-link flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${
                    hovered === i ? "bg-primary/5" : "hover:bg-primary/5"
                  }`}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: ROLE_COLORS[s.role] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {s.value.toLocaleString()}
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted">
                    {share}%
                  </span>
                </button>
              </li>
            );
          })}
          {!data &&
            [0, 1, 2, 3].map((i) => (
              <li key={i} className="px-2.5 py-2.5">
                <Skeleton h="0.875rem" w={`${70 - i * 10}%`} index={i} />
              </li>
            ))}
        </ul>
      </div>
    </Panel>
  );
}
