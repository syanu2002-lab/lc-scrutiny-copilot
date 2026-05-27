import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { loading, user, profile } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (profile?.role === "CHECKER") navigate({ to: "/checker" });
    else navigate({ to: "/maker" });
  }, [loading, user, profile, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
