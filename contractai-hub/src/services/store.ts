/**
 * Persistence layer for the app — hybrid Supabase Storage + per-user local storage fallback.
 *
 * When Supabase is configured (see src/lib/supabase.ts), document files upload
 * directly to Supabase Storage bucket (`contracts`), and data seamlessly mirrors
 * between local cache and cloud storage.
 *
 * When users sign in or return to the platform, their past uploaded documents and
 * workspaces are automatically loaded and made accessible.
 */
import { useSyncExternalStore } from "react";
import type {
  ChatMessage,
  Contract,
  ContractAnalysis,
  ContractStatus,
  GeneralChatMessage,
  QuickAction,
  Workspace,
} from "./types";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";
import { authService } from "./auth";

const KEYS = {
  workspaces: "encontract:workspaces",
  contracts: "encontract:contracts",
  chat: "encontract:chat",
  generalChat: "encontract:general-chat",
  pendingMeta: "encontract:pending_meta",
  pendingFileKey: "encontract:pending_file",
} as const;

const STORAGE_BUCKET = "contracts";

// --------------------------------------------------------------------------
// Local IndexedDB for PDF & Document blobs (fallback & offline caching)
// --------------------------------------------------------------------------

const DB_NAME = "encontract";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open file store"));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("File store error"));
        t.oncomplete = () => db.close();
      }),
  );
}

