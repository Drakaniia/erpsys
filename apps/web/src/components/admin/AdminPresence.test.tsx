import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useLayoutEffect, type ComponentProps, type ReactNode } from "react";
import DepartmentTable from "./DepartmentTable";
import AcademicYearTable from "./AcademicYearTable";
import RequirementList from "./RequirementList";
import ActivateYearDialog from "./ActivateYearDialog";
import AdviserMappingList from "./AdviserMappingList";
import ChatbotEditor from "./ChatbotEditor";
import InviteAccount from "./InviteAccount";
import PasswordManagement from "./PasswordManagement";
import IntegrationCredentialsEditor from "./IntegrationCredentialsEditor";
import AuthenticatorSection from "./AuthenticatorSection";
import UserRowDialogs from "./UserRowDialogs";

const state = vi.hoisted(() => ({ adviserId: null as string | null, blocked: true }));
vi.mock("../ActiveEditors", () => ({
  useEditingLock: () => ({ blocked: state.blocked, onBlockedChange: () => {} }),
  default: ({ resource, id, scope, children, onBlockedChange }: { resource: string; id?: string; scope?: string; children?: ReactNode; onBlockedChange?: (value: boolean) => void }) => {
    useLayoutEffect(() => { onBlockedChange?.(state.blocked); }, [onBlockedChange]);
    return <><span data-testid="presence" data-resource={resource} data-id={id} data-scope={scope} /><fieldset disabled={state.blocked}>{children}</fieldset></>;
  },
}));
vi.mock("$lib/edit-timestamp", () => ({ useEditTimestamp: () => ({ ts: 1, saved: vi.fn() }) }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useMutation: () => ({ isPending: false, reset: vi.fn() }),
  useQuery: () => ({
    data: {
      data: [{ id: "target", name: "Target", label: "Target", semesterLabel: "Semester", code: "T", yearLevels: [], isActive: true, createdAt: "2026-01-01", studentNumber: null }],
      content: "Knowledge",
    },
    isPending: false, isSuccess: true, refetch: vi.fn(),
  }),
}));
vi.mock("./use-adviser-mapping", () => ({
  useAdviserMapping: () => ({
    advisers: [{ id: "target", name: "Target", email: "target@example.test", departments: [] }],
    activeDepartments: [], editingId: state.adviserId, selectedLevels: new Map(),
  }),
}));
vi.mock("./KnowledgeEditor", () => ({ default: () => <textarea aria-label="Knowledge" /> }));
vi.mock("$lib/integrations/use-integrations", () => ({
  useAuthenticators: () => ({ data: [{ userId: "target", name: "Target", enrolled: true }] }),
  useResetAuthenticator: () => ({ reset: vi.fn() }),
  useSaveCredentials: () => ({}), useResetCredentials: () => ({}), useValidateCredentials: () => ({}), failuresOf: () => [],
}));

afterEach(() => { cleanup(); state.adviserId = null; state.blocked = true; });

function presence(resource: string, id?: string, scope?: string) {
  const banner = screen.getByTestId("presence");
  expect(banner.getAttribute("data-resource")).toBe(resource);
  expect(banner.getAttribute("data-id")).toBe(id ?? null);
  expect(banner.getAttribute("data-scope")).toBe(scope ?? null);
}

