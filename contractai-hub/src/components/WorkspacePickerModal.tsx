import { useState } from "react";
import { FolderPlus, FolderOpen, FileText } from "lucide-react";
import { useWorkspaces } from "@/services/store";
import { Badge, Button, Input, Modal } from "./ui";

/**
 * Shown after a PDF is picked on the landing page: create a new workspace
 * or select an existing one to save the upload into.
 */
export function WorkspacePickerModal({
  open,
  fileName,
  onClose,
  onPick,
}: {
  open: boolean;
  fileName: string | null;
  onClose: () => void;
  onPick: (workspaceId: string) => void;
}) {
  const workspaces = useWorkspaces();
  const [newName, setNewName] = useState("");

  return (
    <Modal open={open} onClose={onClose} title="Choose a workspace" wide>
      {fileName && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          <FileText className="size-4 shrink-0 text-primary" />
          <span className="truncate">{fileName}</span>
          <Badge tone="neutral" className="ml-auto shrink-0 uppercase">
            {fileName.split(".").pop() || "DOC"}
          </Badge>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Create a new workspace
        </p>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Vendor contracts 2026"
            aria-label="New workspace name"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) onPick(`new:${newName.trim()}`);
            }}
          />
          <Button disabled={!newName.trim()} onClick={() => onPick(`new:${newName.trim()}`)}>
            <FolderPlus className="size-4" />
            Create
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Or select an existing workspace
        </p>
        {workspaces.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            No workspaces yet — create your first one above.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <button
                  onClick={() => onPick(ws.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <FolderOpen className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{ws.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
