import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WaitingRow from "./WaitingRow";

afterEach(cleanup);
describe("eligible queue row", () => {
  it("offers Serve for the first eligible student even behind another year level", () => {
    const serve = vi.fn();
    render(
      <WaitingRow
        entry={{
          entryId: "e2",
          name: "Ana",
          yearLevel: "SECOND",
          joinedAt: new Date().toISOString(),
        }}
        position={2}
        canServe
        deptOpen
        onserve={serve}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Serve" }));
    expect(serve).toHaveBeenCalledOnce();
  });
});
