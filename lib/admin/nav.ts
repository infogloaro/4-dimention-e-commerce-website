import { Activity, Bell, BarChart3, Boxes, ClipboardList, CreditCard, Gauge, Image as ImageIcon, Layers, LifeBuoy, Megaphone, MessageSquareText, Package, Percent, RotateCcw, ScrollText, Settings, ShieldCheck, ShoppingCart, Star, Tags, Truck, UserCog, Users, Wallet, Warehouse, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Any one of these permissions makes the item visible. Empty = any staff member. */
  anyOf?: string[];
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Navigation is a convenience: the API enforces the same permissions on every request. */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: Gauge, anyOf: ["dashboard:read"] },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3, anyOf: ["analytics:read"] },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { label: "Products", href: "/admin/products", icon: Package, anyOf: ["product:read"] },
      { label: "Categories", href: "/admin/categories", icon: Layers, anyOf: ["product:read", "category:write"] },
      { label: "Brands", href: "/admin/brands", icon: Tags, anyOf: ["product:read", "brand:write"] },
      { label: "Collections", href: "/admin/collections", icon: ClipboardList, anyOf: ["product:read", "collection:write"] },
      { label: "Reviews", href: "/admin/reviews", icon: Star, anyOf: ["review:moderate"] },
      { label: "Product questions", href: "/admin/questions", icon: MessageSquareText, anyOf: ["review:moderate"] },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Stock levels", href: "/admin/inventory", icon: Warehouse, anyOf: ["inventory:read"] },
      { label: "Stock movements", href: "/admin/inventory/movements", icon: Boxes, anyOf: ["inventory:read"] },
    ],
  },
  {
    label: "Sales & Orders",
    items: [
      { label: "Orders", href: "/admin/orders", icon: ShoppingCart, anyOf: ["order:read"] },
      { label: "Shipments", href: "/admin/shipments", icon: Truck, anyOf: ["order:read", "shipping:manage"] },
      { label: "Returns", href: "/admin/returns", icon: RotateCcw, anyOf: ["return:manage"] },
      { label: "Refunds", href: "/admin/refunds", icon: Wallet, anyOf: ["order:refund", "order:read"] },
    ],
  },
  { label: "Customers", items: [{ label: "Customers", href: "/admin/customers", icon: Users, anyOf: ["customer:read"] }] },
  { label: "Marketing", items: [{ label: "Coupons", href: "/admin/coupons", icon: Percent, anyOf: ["coupon:read"] }] },
  {
    label: "Storefront",
    items: [
      { label: "Banners & blocks", href: "/admin/content/blocks", icon: Megaphone, anyOf: ["content:write"] },
      { label: "Homepage sections", href: "/admin/content/sections", icon: ImageIcon, anyOf: ["content:write"] },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Support tickets", href: "/admin/tickets", icon: LifeBuoy, anyOf: ["support:read"] },
      { label: "Notification log", href: "/admin/notifications", icon: Bell, anyOf: ["notification:manage"] },
    ],
  },
  { label: "Finance", items: [{ label: "Payments", href: "/admin/payments", icon: CreditCard, anyOf: ["order:read"] }] },
  {
    label: "Staff & Security",
    items: [
      { label: "Staff", href: "/admin/staff", icon: UserCog, anyOf: ["user:manage"] },
      { label: "Roles & permissions", href: "/admin/roles", icon: ShieldCheck, anyOf: ["user:manage", "role:manage"] },
      { label: "Audit logs", href: "/admin/audit", icon: ScrollText, anyOf: ["audit:read"] },
    ],
  },
  {
    label: "Configuration",
    items: [
      { label: "Store settings", href: "/admin/settings", icon: Settings, anyOf: ["settings:manage"] },
      { label: "System health", href: "/admin/system", icon: Activity, anyOf: ["settings:manage"] },
    ],
  },
];
