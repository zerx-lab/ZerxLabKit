import { ConnectError } from "@connectrpc/connect";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileIcon, LayoutGridIcon, ListIcon, SearchIcon, Trash2Icon, UploadIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { File as ZerxFile } from "@/gen/zerx/v1/file_pb";
import {
  deleteFile,
  listFiles,
} from "@/gen/zerx/v1/file-FileService_connectquery";
import { useI18n } from "@/lib/i18n";
import { authedFetch } from "@/lib/transport";

export const Route = createFileRoute("/_authed/files")({ component: FilesPage });

const PAGE_SIZE = 12;
const TEXT_PREVIEW_LIMIT = 1024 * 1024; // 1 MB cap for text preview

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      queryKey: createConnectQueryKey({ schema: listFiles, cardinality: "finite" }),
    });
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof ConnectError ? err.message : fallback;
}

function formatSize(bytes: bigint): string {
  const n = Number(bytes);
  if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
  return n + " B";
}

function isImage(ct: string): boolean {
  return ct.startsWith("image/");
}

// Text-previewable if MIME says text/*, or a known structured-text subtype.
function isText(ct: string): boolean {
  if (ct.startsWith("text/")) return true;
  return [
    "application/json",
    "application/xml",
    "application/javascript",
    "application/x-yaml",
    "application/yaml",
  ].includes(ct.split(";")[0]?.trim() ?? "");
}

function canPreview(ct: string): boolean {
  return isImage(ct) || isText(ct);
}

type View = "list" | "gallery";

function FilesPage() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [view, setView] = useState<View>("list");
  const [preview, setPreview] = useState<ZerxFile | null>(null);

  const { data, isPending } = useQuery(listFiles, {
    page: { page, pageSize: PAGE_SIZE },
    keyword,
  });
  const files = data?.files ?? [];
  const total = data ? Number(data.total) : 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invalidate = useInvalidate();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const applySearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setKeyword(keywordInput.trim());
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authedFetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        toast.success(t("filePage.uploadedToast"));
        await invalidate();
      } else {
        const text = await res.text().catch(() => "");
        toast.error(text || t("register.failed"));
      }
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("filePage.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("filePage.subtitle")}</p>
        </div>
        <Button disabled={uploading} onClick={() => inputRef.current?.click()}>
          <UploadIcon className="size-4" />
          {uploading ? t("filePage.uploading") : t("filePage.upload")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => void handleUpload(e)}
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <form className="flex items-center gap-2" onSubmit={applySearch}>
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("filePage.searchPlaceholder")}
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              {t("common.search")}
            </Button>
          </form>
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="list" aria-label={t("filePage.viewList")} title={t("filePage.viewList")}>
                <ListIcon className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="gallery" aria-label={t("filePage.viewGallery")} title={t("filePage.viewGallery")}>
                <LayoutGridIcon className="size-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {view === "list" ? (
          <ListView
            files={files}
            isPending={isPending}
            t={t}
            onPreview={setPreview}
          />
        ) : (
          <GalleryView
            files={files}
            isPending={isPending}
            t={t}
            onPreview={setPreview}
          />
        )}

        <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">{t("common.total", { count: total })}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("common.previous")}
            </Button>
            <span className="text-sm tabular-nums">
              {t("common.pageOf", { page, pages: pageCount })}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              {t("common.next")}
            </Button>
          </div>
        </div>
      </Card>

      <PreviewDialog file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

type TranslateFn = ReturnType<typeof useI18n>["t"];

function ActionButtons({
  file,
  t,
  onPreview,
}: {
  file: ZerxFile;
  t: TranslateFn;
  onPreview: (f: ZerxFile) => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      {canPreview(file.contentType) && (
        <Button variant="ghost" size="sm" onClick={() => onPreview(file)}>
          {t("filePage.preview")}
        </Button>
      )}
      <Button variant="ghost" size="sm" asChild>
        <a href={file.url} target="_blank" rel="noopener noreferrer">
          {t("filePage.open")}
        </a>
      </Button>
      <DeleteFileDialog file={file} />
    </div>
  );
}

