import { ConnectError } from "@connectrpc/connect";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCwIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { Can } from "@/components/can";
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
import type { Api } from "@/gen/zerx/v1/api_pb";
import {
  deleteApi,
  listApis,
  syncApis,
  updateApi,
} from "@/gen/zerx/v1/api-ApiService_connectquery";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/apis")({ component: ApisPage });

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      queryKey: createConnectQueryKey({ schema: listApis, cardinality: "finite" }),
    });
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof ConnectError ? err.message : fallback;
}

function ApisPage() {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const { data, isPending } = useQuery(listApis, {});
  const apis = data?.apis ?? [];
  const syncMut = useMutation(syncApis);

  const handleSync = async () => {
    try {
      const res = await syncMut.mutateAsync({});
      toast.success(
        t("apiPage.syncedToast", { added: Number(res.added), removed: Number(res.removed) }),
      );
      await invalidate();
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  // Group apis by group name, preserving insertion order
  const grouped = apis.reduce<Record<string, Api[]>>((acc, api) => {
    const g = api.group || "—";
    (acc[g] ??= []).push(api);
    return acc;
  }, {});

  const groupNames = Object.keys(grouped);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("apiPage.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("apiPage.subtitle")}</p>
        </div>
        <Can code="api:update">
          <Button onClick={() => void handleSync()} disabled={syncMut.isPending}>
            <RefreshCwIcon className="size-4" />
            {t("apiPage.sync")}
          </Button>
        </Can>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>{t("apiPage.procedure")}</TableHead>
              <TableHead>{t("apiPage.method")}</TableHead>
              <TableHead>{t("apiPage.group")}</TableHead>
              <TableHead>{t("common.description")}</TableHead>
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
            ) : apis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {t("common.noData")}
                </TableCell>
              </TableRow>
            ) : (
              groupNames.map((groupName) => (
                <Fragment key={groupName}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell
                      colSpan={5}
                      className="py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                    >
                      {groupName}
                    </TableCell>
                  </TableRow>
                  {(grouped[groupName] ?? []).map((api) => (
                    <TableRow key={String(api.id)}>
                      <TableCell className="font-mono text-xs">{api.procedure}</TableCell>
                      <TableCell className="text-xs">{api.method}</TableCell>
                      <TableCell className="text-xs">{api.group || "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {api.description}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Can code="api:update">
                            <EditApiDialog api={api} />
                          </Can>
                          <Can code="api:delete">
                            <DeleteApiDialog api={api} />
                          </Can>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function EditApiDialog({ api }: { api: Api }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidate();
  const mut = useMutation(updateApi);

  const [description, setDescription] = useState(api.description);
  const [group, setGroup] = useState(api.group);

  const handleOpen = (next: boolean) => {
    if (next) {
      setDescription(api.description);
      setGroup(api.group);
    }
    setOpen(next);
  };

  const submit = async () => {
    try {
      await mut.mutateAsync({ id: api.id, description, group });
      toast.success(t("apiPage.updatedToast"));
      await invalidate();
      setOpen(false);
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("common.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("common.edit")}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{api.procedure}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-group">{t("apiPage.group")}</Label>
            <Input
              id="api-group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-description">{t("common.description")}</Label>
            <Input
              id="api-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={mut.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteApiDialog({ api }: { api: Api }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidate();
  const mut = useMutation(deleteApi);

  const handleDelete = async () => {
    try {
      await mut.mutateAsync({ id: api.id });
      toast.success(t("apiPage.deletedToast"));
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
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {t("common.delete")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("common.delete")}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{api.procedure}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={mut.isPending}
            onClick={() => void handleDelete()}
          >
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
