import { ConnectError } from "@connectrpc/connect";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { SearchIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { cleanLogs, listLoginLogs } from "@/gen/zerx/v1/log-LogService_connectquery";
import { type LoginLog, LogType } from "@/gen/zerx/v1/log_pb";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/_authed/login-logs")({ component: LoginLogsPage });

const PAGE_SIZE = 10;

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      queryKey: createConnectQueryKey({ schema: listLoginLogs, cardinality: "finite" }),
    });
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof ConnectError ? err.message : fallback;
}

const columnHelper = createColumnHelper<LoginLog>();

function LoginLogsPage() {
  const { t } = useI18n();
  const { role } = usePermissions();
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");

  const { data, isPending } = useQuery(listLoginLogs, {
    page: { page, pageSize: PAGE_SIZE },
    keyword,
  });

  const logs = data?.logs ?? [];
  const total = data ? Number(data.total) : 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns = useMemo(
    () => [
      columnHelper.accessor("id", {
        header: t("common.id"),
        cell: (info) => <span className="font-mono text-xs">{String(info.getValue())}</span>,
      }),
      columnHelper.accessor("email", { header: t("common.email") }),
      columnHelper.accessor("ip", { header: t("logPage.ip") }),
      columnHelper.accessor("userAgent", {
        header: "User-Agent",
        cell: (info) => (
          <span
            className="block max-w-[200px] truncate text-xs text-muted-foreground"
            title={info.getValue()}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("success", {
        header: t("logPage.status"),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "destructive"}>
            {info.getValue() ? t("logPage.success") : t("logPage.failure")}
          </Badge>
        ),
      }),
      columnHelper.accessor("error", {
        header: t("logPage.error"),
        cell: (info) =>
          info.getValue() ? (
            <span className="block max-w-xs truncate text-xs text-muted-foreground">
              {info.getValue()}
            </span>
          ) : null,
      }),
      columnHelper.accessor("createdAt", {
        header: t("common.created"),
        cell: (info) => new Date(info.getValue()).toLocaleString(),
      }),
    ],
    [t],
  );

  const table = useReactTable({ data: logs, columns, getCoreRowModel: getCoreRowModel() });

  const applySearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setKeyword(keywordInput.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("logPage.loginTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("logPage.subtitle")}</p>
        </div>
        {role === "admin" && <CleanLogsDialog />}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b px-4 py-3">
          <form className="flex items-center gap-2" onSubmit={applySearch}>
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("logPage.searchPlaceholder")}
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              {t("common.search")}
            </Button>
          </form>
        </div>

        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {t("common.noData")}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">{t("common.total", { count: total })}</p>
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

function CleanLogsDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("30");
  const invalidate = useInvalidate();
  const mut = useMutation(cleanLogs);

  const handleClean = async () => {
    try {
      const result = await mut.mutateAsync({ type: LogType.LOGIN, days: Number(days) });
      toast.success(t("logPage.cleanedToast", { count: Number(result.removed) }));
      await invalidate();
      setOpen(false);
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
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
          <Label htmlFor="clean-days">{t("logPage.cleanDays")}</Label>
          <Input
            id="clean-days"
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
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
            {t("logPage.clean")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
