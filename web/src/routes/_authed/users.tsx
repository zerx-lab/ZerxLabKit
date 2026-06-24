import { ConnectError } from "@connectrpc/connect";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { PlusIcon, SearchIcon } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { User } from "@/gen/zerx/v1/user_pb";
import { listRoles } from "@/gen/zerx/v1/role-RoleService_connectquery";
import {
  createUser,
  deleteUser,
  listUsers,
  resetPassword,
  updateUser,
} from "@/gen/zerx/v1/user-UserService_connectquery";
import { Can } from "@/components/can";
import { Switch } from "@/components/ui/switch";
import { firstErrorMessage } from "@/lib/form";
import { useI18n, type TranslateFn } from "@/lib/i18n";

const PAGE_SIZE = 10;
const codeSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const Route = createFileRoute("/_authed/users")({ component: UsersPage });

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({ schema: listUsers, cardinality: "finite" }),
    });
}

function TextField({
  field,
  label,
  type = "text",
  autoComplete,
}: {
  field: AnyFieldApi;
  label: string;
  type?: string;
  autoComplete?: string;
}) {
  const error = firstErrorMessage(field.state.meta.errors);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field.name}>{label}</Label>
      <Input
        id={field.name}
        type={type}
        autoComplete={autoComplete}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

