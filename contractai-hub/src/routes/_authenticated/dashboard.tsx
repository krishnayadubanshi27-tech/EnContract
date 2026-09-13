import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, FolderKanban, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button, Card, EmptyState, Input, Modal } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { contractStore, useContracts, useWorkspaces } from "@/services/store";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Workspaces — EnContract" },
      {
        name: "description",
        content: "All your EnContract workspaces and analyzed contracts in one place.",
      },
      { property: "og:title", content: "Your Workspaces — EnContract" },
      {
        property: "og:description",
        content: "All your EnContract workspaces and analyzed contracts in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const workspaces = useWorkspaces();
  const contracts = useContracts();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const countFor = (id: string) => contracts.filter((c) => c.workspaceId === id).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Workspaces
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each workspace groups a set of contracts — by client, vendor, or deal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/ai-assistant">
              <Button variant="outline" className="gap-2">
                <Bot className="size-4 text-primary" />
                AI Assistant
              </Button>
            </Link>
            <Button onClick={() => setCreateOpen(true)}>
              <FolderPlus className="size-4" />
              New workspace
            </Button>
          </div>
        </div>

        <div className="mt-8">
          {workspaces.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="size-6" />}
              title="No workspaces yet"
              description="Create your first workspace, then drop contract PDFs into it from the home page or inside the workspace."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <FolderPlus className="size-4" />
                  Create a workspace
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((ws) => (
                <Card
                  key={ws.id}
                  className="group transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
                      <FolderOpen className="size-5" />
                    </span>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        aria-label={`Rename ${ws.name}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        onClick={() => setRenaming({ id: ws.id, name: ws.name })}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        aria-label={`Delete ${ws.name}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-risk/15 hover:text-risk"
                        onClick={() => setDeleting({ id: ws.id, name: ws.name })}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <Link
                    to="/workspace/$id"
                    params={{ id: ws.id }}
                    className="mt-4 block font-display text-lg font-semibold text-foreground hover:text-primary"
                  >
                    {ws.name}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {countFor(ws.id)} {countFor(ws.id) === 1 ? "contract" : "contracts"} · created{" "}
                    {formatDate(ws.createdAt)}
                  </p>
                  <Link to="/workspace/$id" params={{ id: ws.id }}>
                    <Button variant="outline" className="mt-4 w-full">
                      Open workspace
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a workspace">
        <div className="space-y-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Vendor contracts 2026"
            aria-label="Workspace name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                contractStore.createWorkspace(newName);
                toast.success(`Workspace “${newName.trim()}” created.`);
                setNewName("");
                setCreateOpen(false);
              }
            }}
          />
          <Button
            className="w-full"
            disabled={!newName.trim()}
            onClick={() => {
              contractStore.createWorkspace(newName);
              toast.success(`Workspace “${newName.trim()}” created.`);
              setNewName("");
              setCreateOpen(false);
            }}
          >
            <FolderPlus className="size-4" />
            Create workspace
          </Button>
        </div>
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename workspace">
        <div className="space-y-3">
          <Input
            value={renaming?.name ?? ""}
            onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))}
            aria-label="New workspace name"
            autoFocus
          />
          <Button
            className="w-full"
            disabled={!renaming?.name.trim()}
            onClick={() => {
              if (!renaming) return;
              contractStore.renameWorkspace(renaming.id, renaming.name);
              toast.success("Workspace renamed.");
              setRenaming(null);
            }}
          >
            Save name
          </Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete workspace?">
        <p className="text-sm text-muted-foreground">
          “{deleting?.name}” and all {deleting ? countFor(deleting.id) : 0} contracts inside it will
          be permanently removed, including their files and analyses.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              if (!deleting) return;
              void contractStore.deleteWorkspace(deleting.id).then(() => {
                toast.success("Workspace deleted.");
                setDeleting(null);
              });
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
