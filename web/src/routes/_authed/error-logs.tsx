import { ConnectError } from "@connectrpc/connect";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { TrashIcon } from "lucide-react";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cleanLogs, listErrorLogs } from "@/gen/zerx/v1/log-LogService_connectquery";
import { LogType } from "@/gen/zerx/v1/log_pb";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/_authed/error-logs")({ component: ErrorLogsPage });

const PAGE_SIZE = 10;

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      queryKey: createConnectQueryKey({ schema: listErrorLogs, cardinality: "finite" }),
    });
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof ConnectError ? err.message : fallback;
}

function ErrorLogsPage() {
  const { t } = useI18n();
  const { role } = usePermissions();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isPending } = useQuery(listErrorLogs, {
    page: { page, pageSize: PAGE_SIZE },
    keyword,
  });

  const logs = data?.logs ?? [];
  const total = Number(data?.total ?? 0n);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("logPage.errorTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("logPage.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder={t("logPage.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-56"
          />
          <Button variant="outline" onClick={handleSearch}>
            {t("common.search")}
          </Button>
          {role === "admin" && <CleanLogsDialog />}
        </div>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-20">{t("common.id")}</TableHead>
              <TableHead>{t("logPage.procedure")}</TableHead>
              <TableHead className="w-24">{t("logPage.status")}</TableHead>
              <TableHead className="w-32">{t("logPage.ip")}</TableHead>
              <TableHead>{t("logPage.error")}</TableHead>
              <TableHead className="w-24">User ID</TableHead>
              <TableHead className="w-40">{t("common.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t("common.noData")}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={String(log.id)}>
                  <TableCell className="font-mono text-xs">{String(log.id)}</TableCell>
                  <TableCell className="max-w-xs truncate font-mono text-xs">{log.procedure}</TableCell>
                  <TableCell>
                    <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                      {log.status}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.ip}</TableCell>
                  <TableCell className="max-w-xs">
                    {log.error ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block max-w-xs cursor-default truncate text-sm text-destructive">
                            {log.error}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm break-words">
                          <p>{log.error}</p>
                          {log.stack && (
                            <pre className="mt-1 whitespace-pre-wrap text-xs opacity-80">
                              {log.stack.length > 600 ? log.stack.slice(0, 600) + "…" : log.stack}
                            </pre>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{String(log.userId)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("common.total", { count: total })}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("common.previous")}
          </Button>
          <span>{t("common.pageOf", { page, pages: totalPages })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CleanLogsDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const invalidate = useInvalidate();
  const mut = useMutation(cleanLogs);

  const handleClean = async () => {
    try {
      const result = await mut.mutateAsync({ type: LogType.OPERATION, days });
      toast.success(t("logPage.cleanedToast", { count: String(result.removed) }));
      await invalidate();
      setOpen(false);
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <TrashIcon className="size-4" />
          {t("logPage.clean")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("logPage.clean")}</DialogTitle>
          <DialogDescription>{t("logPage.errorTitle")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="clean-days">{t("logPage.cleanDays")}</Label>
            <Input
              id="clean-days"
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" disabled={mut.isPending} onClick={() => void handleClean()}>
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
