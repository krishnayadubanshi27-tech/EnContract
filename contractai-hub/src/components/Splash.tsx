import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const SPLASH_FLAG = "encontract:splashed";
const HOLD_MS = 1400;
const FADE_MS = 450;

/**
 * Hotstar-style splash: quick fade-in "pop" of the EnContract logo on
 * first load of the session, then a smooth fade into the app.
 */
export function Splash() {
  const [phase, setPhase] = useState<"hidden" | "shown" | "leaving" | "gone">("hidden");

  useEffect(() => {
    if (sessionStorage.getItem(SPLASH_FLAG)) {
      setPhase("gone");
      return;
    }
    setPhase("shown");
  }, []);

  useEffect(() => {
    if (phase !== "shown") return;
    sessionStorage.setItem(SPLASH_FLAG, "1");
    const hold = setTimeout(() => setPhase("leaving"), HOLD_MS);
    return () => clearTimeout(hold);
  }, [phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const done = setTimeout(() => setPhase("gone"), FADE_MS);
    return () => clearTimeout(done);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] grid place-items-center bg-background"
      style={
        phase === "leaving" ? { animation: `splash-out ${FADE_MS}ms ease-in both` } : undefined
      }
    >
      <div className={phase === "shown" ? "animate-splash-pop" : undefined}>
        <div className="flex flex-col items-center gap-3">
          <Logo
            markClassName="size-14 rounded-2xl animate-glow-pulse"
            className="[&>span:last-child]:text-3xl"
          />
          <p className="text-sm text-muted-foreground">your own contract and compliance manager</p>
        </div>
      </div>
    </div>
  );
}
