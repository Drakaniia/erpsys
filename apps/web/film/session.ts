import { createContext, useContext } from "react";

export type Surface = "student" | "officer" | "queue" | "instructor" | "admin";
export const SceneData = createContext<{ surface: Surface; frame: number }>({
  surface: "student",
  frame: 0,
});
export const useScene = () => useContext(SceneData);
export const accounts = {
  student: {
    id: "student-1",
    name: "Mara Reyes",
    role: "STUDENT",
    email: "mara@example.invalid",
  },
  officer: {
    id: "officer-1",
    name: "Lia Cruz",
    role: "SBO_OFFICER",
    email: "lia@example.invalid",
  },
  instructor: {
    id: "adviser-1",
    name: "Noel Santos",
    role: "ENROLLMENT_ADVISER",
    email: "noel@example.invalid",
  },
  admin: {
    id: "admin-1",
    name: "Alex Lim",
    role: "ADMIN",
    email: "alex@example.invalid",
  },
};
export const authClient = {
  useSession() {
    const { surface } = useScene();
    return {
      data: { user: accounts[surface === "queue" ? "student" : surface] },
      isPending: false,
    };
  },
};
