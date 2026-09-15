export const MODULES = [
  { key: "inventory", label: "Inventory" },
  { key: "attendance", label: "Attendance" },
  { key: "customers", label: "Customers" },
  { key: "suppliers", label: "Suppliers" },
  { key: "crm", label: "CRM" },
  { key: "delivery_challan", label: "DC Entry" },
  { key: "user_management", label: "User Management" },
  { key: "quotation", label: "Quotation" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const MODULE_KEYS = MODULES.map((module) => module.key) as ModuleKey[];
export const WORKER_MODULES = MODULES.filter((module) => module.key !== "user_management");

export function normalizeModuleAccess(rawAccess: unknown): ModuleKey[] {
  let parsed = rawAccess;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }

  const allowed = new Set<string>(MODULE_KEYS);
  const values = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.entries(parsed)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([key]) => key)
      : [];

  return Array.from(new Set(values.filter((key): key is ModuleKey => typeof key === "string" && allowed.has(key))));
}
