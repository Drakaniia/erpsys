import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { clearSignedOutFlag } from "$lib/auth/session-guard";
import AuthShell from "../components/auth/AuthShell";
import LoginCard from "../components/auth/LoginCard";
import RegisterCard from "../components/auth/RegisterCard";
import CompleteProfileCard from "../components/auth/CompleteProfileCard";

export function LandingPage() {
  return <Navigate to="/login" replace />;
}

function useReasonToast() {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const reason = params.get("reason");
    if (reason === "expired") {
      toast.error("Your session expired — please sign in again.", {
        duration: 5000,
      });
    } else if (reason === "signed-out") {
      toast.success("Signed out successfully.", { duration: 5000 });
    } else return;
    clearSignedOutFlag();
    const next = new URLSearchParams(params);
    next.delete("reason");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function useAuthMeta(title: string, path: string, description: string) {
  useEffect(() => {
    document.title = `${title} — ERPSYS`;
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = window.location.origin + path;
  }, [title, path, description]);
}

export function LoginPage() {
  useReasonToast();
  useAuthMeta(
    "Sign in",
    "/login",
    "Sign in to the COT-SBO Enrollment Requirements Processing System (ERPSYS) with your BukSU account.",
  );
  return (
    <AuthShell>
      <LoginCard />
    </AuthShell>
  );
}

export function RegisterPage() {
  useAuthMeta(
    "Create your student account",
    "/login/register",
    "Create an ERPSYS student account to submit and track your enrollment requirements.",
  );
  return (
    <AuthShell>
      <RegisterCard />
    </AuthShell>
  );
}

export function CompleteProfilePage() {
  return (
    <AuthShell>
      <CompleteProfileCard />
    </AuthShell>
  );
}

export function NotFoundPage() {
  return <Navigate to="/" replace />;
}
