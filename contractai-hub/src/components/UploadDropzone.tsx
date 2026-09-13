import { useCallback, useRef, useState, type DragEvent } from "react";
import { FileUp, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".md",
];

export function validateDocument(file: File): string | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  const isSupported =
    SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext)) ||
    type.startsWith("image/") ||
    type.includes("pdf") ||
    type.includes("word") ||
    type.includes("officedocument") ||
    type.startsWith("text/");

  if (!isSupported) {
    return "Unsupported file format. Please upload Word (.docx), PDF, PNG/Image, or Text files.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "File is too large — maximum limit is 20 MB.";
  }
  if (file.size === 0) {
    return "This file is empty.";
  }
  return null;
}

// Backwards compatibility alias
export const validatePdf = validateDocument;

export function UploadDropzone({
  onFile,
  compact,
  className,
}: {
  onFile: (file: File) => void;
  compact?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const error = validateDocument(file);
      if (error) {
        toast.error(error);
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Select a Word, PDF, or PNG document to upload"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "group cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200",
        "border-input hover:border-primary/60 hover:bg-primary/5",
        dragging && "border-primary bg-primary/10 scale-[1.01]",
        compact ? "p-5" : "p-10 sm:p-14",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className={cn(
            "grid place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25 transition-transform duration-200 group-hover:scale-105",
            compact ? "size-10" : "size-16",
          )}
        >
          <FileUp className={compact ? "size-5" : "size-8"} strokeWidth={1.8} />
        </div>
        <div>
          <p
            className={cn(
              "font-display font-semibold text-foreground",
              compact ? "text-sm" : "text-xl",
            )}
          >
            Select a Document
          </p>
          <p className={cn("mt-1 text-muted-foreground", compact ? "text-xs" : "text-sm")}>
            Drag &amp; drop your Word (.docx), PDF, or PNG/Image file here, or click to browse (up
            to 20 MB)
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground/80">
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-2 py-0.5 font-medium">
              <FileText className="size-3 text-primary" /> Word (.docx)
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-2 py-0.5 font-medium">
              <FileText className="size-3 text-primary" /> PDF
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-2 py-0.5 font-medium">
              <ImageIcon className="size-3 text-primary" /> PNG / JPG
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