function putFileDb(key: string, blob: Blob): Promise<string> {
  return tx("readwrite", (s) => s.put(blob, key)).then(() => key);
}
function getFileDb(key: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>("readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>);
}
function deleteFileDb(key: string): Promise<void> {
  return tx("readwrite", (s) => s.delete(key)).then(() => undefined);
}

// --------------------------------------------------------------------------
// localStorage helpers (fallback & fast startup cache)
// --------------------------------------------------------------------------

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

const QUICK_ACTIONS: QuickAction[] = ["nda_sent", "sign_pending", "renewal_pending"];
function isQuickAction(v: string): v is QuickAction {
  return (QUICK_ACTIONS as string[]).includes(v);
}

function fireAndForget(promiseLike: unknown, actionName: string): void {
  void Promise.resolve(promiseLike)
    .then((res: unknown) => {
      if (
        res &&
        typeof res === "object" &&
        "error" in res &&
        (res as { error: { message: string } | null }).error
      ) {
        console.warn(
          `[store] Supabase ${actionName} notice:`,
          (res as { error: { message: string } }).error.message,
        );
      }
    })
    .catch(() => {});
}

// --------------------------------------------------------------------------
// The Store
// --------------------------------------------------------------------------

class LocalContractStore {
  private listeners = new Set<() => void>();
  private workspaces: Workspace[] = [];
  private contracts: Contract[] = [];
  private messages: ChatMessage[] = [];
  private generalMessages: GeneralChatMessage[] = [];
  private hydrated = false;
  private lastLoadedUid: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.hydrate();
      this.syncWithSupabase();
      authService.onAuthStateChange(() => {
        this.hydrate(true);
        this.syncWithSupabase();
        this.emit();
      });
    }
  }

  async syncWithSupabase(): Promise<void> {
    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (!client || !isSupabaseEnabled || uid === "anonymous") return;

    try {
      // 1. Sync Workspaces
      const { data: dbWorkspaces, error: wsErr } = await client
        .from("workspaces")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });

      if (!wsErr && dbWorkspaces) {
        if (dbWorkspaces.length > 0) {
          this.workspaces = dbWorkspaces.map((w: Record<string, unknown>) => ({
            id: String(w["id"]),
            name: String(w["name"]),
            createdAt: String(w["created_at"]),
          }));
        } else if (this.workspaces.length > 0) {
          for (const ws of this.workspaces) {
            await client.from("workspaces").upsert({
              id: ws.id,
              user_id: uid,
              name: ws.name,
              created_at: ws.createdAt,
            });
          }
        }
      }

      // 2. Sync Contracts
      const { data: dbContracts, error: ctErr } = await client
        .from("contracts")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (!ctErr && dbContracts) {
        if (dbContracts.length > 0) {
          this.contracts = dbContracts.map((c: Record<string, unknown>): Contract => {
            const item: Contract = {
              id: String(c["id"]),
              workspaceId: String(c["workspace_id"]),
              title: String(c["title"]),
              fileKey: String(c["file_key"]),
              size: Number(c["size"]) || 0,
              status: (c["status"] as ContractStatus) || "uploaded",
              createdAt: String(c["created_at"]),
              actions: (c["actions"] as Partial<Record<QuickAction, string>>) || {},
            };
            if (typeof c["text"] === "string" && c["text"]) {
              item.text = c["text"];
            }
            if (c["analysis"]) {
              item.analysis = c["analysis"] as ContractAnalysis;
            }
            return item;
          });
        } else if (this.contracts.length > 0) {
          for (const c of this.contracts) {
            await client.from("contracts").upsert({
              id: c.id,
              user_id: uid,
              workspace_id: c.workspaceId,
              title: c.title,
              file_key: c.fileKey,
              size: c.size,
              status: c.status,
              created_at: c.createdAt,
              text: c.text ?? null,
              analysis: c.analysis ?? null,
              actions: c.actions ?? {},
            });
          }
        }
      }

      // 3. Sync Chat Messages
      const { data: dbMessages, error: msgErr } = await client
        .from("chat_messages")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });

      if (!msgErr && dbMessages) {
        if (dbMessages.length > 0) {
          this.messages = dbMessages.map((m: Record<string, unknown>) => ({
            id: String(m["id"]),
            contractId: String(m["contract_id"]),
            role: m["role"] as ChatMessage["role"],
            content: String(m["content"]),
            createdAt: String(m["created_at"]),
          }));
        } else if (this.messages.length > 0) {
          for (const m of this.messages) {
            await client.from("chat_messages").upsert({
              id: m.id,
              user_id: uid,
              contract_id: m.contractId,
              role: m.role,
              content: m.content,
              created_at: m.createdAt,
            });
          }
        }
      }

      // 4. Sync General Chat Messages
      const { data: dbGeneral, error: gcErr } = await client
        .from("general_chat_messages")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });

      if (!gcErr && dbGeneral) {
        if (dbGeneral.length > 0) {
          this.generalMessages = dbGeneral.map((m: Record<string, unknown>) => ({
            id: String(m["id"]),
            role: m["role"] as GeneralChatMessage["role"],
            content: String(m["content"]),
            createdAt: String(m["created_at"]),
          }));
        } else if (this.generalMessages.length > 0) {
          for (const m of this.generalMessages) {
            await client.from("general_chat_messages").upsert({
              id: m.id,
              user_id: uid,
              role: m.role,
              content: m.content,
              created_at: m.createdAt,
            });
          }
        }
      }

      this.emit();
    } catch (err) {
      console.warn("[store] Supabase cloud sync notice:", err);
    }
  }

  private currentUserId(): string {
    return authService.getUser()?.id || "anonymous";
  }

  private userKey(baseKey: string): string {
    const uid = this.currentUserId();
    return uid !== "anonymous" ? `${baseKey}:${uid}` : baseKey;
  }

  private hydrate(force = false) {
    if (typeof window === "undefined") return;
    const uid = this.currentUserId();
    if (this.lastLoadedUid === uid && this.hydrated && !force) return;
    this.lastLoadedUid = uid;

    const wsKey = this.userKey(KEYS.workspaces);
    const ctKey = this.userKey(KEYS.contracts);
    const chKey = this.userKey(KEYS.chat);
    const gcKey = this.userKey(KEYS.generalChat);

    this.workspaces = readList<Workspace>(wsKey);
    if (this.workspaces.length === 0 && uid !== "anonymous") {
      this.workspaces = readList<Workspace>(KEYS.workspaces);
    }
    if (this.workspaces.length === 0) {
      const defaultWs: Workspace = {
        id: "default-workspace",
        name: "General Workspace",
        createdAt: new Date().toISOString(),
      };
      this.workspaces = [defaultWs];
    }

    this.contracts = readList<Contract>(ctKey);
    if (this.contracts.length === 0 && uid !== "anonymous") {
      this.contracts = readList<Contract>(KEYS.contracts);
    }

    this.messages = readList<ChatMessage>(chKey);
    if (this.messages.length === 0 && uid !== "anonymous") {
      this.messages = readList<ChatMessage>(KEYS.chat);
    }

    this.generalMessages = readList<GeneralChatMessage>(gcKey);
    if (this.generalMessages.length === 0 && uid !== "anonymous") {
      this.generalMessages = readList<GeneralChatMessage>(KEYS.generalChat);
    }

    this.hydrated = true;
    this.persist();
  }

  private persist() {
    if (typeof window === "undefined") return;
    const wsKey = this.userKey(KEYS.workspaces);
    const ctKey = this.userKey(KEYS.contracts);
    const chKey = this.userKey(KEYS.chat);
    const gcKey = this.userKey(KEYS.generalChat);

    localStorage.setItem(wsKey, JSON.stringify(this.workspaces));
    localStorage.setItem(ctKey, JSON.stringify(this.contracts));
    localStorage.setItem(chKey, JSON.stringify(this.messages));
    localStorage.setItem(gcKey, JSON.stringify(this.generalMessages));
  }

  private emit() {
    this.persist();
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void) => {
    this.hydrate();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // ---------- Snapshots ----------

  getWorkspaces = (): Workspace[] => {
    this.hydrate();
    return this.workspaces;
  };
  getContracts = (): Contract[] => {
    this.hydrate();
    return this.contracts;
  };
  getMessages = (): ChatMessage[] => {
    this.hydrate();
    return this.messages;
  };
  getGeneralMessages = (): GeneralChatMessage[] => {
    this.hydrate();
    return this.generalMessages;
  };
  getServerSnapshotWorkspaces = (): Workspace[] => [];
  getServerSnapshotContracts = (): Contract[] => [];
  getServerSnapshotMessages = (): ChatMessage[] => [];
  getServerSnapshotGeneralMessages = (): GeneralChatMessage[] => [];

  // ---------- File storage (Supabase Storage + IndexedDB fallback) ----------

  async putFile(key: string, blob: Blob): Promise<string> {
    const client = getSupabaseClient();
    const uid = this.currentUserId();

    // 1. Upload to Supabase Storage bucket
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      try {
        const filePath = `${uid}/${key}`;
        const contentType =
          blob.type ||
          (key.endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : key.endsWith(".png")
              ? "image/png"
              : key.endsWith(".jpg") || key.endsWith(".jpeg")
                ? "image/jpeg"
                : "application/pdf");

        const { error } = await client.storage.from(STORAGE_BUCKET).upload(filePath, blob, {
          contentType,
          upsert: true,
        });
        if (error) {
          console.warn("[store] Supabase storage upload notice:", error.message);
          // Fallback to IndexedDB cache
          await putFileDb(key, blob).catch(() => {});
        }
      } catch (err) {
        console.warn("[store] Supabase storage upload notice:", err);
        await putFileDb(key, blob).catch(() => {});
      }
    } else {
      await putFileDb(key, blob).catch(() => {});
    }

    return key;
  }

  async getFile(key: string): Promise<Blob | undefined> {
    const client = getSupabaseClient();
    const uid = this.currentUserId();

    // 1. Prioritize Supabase Storage download so user files come from Supabase
    if (client && isSupabaseEnabled && key && uid !== "anonymous") {
      try {
        const filePath = `${uid}/${key}`;
        const { data, error } = await client.storage.from(STORAGE_BUCKET).download(filePath);
        if (!error && data) {
          return data;
        }
      } catch (err) {
        console.warn("[store] Supabase storage download notice:", err);
      }
    }

    // 2. Fall back to local IndexedDB
    const localBlob = await getFileDb(key);
    if (localBlob) return localBlob;

    return undefined;
  }

  async getFileUrl(key: string): Promise<string | undefined> {
    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && key) {
      try {
        const filePath = `${uid}/${key}`;
        const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        if (data?.publicUrl) {
          return data.publicUrl;
        }
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  async deleteFile(key: string): Promise<void> {
    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && key) {
      try {
        const filePath = `${uid}/${key}`;
        await client.storage.from(STORAGE_BUCKET).remove([filePath]);
      } catch {
        /* continue clearing local mirror */
      }
    }
    return deleteFileDb(key);
  }

  // ---------- Staging Pending Uploads (Hero drag & drop before sign-in) ----------

  async stashPendingFile(file: File): Promise<void> {
    if (typeof window === "undefined") return;
    const key = `pending_${Date.now()}`;
    await putFileDb(key, file);
    localStorage.setItem(
      KEYS.pendingMeta,
      JSON.stringify({ key, name: file.name, size: file.size }),
    );
  }

  getPendingMeta(): { name: string; size: number } | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(KEYS.pendingMeta);
      if (!raw) return null;
      const data = JSON.parse(raw) as { key: string; name: string; size: number };
      return { name: data.name, size: data.size };
    } catch {
      return null;
    }
  }

  async takePendingFile(): Promise<{ file: Blob; name: string } | null> {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(KEYS.pendingMeta);
      if (!raw) return null;
      const data = JSON.parse(raw) as { key: string; name: string; size: number };
      const blob = await getFileDb(data.key);
      localStorage.removeItem(KEYS.pendingMeta);
      if (blob) {
        await deleteFileDb(data.key).catch(() => {});
        return { file: blob, name: data.name };
      }
      return null;
    } catch {
      return null;
    }
  }

  // ---------- Workspaces ----------

  addWorkspace(name: string): Workspace {
    const id = crypto.randomUUID();
    const ws: Workspace = {
      id,
      name: name.trim() || "Untitled workspace",
      createdAt: new Date().toISOString(),
    };
    this.hydrate();
    this.workspaces = [...this.workspaces, ws];
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("workspaces").insert({
          id: ws.id,
          user_id: uid,
          name: ws.name,
          created_at: ws.createdAt,
        }),
        "insert workspace",
      );
    }

    return ws;
  }

  createWorkspace(name: string): Workspace {
    return this.addWorkspace(name);
  }

  renameWorkspace(id: string, name: string): void {
    this.hydrate();
    const cleanName = name.trim() || "Untitled workspace";
    this.workspaces = this.workspaces.map((w) =>
      w.id === id ? { ...w, name: cleanName } : w,
    );
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("workspaces").update({ name: cleanName }).eq("id", id).eq("user_id", uid),
        "rename workspace",
      );
    }
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.hydrate();
    const contracts = this.contracts.filter((c) => c.workspaceId === id);
    this.workspaces = this.workspaces.filter((w) => w.id !== id);
    this.contracts = this.contracts.filter((c) => c.workspaceId !== id);
    const contractIds = new Set(contracts.map((c) => c.id));
    this.messages = this.messages.filter((m) => !contractIds.has(m.contractId));
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("workspaces").delete().eq("id", id).eq("user_id", uid),
        "delete workspace",
      );
    }

    for (const ct of contracts) {
      try {
        await this.deleteFile(ct.fileKey);
      } catch {
        /* ignore */
      }
    }
  }

  // ---------- Contracts / Documents ----------

  async addContract(input: {
    workspaceId: string;
    file: Blob | File;
    title: string;
  }): Promise<Contract> {
    this.hydrate();
    const id = crypto.randomUUID();
    const originalExt =
      (input.file instanceof File ? input.file.name.split(".").pop() : "") ||
      (input.file.type.includes("pdf")
        ? "pdf"
        : input.file.type.includes("word") || input.file.type.includes("officedocument")
          ? "docx"
          : input.file.type.includes("image")
            ? "png"
            : "pdf");
    const cleanExt = (originalExt || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
    const fileKey = `contract_${id}.${cleanExt}`;
    await this.putFile(fileKey, input.file);

    const now = new Date().toISOString();
    const contract: Contract = {
      id,
      workspaceId: input.workspaceId,
      title: input.title.trim() || "Untitled document",
      fileKey,
      size: input.file.size,
      status: "uploaded",
      createdAt: now,
      actions: {},
    };
    this.contracts = [contract, ...this.contracts];
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("contracts").insert({
          id: contract.id,
          user_id: uid,
          workspace_id: contract.workspaceId,
          title: contract.title,
          file_key: contract.fileKey,
          size: contract.size,
          status: contract.status,
          created_at: contract.createdAt,
          actions: {},
        }),
        "insert contract",
      );
    }

    return contract;
  }

  renameContract(id: string, title: string): void {
    this.hydrate();
    const cleanTitle = title.trim() || "Untitled document";
    this.contracts = this.contracts.map((c) =>
      c.id === id ? { ...c, title: cleanTitle } : c,
    );
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("contracts").update({ title: cleanTitle }).eq("id", id).eq("user_id", uid),
        "rename contract",
      );
    }
  }

  setContractText(id: string, text: string): void {
    this.hydrate();
    this.contracts = this.contracts.map((c) => (c.id === id ? { ...c, text } : c));
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("contracts").update({ text }).eq("id", id).eq("user_id", uid),
        "update contract text",
      );
    }
  }

  setContractAnalysis(id: string, analysis: ContractAnalysis): void {
    this.hydrate();
    this.contracts = this.contracts.map((c) =>
      c.id === id
        ? {
            ...c,
            analysis,
            status: "analyzed",
          }
        : c,
    );
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client
          .from("contracts")
          .update({ analysis, status: "analyzed" })
          .eq("id", id)
          .eq("user_id", uid),
        "update contract analysis",
      );
    }
  }

  setContractStatus(id: string, status: ContractStatus): void {
    this.hydrate();
    this.contracts = this.contracts.map((c) => (c.id === id ? { ...c, status } : c));
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("contracts").update({ status }).eq("id", id).eq("user_id", uid),
        "update contract status",
      );
    }
  }

  markContractAction(id: string, action: QuickAction, at: string = new Date().toISOString()): void {
    if (!isQuickAction(action)) return;
    this.hydrate();
    let updatedActions: Record<string, string> = {};
    this.contracts = this.contracts.map((c) => {
      if (c.id === id) {
        updatedActions = { ...c.actions, [action]: at };
        return { ...c, actions: updatedActions };
      }
      return c;
    });
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("contracts").update({ actions: updatedActions }).eq("id", id).eq("user_id", uid),
        "mark contract action",
      );
    }
  }

  markAction(id: string, action: QuickAction, at?: string): void {
    this.markContractAction(id, action, at);
  }

  async getContractFile(id: string): Promise<Blob | undefined> {
    this.hydrate();
    const contract = this.contracts.find((c) => c.id === id);
    if (!contract) return undefined;
    return this.getFile(contract.fileKey);
  }

  async deleteContract(id: string): Promise<void> {
    this.hydrate();
    const target = this.contracts.find((c) => c.id === id);
    this.contracts = this.contracts.filter((c) => c.id !== id);
    this.messages = this.messages.filter((m) => m.contractId !== id);
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("contracts").delete().eq("id", id).eq("user_id", uid),
        "delete contract",
      );
    }

    if (target) {
      await this.deleteFile(target.fileKey).catch(() => {});
    }
  }

  async removeContract(id: string): Promise<void> {
    return this.deleteContract(id);
  }

  // ---------- Chat (per contract) ----------

  addMessage(contractId: string, role: ChatMessage["role"], content: string): ChatMessage {
    this.hydrate();
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      contractId,
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    this.messages = [...this.messages, msg];
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("chat_messages").insert({
          id: msg.id,
          user_id: uid,
          contract_id: contractId,
          role,
          content,
          created_at: msg.createdAt,
        }),
        "add chat message",
      );
    }

    return msg;
  }

  updateMessage(id: string, patch: Partial<Pick<ChatMessage, "content">>): void {
    this.hydrate();
    this.messages = this.messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous" && patch.content) {
      fireAndForget(
        client.from("chat_messages").update({ content: patch.content }).eq("id", id).eq("user_id", uid),
        "update chat message",
      );
    }
  }

  clearMessages(contractId: string): void {
    this.hydrate();
    this.messages = this.messages.filter((m) => m.contractId !== contractId);
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("chat_messages").delete().eq("contract_id", contractId).eq("user_id", uid),
        "clear chat messages",
      );
    }
  }

  // ---------- General chat ----------

  addGeneralMessage(role: GeneralChatMessage["role"], content: string): GeneralChatMessage {
    this.hydrate();
    const msg: GeneralChatMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    this.generalMessages = [...this.generalMessages, msg];
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("general_chat_messages").insert({
          id: msg.id,
          user_id: uid,
          role,
          content,
          created_at: msg.createdAt,
        }),
        "add general chat message",
      );
    }

    return msg;
  }

  updateGeneralMessage(id: string, patch: Partial<Pick<GeneralChatMessage, "content">>): void {
    this.hydrate();
    this.generalMessages = this.generalMessages.map((m) => (m.id === id ? { ...m, ...patch } : m));
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous" && patch.content) {
      fireAndForget(
        client.from("general_chat_messages").update({ content: patch.content }).eq("id", id).eq("user_id", uid),
        "update general chat message",
      );
    }
  }

  clearGeneralMessages(): void {
    this.hydrate();
    this.generalMessages = [];
    this.emit();

    const client = getSupabaseClient();
    const uid = this.currentUserId();
    if (client && isSupabaseEnabled && uid !== "anonymous") {
      fireAndForget(
        client.from("general_chat_messages").delete().eq("user_id", uid),
        "clear general chat messages",
      );
    }
  }
}