function RoleField({ field }: { field: AnyFieldApi }) {
  const { t } = useI18n();
  const error = firstErrorMessage(field.state.meta.errors);
  const { data } = useQuery(listRoles);
  const roles = data?.roles ?? [];
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field.name}>{t("common.role")}</Label>
      <Select value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
        <SelectTrigger id={field.name} className="w-full" onBlur={field.handleBlur}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roles.map((r) => (
            <SelectItem key={r.code} value={r.code}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

const columnHelper = createColumnHelper<User>();

function UsersPage() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");

  const { data, isPending } = useQuery(listUsers, {
    page: { page, pageSize: PAGE_SIZE },
    keyword,
  });

  const users = data?.users ?? [];
  const total = data ? Number(data.total) : 0;
  const pageCount = keyword ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: rolesData } = useQuery(listRoles);
  const roleNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rolesData?.roles ?? []) {
      m.set(r.code, r.name);
    }
    return m;
  }, [rolesData]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("id", {
        header: t("common.id"),
        cell: (info) => String(info.getValue()),
      }),
      columnHelper.accessor("email", { header: t("common.email") }),
      columnHelper.accessor("name", { header: t("common.name") }),
      columnHelper.accessor("role", {
        header: t("common.role"),
        cell: (info) => (
          <Badge variant={info.getValue() === "admin" ? "default" : "secondary"}>
            {roleNames.get(info.getValue()) ?? info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("status", {
        header: t("common.status"),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "secondary"}>
            {info.getValue() ? t("common.enabled") : t("common.disabled")}
          </Badge>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: t("common.created"),
        cell: (info) => new Date(info.getValue()).toLocaleString(),
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: (info) => <UserRowActions user={info.row.original} />,
      }),
    ],
    [t, roleNames],
  );

  const table = useReactTable({ data: users, columns, getCoreRowModel: getCoreRowModel() });

  const applySearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setKeyword(keywordInput.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("users.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("users.subtitle")}</p>
        </div>
        <Can code="user:create">
          <CreateUserDialog />
        </Can>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b px-4 py-3">
          <form className="flex items-center gap-2" onSubmit={applySearch}>
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("users.searchPlaceholder")}
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
                  {t("users.noUsers")}
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
          <p className="text-sm text-muted-foreground">{t("users.total", { count: total })}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("users.previous")}
            </Button>
            <span className="text-sm tabular-nums">{t("users.pageOf", { page, pages: pageCount })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("users.next")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function createUserSchema(t: TranslateFn) {
  return z.object({
    email: z.email(t("validation.email")),
    name: z.string().min(1, t("validation.nameRequired")),
    password: z.string().min(8, t("validation.passwordMin")),
    role: codeSchema,
    nickname: z.string(),
    phone: z.string(),
  });
}

function CreateUserDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidateUsers();
  const mutation = useMutation(createUser);

  const form = useForm({
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: "user",
      nickname: "",
      phone: "",
    },
    validators: { onChange: createUserSchema(t) },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
        toast.success(t("users.createdToast"));
        await invalidate();
        form.reset();
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof ConnectError ? err.message : t("register.failed"));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="size-4" />
          {t("users.add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.addTitle")}</DialogTitle>
          <DialogDescription>{t("users.addDesc")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="email">
            {(field) => <TextField field={field} label={t("common.email")} type="email" />}
          </form.Field>
          <form.Field name="name">
            {(field) => <TextField field={field} label={t("common.name")} />}
          </form.Field>
          <form.Field name="nickname">
            {(field) => <TextField field={field} label={t("common.nickname")} />}
          </form.Field>
          <form.Field name="phone">
            {(field) => <TextField field={field} label={t("common.phone")} />}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <TextField
                field={field}
                label={t("common.password")}
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.Field>
          <form.Field name="role">{(field) => <RoleField field={field} />}</form.Field>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserRowActions({ user }: { user: User }) {
  return (
    <div className="flex justify-end gap-2">
      <Can code="user:update">
        <EditUserDialog user={user} />
      </Can>
      <Can code="user:reset">
        <ResetPasswordDialog user={user} />
      </Can>
      <Can code="user:delete">
        <DeleteUserDialog user={user} />
      </Can>
    </div>
  );
}

function EditUserDialog({ user }: { user: User }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidateUsers();
  const mutation = useMutation(updateUser);

  const form = useForm({
    defaultValues: {
      name: user.name,
      role: user.role,
      nickname: user.nickname,
      phone: user.phone,
      status: user.status,
    },
    validators: {
      onChange: z.object({
        name: z.string().min(1, t("validation.nameRequired")),
        role: codeSchema,
        nickname: z.string(),
        phone: z.string(),
        status: z.boolean(),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync({
          id: user.id,
          name: value.name,
          role: value.role,
          nickname: value.nickname,
          phone: value.phone,
          status: value.status,
        });
        toast.success(t("users.updatedToast"));
        await invalidate();
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof ConnectError ? err.message : t("register.failed"));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("common.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.editTitle")}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => <TextField field={field} label={t("common.name")} />}
          </form.Field>
          <form.Field name="nickname">
            {(field) => <TextField field={field} label={t("common.nickname")} />}
          </form.Field>
          <form.Field name="phone">
            {(field) => <TextField field={field} label={t("common.phone")} />}
          </form.Field>
          <form.Field name="role">{(field) => <RoleField field={field} />}</form.Field>
          <form.Field name="status">
            {(field) => (
              <div className="flex items-center justify-between">
                <Label htmlFor={field.name}>{t("common.status")}</Label>
                <Switch
                  id={field.name}
                  checked={field.state.value}
                  onCheckedChange={(v) => field.handleChange(v)}
                />
              </div>
            )}
          </form.Field>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ user }: { user: User }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidateUsers();
  const mutation = useMutation(deleteUser);

  const handleDelete = async () => {
    try {
      await mutation.mutateAsync({ id: user.id });
      toast.success(t("users.deletedToast"));
      await invalidate();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ConnectError ? err.message : t("register.failed"));
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
          <DialogTitle>{t("users.deleteTitle")}</DialogTitle>
          <DialogDescription>{t("users.deleteDesc", { email: user.email })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => void handleDelete()}>
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user }: { user: User }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const mutation = useMutation(resetPassword);

  const handleReset = async () => {
    try {
      await mutation.mutateAsync({ id: user.id, password });
      toast.success(t("users.resetToast"));
      setPassword("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ConnectError ? err.message : t("register.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("users.reset")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.resetTitle")}</DialogTitle>
          <DialogDescription>{t("users.resetDesc", { email: user.email })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="newpw">{t("users.newPassword")}</Label>
          <Input
            id="newpw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={mutation.isPending || password.length < 8} onClick={() => void handleReset()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
