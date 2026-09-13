import { Link, useNavigate } from "@tanstack/react-router";
import { Bot, LayoutGrid, LogOut } from "lucide-react";
import { useAuth } from "@/services/auth";
import { Logo } from "./Logo";
import { Button } from "./ui";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="glass-strong sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/dashboard" aria-label="EnContract dashboard">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex"
            activeProps={{ className: "text-foreground bg-secondary" }}
          >
            <LayoutGrid className="size-4" />
            Workspaces
          </Link>
          <Link
            to="/ai-assistant"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex"
            activeProps={{ className: "text-foreground bg-secondary" }}
          >
            <Bot className="size-4" />
            AI Assistant
          </Link>
          {user && (
            <span className="hidden items-center gap-2 rounded-full border border-border bg-secondary/50 py-1 pl-1 pr-3 text-xs text-muted-foreground sm:inline-flex">
              <span className="grid size-6 place-items-center rounded-full bg-primary/20 font-semibold text-primary">
                {user.name.charAt(0).toUpperCase()}
              </span>
              {user.name}
            </span>
          )}
          <Button
            variant="ghost"
            className="px-2.5"
            aria-label="Sign out"
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