const ontoast = vi.fn();
describe("admin presence wiring", () => {
  it.each([
    [DepartmentTable, "department", "Add department", "Department name"],
    [AcademicYearTable, "academic-year", "Create year", "Year label"],
  ] as const)("tracks only the active edit or create draft %#", (Table, resource, add, field) => {
    render(<Table ontoast={ontoast} onyearactivated={vi.fn()} />);
    expect(screen.queryByTestId("presence")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    presence(resource, "target");
    expect(screen.getByLabelText(field)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("presence")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: add }));
    presence(resource);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("presence")).toBeNull();
  });

  it("tracks requirement edit and creation, not idle rows", () => {
    render(<RequirementList ontoast={ontoast} />);
    expect(screen.queryByTestId("presence")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Target" }));
    presence("requirement", "target");
    expect(screen.getByLabelText("Requirement label")).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText("Requirement label"), { key: "Escape" });
    expect(screen.queryByTestId("presence")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add requirement" }));
    presence("requirement");
  });

  it("tracks only the open academic year activation", () => {
    const props = { ontoast, onactivated: vi.fn(), onclose: vi.fn() };
    const { rerender } = render(<ActivateYearDialog {...props} year={null} />);
    expect(screen.queryByTestId("presence")).toBeNull();
    rerender(<ActivateYearDialog {...props} year={{ id: "year", label: "Year", semesterLabel: "Semester" }} />);
    presence("academic-year", "year");
    expect(within(screen.getByRole("dialog")).getByTestId("presence")).toBeTruthy();
  });

  it("tracks only the adviser being edited", () => {
    const { rerender } = render(<AdviserMappingList ontoast={ontoast} />);
    expect(screen.queryByTestId("presence")).toBeNull();
    state.adviserId = "target";
    rerender(<AdviserMappingList ontoast={ontoast} />);
    presence("adviser", "target");
  });

  it("uses the chatbot singleton without a fabricated id or scope", () => {
    render(<ChatbotEditor ontoast={ontoast} />);
    presence("chatbot-knowledge");
  });

  it("tracks invitations only while their form is open", () => {
    render(<InviteAccount ontoast={ontoast} />);
    expect(screen.queryByTestId("presence")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    presence("user");
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeDisabled();
    expect(screen.getByLabelText("Full name")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("presence")).toBeNull();
  });

  it("tracks password reset only for the modal's selected user", () => {
    render(<PasswordManagement ontoast={ontoast} registerrefresh={vi.fn()} />);
    expect(screen.queryByTestId("presence")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Ta" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    presence("user", "target");
    expect(within(screen.getByRole("dialog")).getByTestId("presence")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /Reset/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("presence")).toBeNull();
  });

  it("keys the open integration credentials form by scope, never id", () => {
    render(<IntegrationCredentialsEditor row={{ key: "r2", label: "Uploads", description: "Uploads", enabled: true, configured: true, consequence: "No uploads", updatedByName: null, updatedAt: null, pendingRestart: false, overridesLoaded: true, credentials: [], version: 1 }} />);
    presence("integration", undefined, "r2");
  });

  it("tracks authenticator reset only while confirmation is open", () => {
    render(<AuthenticatorSection />);
    expect(screen.queryByTestId("presence")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    presence("user", "target");
    expect(within(screen.getByRole("dialog")).getByTestId("presence")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /Reset/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("presence")).toBeNull();
  });

  it.each(["roleDialog", "deleteDialog", "reactivateTarget", "purgeTarget"] as const)("tracks every actual target only inside open %s", (kind) => {
    const props: ComponentProps<typeof UserRowDialogs> = {
      roleDialog: null, deleteDialog: null, reactivateTarget: null, purgeTarget: null,
      busy: false, selectedPromotableCount: 0, selectedDemotableCount: 0, selectedCount: 2, selectedDeletableCount: 2,
      onConfirmRole: vi.fn(), onConfirmDelete: vi.fn(), onConfirmPurge: vi.fn(), onConfirmReactivate: vi.fn(),
      onCloseReactivate: vi.fn(), onCloseRole: vi.fn(), onCloseDelete: vi.fn(), onClosePurge: vi.fn(),
    };
    const { rerender } = render(<UserRowDialogs {...props} />);
    expect(screen.queryByTestId("presence")).toBeNull();
    const targets = [{ id: "one", name: "One" }, { id: "two", name: "Two" }];
    const active = kind === "roleDialog" ? { role: "STUDENT", targets, excluded: 0 } : kind === "deleteDialog" ? { targets } : targets[0];
    rerender(<UserRowDialogs {...props} {...{ [kind]: active }} />);
    const banners = within(screen.getByRole("dialog")).getAllByTestId("presence");
    expect(banners.map((banner) => banner.getAttribute("data-id"))).toEqual(kind.endsWith("Dialog") ? ["one", "two"] : ["one"]);
    expect(banners.every((banner) => banner.getAttribute("data-resource") === "user")).toBe(true);
    const actionName = kind === "roleDialog" ? "Demote" : kind === "deleteDialog" ? "Delete account" : kind === "reactivateTarget" ? "Reactivate account" : "Delete permanently";
    expect(screen.getByRole("button", { name: actionName })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    state.blocked = false;
    rerender(<UserRowDialogs {...props} {...{ [kind]: active }} />);
    if (kind === "purgeTarget") fireEvent.change(screen.getByLabelText("Type the account name to confirm"), { target: { value: "One" } });
    expect(screen.getByRole("button", { name: actionName })).toBeEnabled();
    rerender(<UserRowDialogs {...props} />);
    expect(screen.queryByTestId("presence")).toBeNull();
  });
});
