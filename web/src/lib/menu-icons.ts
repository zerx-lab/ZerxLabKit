import {
  BookIcon,
  CircleIcon,
  FolderIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  LogInIcon,
  type LucideIcon,
  MonitorIcon,
  PlugIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";

// iconByName maps a seed/menu icon name (the lucide component name stored on the
// menu row) to its component. Unknown names fall back to CircleIcon.
export const iconByName: Record<string, LucideIcon> = {
  LayoutDashboardIcon,
  UsersIcon,
  ShieldIcon,
  ListTreeIcon,
  PlugIcon,
  BookIcon,
  SlidersHorizontalIcon,
  FolderIcon,
  MonitorIcon,
  SettingsIcon,
  ScrollTextIcon,
  LogInIcon,
  TriangleAlertIcon,
};

export function menuIcon(name: string): LucideIcon {
  return iconByName[name] ?? CircleIcon;
}
