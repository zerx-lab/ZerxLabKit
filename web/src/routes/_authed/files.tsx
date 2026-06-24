import { ConnectError } from "@connectrpc/connect";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { File as ZerxFile } from "@/gen/zerx/v1/file_pb";
import {
  deleteFile,
  listFiles,
} from "@/gen/zerx/v1/file-FileService_connectquery";
import { useI18n } from "@/lib/i18n";
import { authedFetch } from "@/lib/transport";

export const Route = createFileRoute("/_authed/files")({ component: FilesPage });

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

function FilesPage() {
  const { t } = useI18n();
  const { data, isPending } = useQuery(listFiles, { page: { page: 1, pageSize: 100 }, keyword: "" });
  const files = data?.files ?? [];
  const invalidate = useInvalidate();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      // reset so the same file can be re-uploaded if needed
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

      <Card className="overflow-hidden py-0">
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
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={f.url} target="_blank" rel="noopener noreferrer">
                          {t("filePage.open")}
                        </a>
                      </Button>
                      <DeleteFileDialog file={f} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function DeleteFileDialog({ file }: { file: ZerxFile }) {
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
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          {t("common.delete")}
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
