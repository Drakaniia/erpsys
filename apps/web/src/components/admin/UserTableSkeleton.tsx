import type { CSSProperties } from "react";

const SKELETON_ROWS = Array.from({ length: 6 }, (_, i) => i);

/** The placeholder rows shown while the user list loads. */
export default function UserTableSkeleton() {
  return (
    <>
      {SKELETON_ROWS.map((i) => (
        <tr
          key={i}
          className="h-[52px]"
          aria-hidden="true"
          style={{ "--skeleton-i": i } as CSSProperties}
        >
          <td className="px-4">
            <div className="skeleton h-4 w-4 rounded" />
          </td>
          <td className="px-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 space-y-1.5">
                <div className="skeleton h-3 w-32 rounded" />
                <div className="skeleton h-2.5 w-40 rounded" />
              </div>
            </div>
          </td>
          <td className="px-2">
            <div className="skeleton h-3 w-20 rounded" />
          </td>
          <td className="px-2">
            <div className="skeleton h-5 w-16 rounded-full" />
          </td>
          <td className="px-2">
            <div className="skeleton h-3 w-14 rounded" />
          </td>
          <td className="px-2">
            <div className="skeleton h-3 w-16 rounded" />
          </td>
          <td className="px-2">
            <div className="skeleton h-3 w-12 rounded" />
          </td>
        </tr>
      ))}
    </>
  );
}
