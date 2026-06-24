import { useCallback, useEffect, useMemo, useState } from "react";

import type { Menu } from "@/gen/zerx/v1/menu_pb";

const STORAGE_KEY = "zerx.sidebar.closed";

// getStoredClosed reads the set of collapsed group ids from localStorage. We
// persist the *closed* set (not the open set) so newly added groups default to
// expanded and stale ids for deleted groups are harmless. The `?? "[]"` guard
// avoids JSON.parse(null) -> new Set(null) throwing on first visit.
function getStoredClosed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
    return new Set(raw);
  } catch {
    return new Set<string>();
  }
}

function leafMatches(path: string, pathname: string): boolean {
  return path !== "" && (pathname === path || pathname.startsWith(path + "/"));
}

function hasActiveDescendant(node: Menu, pathname: string): boolean {
  if (leafMatches(node.path, pathname)) {
    return true;
  }
  return node.children.some((child) => hasActiveDescendant(child, pathname));
}

interface SidebarGroupsState {
  isGroupOpen: (groupId: string) => boolean;
  toggleGroup: (groupId: string) => void;
  // activeGroupId is the id of the top-level group whose subtree contains the
  // active route, used to keep that group open and to highlight its header.
  activeGroupId: string | undefined;
}

// useSidebarGroups manages per-group collapse state for the sidebar. State is
// the set of *closed* group ids, persisted to localStorage. The group holding
// the active route is always reported open (derived in the same render, so no
// useEffect race / flash).
export function useSidebarGroups(menus: Menu[], pathname: string): SidebarGroupsState {
  const [closedGroups, setClosedGroups] = useState<Set<string>>(getStoredClosed);

  const activeGroupId = useMemo(() => {
    for (const top of menus) {
      if (top.path === "" && top.children.some((child) => hasActiveDescendant(child, pathname))) {
        return String(top.id);
      }
    }
    return undefined;
  }, [menus, pathname]);

  // Persist in an effect so the state updater stays pure (avoids double writes
  // under React StrictMode).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...closedGroups]));
    } catch {
      // ignore: persistence is best-effort.
    }
  }, [closedGroups]);

  const isGroupOpen = useCallback(
    (id: string) => (id === activeGroupId ? true : !closedGroups.has(id)),
    [closedGroups, activeGroupId],
  );

  const toggleGroup = useCallback((id: string) => {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return { isGroupOpen, toggleGroup, activeGroupId };
}
