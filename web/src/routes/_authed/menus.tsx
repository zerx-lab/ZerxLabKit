import { ConnectError } from "@connectrpc/connect";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Can } from "@/components/can";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Menu, MenuButton } from "@/gen/zerx/v1/menu_pb";
import {
  createMenu,
  createMenuButton,
  deleteMenu,
  deleteMenuButton,
  listMenus,
  updateMenu,
} from "@/gen/zerx/v1/menu-MenuService_connectquery";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/menus")({ component: MenusPage });

function errMsg(err: unknown, fallback: string) {
  return err instanceof ConnectError ? err.message : fallback;
}

interface FlatMenu {
  menu: Menu;
  depth: number;
}

function flatten(menus: Menu[], depth = 0, out: FlatMenu[] = []): FlatMenu[] {
  for (const m of menus) {
    out.push({ menu: m, depth });
    flatten(m.children, depth + 1, out);
  }
  return out;
}

function MenusPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isPending } = useQuery(listMenus);
  const rows = flatten(data?.menus ?? []);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listMenus, cardinality: "finite" }) });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("menuPage.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("menuPage.subtitle")}</p>
        </div>
        <Can code="menu:create">
          <MenuDialog mode="create" onDone={invalidate} />
        </Can>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>{t("menuPage.title_")}</TableHead>
              <TableHead>{t("menuPage.path")}</TableHead>
              <TableHead>{t("menuPage.icon")}</TableHead>
              <TableHead>{t("common.sort")}</TableHead>
              <TableHead>{t("menuPage.hidden")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t("common.noData")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ menu, depth }) => (
                <TableRow key={String(menu.id)}>
                  <TableCell>
                    <span style={{ paddingLeft: depth * 20 }} className="font-medium">
                      {t(menu.title)}
                    </span>
                    {menu.path === "" ? (
                      <Badge variant="secondary" className="ml-2">
                        {t("nav.management")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{menu.path}</TableCell>
                  <TableCell className="font-mono text-xs">{menu.icon}</TableCell>
                  <TableCell>{menu.sort}</TableCell>
                  <TableCell>{menu.hidden ? t("common.yes") : t("common.no")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Can code="menu:update">
                        <MenuButtonsDialog menu={menu} onDone={invalidate} />
                        <MenuDialog mode="edit" menu={menu} onDone={invalidate} />
                      </Can>
                      <Can code="menu:delete">
                        <DeleteMenuDialog menu={menu} onDone={invalidate} />
                      </Can>
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

function MenuDialog({ mode, menu, onDone }: { mode: "create" | "edit"; menu?: Menu; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const createMut = useMutation(createMenu);
  const updateMut = useMutation(updateMenu);

  const [parentId, setParentId] = useState(menu ? String(menu.parentId) : "0");
  const [path, setPath] = useState(menu?.path ?? "");
  const [name, setName] = useState(menu?.name ?? "");
  const [title, setTitle] = useState(menu?.title ?? "");
  const [component, setComponent] = useState(menu?.component ?? "");
  const [icon, setIcon] = useState(menu?.icon ?? "");
  const [sort, setSort] = useState(menu?.sort ?? 0);
  const [hidden, setHidden] = useState(menu?.hidden ?? false);

  const submit = async () => {
    try {
      const base = {
        parentId: BigInt(parentId || "0"),
        path,
        name,
        title,
        component,
        icon,
        sort,
        hidden,
      };
      if (mode === "create") {
        await createMut.mutateAsync(base);
        toast.success(t("menuPage.createdToast"));
      } else if (menu) {
        await updateMut.mutateAsync({ id: menu.id, ...base });
        toast.success(t("menuPage.updatedToast"));
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
          <DialogDescription>{t("menuPage.subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("menuPage.parent")} value={parentId} onChange={setParentId} />
          <Field label={t("common.name")} value={name} onChange={setName} />
          <Field label={t("menuPage.path")} value={path} onChange={setPath} />
          <Field label={t("menuPage.title_")} value={title} onChange={setTitle} />
          <Field label={t("menuPage.component")} value={component} onChange={setComponent} />
          <Field label={t("menuPage.icon")} value={icon} onChange={setIcon} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="sort">{t("common.sort")}</Label>
            <Input id="sort" type="number" value={sort} onChange={(e) => setSort(Number(e.target.value))} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="hidden">{t("menuPage.hidden")}</Label>
            <Switch id="hidden" checked={hidden} onCheckedChange={setHidden} />
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DeleteMenuDialog({ menu, onDone }: { menu: Menu; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const mut = useMutation(deleteMenu);

  const handleDelete = async () => {
    try {
      await mut.mutateAsync({ id: menu.id });
      toast.success(t("menuPage.deletedToast"));
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
          <DialogDescription>{t(menu.title)}</DialogDescription>
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

function MenuButtonsDialog({ menu, onDone }: { menu: Menu; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const createMut = useMutation(createMenuButton);
  const deleteMut = useMutation(deleteMenuButton);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const add = async () => {
    try {
      await createMut.mutateAsync({ menuId: menu.id, code, name });
      setCode("");
      setName("");
      onDone();
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  const remove = async (b: MenuButton) => {
    try {
      await deleteMut.mutateAsync({ id: b.id });
      onDone();
    } catch (err) {
      toast.error(errMsg(err, t("register.failed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("menuPage.manageButtons")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("menuPage.manageButtonsTitle", { name: t(menu.title) })}</DialogTitle>
          <DialogDescription>{t("menuPage.buttons")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {menu.buttons.map((b) => (
            <div key={String(b.id)} className="flex items-center justify-between rounded border px-3 py-2">
              <div className="flex flex-col">
                <span className="font-mono text-xs">{b.code}</span>
                <span className="text-xs text-muted-foreground">{b.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void remove(b)}
              >
                {t("common.delete")}
              </Button>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label>{t("common.code")}</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="user:create" />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label>{t("common.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button onClick={() => void add()} disabled={createMut.isPending || !code || !name}>
              {t("menuPage.addButton")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
