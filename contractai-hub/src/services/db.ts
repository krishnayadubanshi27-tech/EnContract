/**
 * Blob store for uploaded PDF files.
 *
 * This module delegates to {@link contractStore} which implements the
 * hybrid storage strategy:
 *   - If Supabase is configured and reachable → Supabase Storage bucket (`contracts`)
 *   - Otherwise → browser IndexedDB (local offline fallback)
 *
 * See `src/lib/supabase.ts` for configuration and
 * `src/services/store.ts` (`ContractStore.putFile/getFile/deleteFile`) for the implementation.
 */
export { deleteFile, getFile, getFileUrl, putFile } from "./store";
