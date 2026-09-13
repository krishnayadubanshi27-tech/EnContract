import { FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30",
          markClassName,
        )}
      >
        <FileCheck2 className="size-4.5" strokeWidth={2.2} />
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        En<span className="text-primary">Contract</span>
      </span>
    </span>
  );
}
