import {
  BookIcon,
  ClockIcon,
  CircleIcon,
  FolderIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  LogInIcon,
  type LucideIcon,
  MonitorIcon,
  PlugIcon,
  PuzzleIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  UserIcon,
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
  PuzzleIcon,
  BookIcon,
  SlidersHorizontalIcon,
  FolderIcon,
  GlobeIcon,
  MonitorIcon,
  SettingsIcon,
  ScrollTextIcon,
  LogInIcon,
  TriangleAlertIcon,
  ClockIcon,
  UserIcon,
};

export function menuIcon(name: string): LucideIcon {
  return iconByName[name] ?? CircleIcon;
}
