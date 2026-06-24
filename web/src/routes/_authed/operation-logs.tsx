import { ConnectError } from "@connectrpc/connect";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
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
import { LogType } from "@/gen/zerx/v1/log_pb";
import {
  cleanLogs,
  listOperationLogs,
} from "@/gen/zerx/v1/log-LogService_connectquery";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/_authed/operation-logs")({
  component: OperationLogsPage,
});

const PAGE_SIZE = 10;

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: listOperationLogs,
        cardinality: "finite",
      }),
    });
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof ConnectError ? err.message : fallback;
}

function OperationLogsPage() {
  const { t } = useI18n();
  const { role } = usePermissions();
  const isAdmin = role === "admin";

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");

  const { data, isPending } = useQuery(listOperationLogs, {
    page: { page, pageSize: PAGE_SIZE },
    keyword,
  });

  const logs = data?.logs ?? [];
  const total = data ? Number(data.total) : 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("logPage.operationTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("logPage.subtitle")}</p>
        </div>
        {isAdmin && <CleanDialog />}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder={t("logPage.searchPlaceholder")}
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>{t("common.id")}</TableHead>
              <TableHead>{t("logPage.procedure")}</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>{t("logPage.ip")}</TableHead>
              <TableHead>{t("logPage.latency")}</TableHead>
              <TableHead>{t("logPage.status")}</TableHead>
              <TableHead>User ID</TableHead>
              <TableHead>{t("common.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("common.noData")}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={String(log.id)}>
                  <TableCell className="font-mono text-xs">
                    {String(log.id)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-mono text-xs">
                    {log.procedure}
                  </TableCell>
                  <TableCell>{log.method}</TableCell>
                  <TableCell>{log.ip}</TableCell>
                  <TableCell>{Number(log.latencyMs)}</TableCell>
                  <TableCell>{log.status}</TableCell>
                  <TableCell>{String(log.userId)}</TableCell>
                  <TableCell>
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("common.total", { count: total })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("common.previous")}
            </Button>
            <span className="text-sm tabular-nums">
              {t("common.pageOf", { page, pages: pageCount })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.next")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CleanDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const invalidate = useInvalidate();
  const mut = useMutation(cleanLogs);

  const handleClean = async () => {
    try {
      const res = await mut.mutateAsync({ type: LogType.OPERATION, days });
      toast.success(t("logPage.cleanedToast", { count: Number(res.removed) }));
      await invalidate();
      setOpen(false);
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Trash2Icon className="size-4" />
          {t("logPage.clean")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("logPage.clean")}</DialogTitle>
          <DialogDescription>{t("logPage.subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="days">{t("logPage.cleanDays")}</Label>
          <Input
            id="days"
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={mut.isPending}
            onClick={() => void handleClean()}
          >
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
