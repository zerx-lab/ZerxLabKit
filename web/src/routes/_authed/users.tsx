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
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { User } from "@/gen/zerx/v1/user_pb";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
} from "@/gen/zerx/v1/user-UserService_connectquery";
import { firstErrorMessage } from "@/lib/form";

const PAGE_SIZE = 10;
const roleEnum = z.enum(["admin", "user"]);

const createUserSchema = z.object({
  email: z.email("Enter a valid email"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: roleEnum,
});

const updateUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: roleEnum,
});

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
  const error = firstErrorMessage(field.state.meta.errors);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field.name}>Role</Label>
      <select
        id={field.name}
        className="border-input h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
      >
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

const columnHelper = createColumnHelper<User>();

const columns = [
  columnHelper.accessor("id", {
    header: "ID",
    cell: (info) => String(info.getValue()),
  }),
  columnHelper.accessor("email", { header: "Email" }),
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("role", {
    header: "Role",
    cell: (info) => (
      <Badge variant={info.getValue() === "admin" ? "default" : "secondary"}>
        {info.getValue()}
      </Badge>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: (info) => <UserRowActions user={info.row.original} />,
  }),
];

function UsersPage() {
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

  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const applySearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setKeyword(keywordInput.trim());
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <CreateUserDialog />
      </div>

      <form className="flex gap-2" onSubmit={applySearch}>
        <Input
          placeholder="Search by name…"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {keyword && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setKeyword("");
              setKeywordInput("");
              setPage(1);
            }}
          >
            Clear
          </Button>
        )}
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
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
                  <TableCell colSpan={columns.length} className="text-muted-foreground text-center">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-muted-foreground text-center">
                    No users found.
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
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{total} total</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidateUsers();
  const mutation = useMutation(createUser);

  const form = useForm({
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: "user" as "admin" | "user",
    },
    validators: { onChange: createUserSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
        toast.success("User created");
        await invalidate();
        form.reset();
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof ConnectError ? err.message : "Failed to create user");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>Create a new account.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="email">
            {(field) => <TextField field={field} label="Email" type="email" />}
          </form.Field>
          <form.Field name="name">{(field) => <TextField field={field} label="Name" />}</form.Field>
          <form.Field name="password">
            {(field) => (
              <TextField field={field} label="Password" type="password" autoComplete="new-password" />
            )}
          </form.Field>
          <form.Field name="role">{(field) => <RoleField field={field} />}</form.Field>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              Create
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
      <EditUserDialog user={user} />
      <DeleteUserDialog user={user} />
    </div>
  );
}

function EditUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidateUsers();
  const mutation = useMutation(updateUser);

  const form = useForm({
    defaultValues: {
      name: user.name,
      role: user.role === "admin" ? "admin" : "user",
    },
    validators: { onChange: updateUserSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync({ id: user.id, name: value.name, role: value.role });
        toast.success("User updated");
        await invalidate();
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof ConnectError ? err.message : "Failed to update user");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">{(field) => <TextField field={field} label="Name" />}</form.Field>
          <form.Field name="role">{(field) => <RoleField field={field} />}</form.Field>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidateUsers();
  const mutation = useMutation(deleteUser);

  const handleDelete = async () => {
    try {
      await mutation.mutateAsync({ id: user.id });
      toast.success("User deleted");
      await invalidate();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ConnectError ? err.message : "Failed to delete user");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
          <DialogDescription>
            Permanently remove {user.email}? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => void handleDelete()}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