export const contractStore = new LocalContractStore();

const EMPTY_WORKSPACES: Workspace[] = [];
const EMPTY_CONTRACTS: Contract[] = [];
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_GENERAL_MESSAGES: GeneralChatMessage[] = [];

export function useWorkspaces(): Workspace[] {
  return useSyncExternalStore(
    contractStore.subscribe,
    contractStore.getWorkspaces,
    () => EMPTY_WORKSPACES,
  );
}

export function useContracts(): Contract[] {
  return useSyncExternalStore(
    contractStore.subscribe,
    contractStore.getContracts,
    () => EMPTY_CONTRACTS,
  );
}

export function useChatMessages(): ChatMessage[] {
  return useSyncExternalStore(
    contractStore.subscribe,
    contractStore.getMessages,
    () => EMPTY_MESSAGES,
  );
}

export function useGeneralChatMessages(): GeneralChatMessage[] {
  return useSyncExternalStore(
    contractStore.subscribe,
    contractStore.getGeneralMessages,
    () => EMPTY_GENERAL_MESSAGES,
  );
}

// --------------------------------------------------------------------------
// db.ts compat — exports for services & UI
// --------------------------------------------------------------------------

export function putFile(key: string, blob: Blob): Promise<string> {
  return contractStore.putFile(key, blob);
}
export function getFile(key: string): Promise<Blob | undefined> {
  return contractStore.getFile(key);
}
export function deleteFile(key: string): Promise<void> {
  return contractStore.deleteFile(key);
}
export function getFileUrl(key: string): Promise<string | undefined> {
  return contractStore.getFileUrl(key);
}