function ListView({
  files,
  isPending,
  t,
  onPreview,
}: {
  files: ZerxFile[];
  isPending: boolean;
  t: TranslateFn;
  onPreview: (f: ZerxFile) => void;
}) {
  return (
    <Table>
      <TableHeader className="bg-muted">
        <TableRow>
          <TableHead>{t("common.name")}</TableHead>
          <TableHead>{t("filePage.size")}</TableHead>
          <TableHead>{t("filePage.contentType")}</TableHead>
          <TableHead>{t("common.created")}</TableHead>
          <TableHead className="text-right">{t("common.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableRow>
            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
              {t("common.loading")}
            </TableCell>
          </TableRow>
        ) : files.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
              {t("common.noData")}
            </TableCell>
          </TableRow>
        ) : (
          files.map((f) => (
            <TableRow key={String(f.id)}>
              <TableCell className="max-w-xs truncate font-medium">{f.name}</TableCell>
              <TableCell className="text-muted-foreground">{formatSize(f.size)}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{f.contentType}</TableCell>
              <TableCell className="text-muted-foreground">
                {f.createdAt ? new Date(f.createdAt).toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-right">
                <ActionButtons file={f} t={t} onPreview={onPreview} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function GalleryView({
  files,
  isPending,
  t,
  onPreview,
}: {
  files: ZerxFile[];
  isPending: boolean;
  t: TranslateFn;
  onPreview: (f: ZerxFile) => void;
}) {
  if (isPending) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  }
  if (files.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{t("common.noData")}</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {files.map((f) => {
        const previewable = canPreview(f.contentType);
        return (
          <div key={String(f.id)} className="group flex flex-col overflow-hidden rounded-lg border">
            <button
              type="button"
              disabled={!previewable}
              onClick={() => previewable && onPreview(f)}
              className="flex aspect-square items-center justify-center bg-muted/40 transition-colors enabled:hover:bg-muted disabled:cursor-default"
            >
              {isImage(f.contentType) ? (
                <img
                  src={f.url}
                  alt={f.name}
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <FileIcon className="size-10 text-muted-foreground" />
              )}
            </button>
            <div className="flex items-center justify-between gap-1 border-t px-2 py-1.5">
              <span className="truncate text-xs font-medium" title={f.name}>
                {f.name}
              </span>
              <DeleteFileDialog file={f} compact />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PreviewDialog({ file, onClose }: { file: ZerxFile | null; onClose: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [textState, setTextState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!file || !isText(file.contentType)) {
      setText(null);
      setTextState("idle");
      return;
    }
    let cancelled = false;
    setTextState("loading");
    setText(null);
    (async () => {
      try {
        // Only attach our auth token for same-origin URLs (local driver serves
        // relative paths). S3/presigned URLs are cross-origin — fetch without
        // credentials so the bearer token is never leaked to a third party.
        const sameOrigin = new URL(file.url, window.location.origin).origin === window.location.origin;
        const res = sameOrigin ? await authedFetch(file.url) : await fetch(file.url);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        const slice = blob.slice(0, TEXT_PREVIEW_LIMIT);
        const content = await slice.text();
        if (!cancelled) {
          setText(content);
          setTextState("idle");
        }
      } catch {
        if (!cancelled) setTextState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  return (
    <Dialog open={file !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{file?.name}</DialogTitle>
          <DialogDescription>{file ? formatSize(file.size) : ""}</DialogDescription>
        </DialogHeader>
        <div className="overflow-auto">
          {file && isImage(file.contentType) && (
            <img
              src={file.url}
              alt={t("filePage.previewImageAlt")}
              className="mx-auto max-h-[60vh] max-w-full rounded-md object-contain"
            />
          )}
          {file && isText(file.contentType) && (
            <>
              {textState === "loading" && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("filePage.previewTextLoading")}
                </p>
              )}
              {textState === "error" && (
                <p className="py-8 text-center text-sm text-destructive">
                  {t("filePage.previewLoadFailed")}
                </p>
              )}
              {textState === "idle" && text !== null && (
                <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 font-mono text-xs whitespace-pre-wrap break-words">
                  {text}
                </pre>
              )}
            </>
          )}
          {file && !canPreview(file.contentType) && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("filePage.previewUnavailable")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={file?.url} target="_blank" rel="noopener noreferrer">
              {t("filePage.open")}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteFileDialog({ file, compact }: { file: ZerxFile; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidate();
  const mut = useMutation(deleteFile);

  const handleDelete = async () => {
    try {
      await mut.mutateAsync({ id: file.id });
      toast.success(t("filePage.deletedToast"));
      await invalidate();
      setOpen(false);
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={
            compact
              ? "size-6 shrink-0 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              : "text-destructive hover:bg-destructive/10 hover:text-destructive"
          }
        >
          {compact ? <Trash2Icon className="size-3.5" /> : t("common.delete")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("common.delete")}</DialogTitle>
          <DialogDescription>{file.name}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" disabled={mut.isPending} onClick={() => void handleDelete()}>
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
