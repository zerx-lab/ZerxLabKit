import { ConnectError } from "@connectrpc/connect";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Can } from "@/components/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Api } from "@/gen/zerx/v1/api_pb";
import { listApis } from "@/gen/zerx/v1/api-ApiService_connectquery";
import type { Menu } from "@/gen/zerx/v1/menu_pb";
import { listMenus } from "@/gen/zerx/v1/menu-MenuService_connectquery";
import type { Role } from "@/gen/zerx/v1/role_pb";
import {
  createRole,
  deleteRole,
  getRolePermissions,
  listRoles,
  setRolePermissions,
  updateRole,
} from "@/gen/zerx/v1/role-RoleService_connectquery";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/roles")({ component: RolesPage });

function errMsg(err: unknown, fallback: string) {
  return err instanceof ConnectError ? err.message : fallback;
}

function RolesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isPending } = useQuery(listRoles);
  const roles = data?.roles ?? [];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listRoles, cardinality: "finite" }) });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("rolePage.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("rolePage.subtitle")}</p>
        </div>
        <Can code="role:create">
          <RoleDialog mode="create" onDone={invalidate} />
        </Can>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>{t("common.code")}</TableHead>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.description")}</TableHead>
              <TableHead>{t("common.sort")}</TableHead>
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
            ) : (
              roles.map((r) => (
                <TableRow key={String(r.id)}>
                  <TableCell className="font-mono text-xs">
                    {r.code}
                    {r.builtin ? (
                      <Badge variant="secondary" className="ml-2">
                        {t("common.builtin")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.description}</TableCell>
                  <TableCell>{r.sort}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Can code="role:update">
                        <PermissionsDialog role={r} />
                        <RoleDialog mode="edit" role={r} onDone={invalidate} />
                      </Can>
                      {!r.builtin ? (
                        <Can code="role:delete">
                          <DeleteRoleDialog role={r} onDone={invalidate} />
                        </Can>
                      ) : null}
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

function RoleDialog({ mode, role, onDone }: { mode: "create" | "edit"; role?: Role; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const createMut = useMutation(createRole);
  const updateMut = useMutation(updateRole);

  const [code, setCode] = useState(role?.code ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [sort, setSort] = useState(role?.sort ?? 0);

  const submit = async () => {
    try {
      if (mode === "create") {
        await createMut.mutateAsync({ code, name, description, sort });
        toast.success(t("rolePage.createdToast"));
      } else if (role) {
        await updateMut.mutateAsync({ id: role.id, name, description, sort });
        toast.success(t("rolePage.updatedToast"));
      }
      onDone();
      setOpen(false);
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <PlusIcon className="size-4" />
            {t("common.add")}
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            {t("common.edit")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("common.add") : t("common.edit")}</DialogTitle>
          <DialogDescription>{t("rolePage.subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">{t("common.code")}</Label>
            <Input id="code" value={code} disabled={mode === "edit"} onChange={(e) => setCode(e.target.value)} placeholder="editor" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{t("common.name")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="desc">{t("common.description")}</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sort">{t("common.sort")}</Label>
            <Input id="sort" type="number" value={sort} onChange={(e) => setSort(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={createMut.isPending || updateMut.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({ role, onDone }: { role: Role; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const mut = useMutation(deleteRole);

  const handleDelete = async () => {
    try {
      await mut.mutateAsync({ id: role.id });
      toast.success(t("rolePage.deletedToast"));
      onDone();
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
          <DialogDescription>{role.name}</DialogDescription>
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

interface FlatMenu {
  menu: Menu;
  depth: number;
  isGroup: boolean;
}

function flattenMenus(menus: Menu[], depth = 0, out: FlatMenu[] = []): FlatMenu[] {
  for (const m of menus) {
    out.push({ menu: m, depth, isGroup: m.children.length > 0 });
    flattenMenus(m.children, depth + 1, out);
  }
  return out;
}

function PermissionsDialog({ role }: { role: Role }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("rolePage.assign")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("rolePage.assignTitle", { name: role.name })}</DialogTitle>
          <DialogDescription>{t("rolePage.permissions")}</DialogDescription>
        </DialogHeader>
        {open ? <PermissionsForm role={role} onClose={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PermissionsForm({ role, onClose }: { role: Role; onClose: () => void }) {
  const { t } = useI18n();
  const { data: perms } = useQuery(getRolePermissions, { roleCode: role.code });
  const { data: menuData } = useQuery(listMenus);
  const { data: apiData } = useQuery(listApis);
  const setMut = useMutation(setRolePermissions);

  const flatMenus = useMemo(() => flattenMenus(menuData?.menus ?? []), [menuData]);
  const apisByGroup = useMemo(() => {
    const m = new Map<string, Api[]>();
    for (const a of apiData?.apis ?? []) {
      const g = a.group || "default";
      const arr = m.get(g) ?? [];
      arr.push(a);
      m.set(g, arr);
    }
    return m;
  }, [apiData]);

  const [menuIds, setMenuIds] = useState<Set<bigint>>(new Set());
  const [buttonIds, setButtonIds] = useState<Set<bigint>>(new Set());
  const [procedures, setProcedures] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (perms) {
      setMenuIds(new Set(perms.menuIds));
      setButtonIds(new Set(perms.buttonIds));
      setProcedures(new Set(perms.procedures));
    }
  }, [perms]);

  const toggleMenu = (id: bigint) => {
    setMenuIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleButton = (id: bigint) => {
    setButtonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleProc = (p: string) => {
    setProcedures((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };
  const toggleGroup = (group: string, checked: boolean) => {
    setProcedures((prev) => {
      const next = new Set(prev);
      for (const a of apisByGroup.get(group) ?? []) {
        if (checked) next.add(a.procedure);
        else next.delete(a.procedure);
      }
      return next;
    });
  };

  const save = async () => {
    try {
      await setMut.mutateAsync({
        roleCode: role.code,
        menuIds: [...menuIds],
        procedures: [...procedures],
        buttonIds: [...buttonIds],
      });
      toast.success(t("rolePage.savedToast"));
      onClose();
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue="menus">
        <TabsList>
          <TabsTrigger value="menus">{t("rolePage.tabMenus")}</TabsTrigger>
          <TabsTrigger value="apis">{t("rolePage.tabApis")}</TabsTrigger>
          <TabsTrigger value="buttons">{t("rolePage.tabButtons")}</TabsTrigger>
        </TabsList>

        <TabsContent value="menus" className="max-h-96 overflow-y-auto">
          <div className="flex flex-col gap-1 py-2">
            {flatMenus.map(({ menu, depth, isGroup }) => (
              <label
                key={String(menu.id)}
                className={`flex items-center gap-2 rounded px-2 py-1 hover:bg-accent ${
                  isGroup ? "mt-1 first:mt-0" : ""
                }`}
                style={{ paddingLeft: depth * 24 + 8 }}
              >
                <Checkbox
                  checked={menuIds.has(menu.id)}
                  onCheckedChange={() => toggleMenu(menu.id)}
                />
                <span
                  className={
                    isGroup ? "text-sm font-semibold text-muted-foreground" : "text-sm"
                  }
                >
                  {t(menu.title)}
                </span>
              </label>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="apis" className="max-h-96 overflow-y-auto">
          <div className="flex flex-col gap-4 py-2">
            {[...apisByGroup.entries()].map(([group, groupApis]) => {
              const allChecked = groupApis.every((a) => procedures.has(a.procedure));
              return (
                <div key={group} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between border-b pb-1">
                    <span className="text-sm font-semibold">{group}</span>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={(v) => toggleGroup(group, v === true)}
                      />
                      {t("rolePage.selectAllGroup")}
                    </label>
                  </div>
                  {groupApis.map((a) => (
                    <label key={String(a.id)} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent">
                      <Checkbox
                        checked={procedures.has(a.procedure)}
                        onCheckedChange={() => toggleProc(a.procedure)}
                      />
                      <span className="font-mono text-xs">{a.method}</span>
                      <span className="text-xs text-muted-foreground">{a.description}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="buttons" className="max-h-96 overflow-y-auto">
          <div className="flex flex-col gap-4 py-2">
            {flatMenus
              .filter(({ menu }) => menu.buttons.length > 0)
              .map(({ menu }) => (
                <div key={String(menu.id)} className="flex flex-col gap-1">
                  <span className="border-b pb-1 text-sm font-semibold">{t(menu.title)}</span>
                  {menu.buttons.map((b) => (
                    <label key={String(b.id)} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent">
                      <Checkbox
                        checked={buttonIds.has(b.id)}
                        onCheckedChange={() => toggleButton(b.id)}
                      />
                      <span className="font-mono text-xs">{b.code}</span>
                      <span className="text-xs text-muted-foreground">{b.name}</span>
                    </label>
                  ))}
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button onClick={() => void save()} disabled={setMut.isPending}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </div>
  );
}
