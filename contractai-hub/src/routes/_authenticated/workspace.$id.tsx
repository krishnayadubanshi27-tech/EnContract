import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, Files, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Badge, Button, Card, EmptyState, Input, Modal } from "@/components/ui";
import { UploadDropzone, validatePdf } from "@/components/UploadDropzone";
import { formatBytes, formatDate } from "@/lib/format";
import { contractStore, useContracts, useWorkspaces } from "@/services/store";
import { QUICK_ACTION_LABELS, type QuickAction } from "@/services/types";

export const Route = createFileRoute("/_authenticated/workspace/$id")({
  head: () => ({
    meta: [
      { title: "Workspace — EnContract" },
      {
        name: "description",
        content: "Manage the contracts in this EnContract workspace: add, rename, or remove PDFs.",
      },
      { property: "og:title", content: "Workspace — EnContract" },
      {
        property: "og:description",
        content: "Manage the contracts in this EnContract workspace: add, rename, or remove PDFs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const workspaces = useWorkspaces();
  const contracts = useContracts();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const workspace = workspaces.find((w) => w.id === id);
  const wsContracts = contracts
    .filter((c) => c.workspaceId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!workspace) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h1 className="font-display text-2xl font-bold text-foreground">Workspace not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been deleted, or it belongs to a different browser session.
          </p>
          <Link to="/dashboard" className="mt-6 inline-block">
            <Button variant="outline">
              <ArrowLeft className="size-4" />
              Back to workspaces
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const handleFile = async (file: File) => {
    const error = validatePdf(file);
    if (error) {
      toast.error(error);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const contract = await contractStore.addContract({
        workspaceId: id,
        file,
        title: file.name.replace(/\.[^/.]+$/, ""),
      });
      toast.success(`Added “${contract.title}” — starting analysis.`);
      setUploadOpen(false);
      navigate({ to: "/contract/$id", params: { id: contract.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the contract.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All workspaces
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              {workspace.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {wsContracts.length} {wsContracts.length === 1 ? "contract" : "contracts"} · created{" "}
              {formatDate(workspace.createdAt)}
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <FileText className="size-4" />
            Add contract
          </Button>
        </div>

        <div className="mt-8">
          {wsContracts.length === 0 ? (
            <EmptyState
              icon={<Files className="size-6" />}
              title="No documents in this workspace"
              description="Upload your first Word (.docx), PDF, or PNG/Image document — EnContract will extract the text, analyze risk with Ollama AI, and generate graphs automatically."
              action={
                <Button onClick={() => setUploadOpen(true)}>
                  <FileText className="size-4" />
                  Add a document
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {wsContracts.map((c) => {
                const actions = Object.keys(c.actions) as QuickAction[];
                const ext = c.fileKey.split(".").pop()?.toUpperCase() || "DOC";
                return (
                  <Card
                    key={c.id}
                    className="group flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary ring-1 ring-border">
                          <FileText className="size-5" />
                        </span>
                        <Badge tone="neutral" className="text-[10px] font-bold">
                          {ext}
                        </Badge>
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          aria-label={`Rename ${c.title}`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          onClick={() => setRenaming({ id: c.id, title: c.title })}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          aria-label={`Remove ${c.title}`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-risk/15 hover:text-risk"
                          onClick={() => setDeleting({ id: c.id, title: c.title })}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <Link
                      to="/contract/$id"
                      params={{ id: c.id }}
                      className="mt-4 line-clamp-2 font-display text-base font-semibold text-foreground hover:text-primary"
                    >
                      {c.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(c.size)} · added {formatDate(c.createdAt)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.status === "analyzed" && <Badge tone="positive">Analyzed</Badge>}
                      {c.status === "analyzing" && <Badge>Analyzing…</Badge>}
                      {c.status === "analysis_failed" && <Badge tone="risk">Analysis failed</Badge>}
                      {actions.map((a) => (
                        <Badge key={a} tone="neutral">
                          {QUICK_ACTION_LABELS[a]}
                        </Badge>
                      ))}
                    </div>

                    <Link to="/contract/$id" params={{ id: c.id }} className="mt-4">
                      <Button variant="outline" className="w-full">
                        Open analysis
                      </Button>
                    </Link>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Add a contract" wide>
        <UploadDropzone compact onFile={(f) => void handleFile(f)} />
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename contract">
        <div className="space-y-3">
          <Input
            value={renaming?.title ?? ""}
            onChange={(e) => setRenaming((r) => (r ? { ...r, title: e.target.value } : r))}
            aria-label="New contract title"
            autoFocus
          />
          <Button
            className="w-full"
            disabled={!renaming?.title.trim()}
            onClick={() => {
              if (!renaming) return;
              contractStore.renameContract(renaming.id, renaming.title);
              toast.success("Contract renamed.");
              setRenaming(null);
            }}
          >
            Save title
          </Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Remove contract?">
        <p className="text-sm text-muted-foreground">
          “{deleting?.title}”, its file, analysis, and chat history will be permanently removed from
          this workspace.
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
              void contractStore.removeContract(deleting.id).then(() => {
                toast.success("Contract removed.");
                setDeleting(null);
              });
            }}
          >
            <Trash2 className="size-4" />
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}
