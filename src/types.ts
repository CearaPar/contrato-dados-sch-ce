export const RESOURCES = [
  "originators",
  "plants",
  "measurements",
  "units",
  "orders",
  "retirements",
  "buyers",
] as const;

export type Resource = (typeof RESOURCES)[number];

export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  resource: Resource | "-";
  where: string;
  message: string;
}

export type JsonObject = Record<string, unknown>;

export function isResource(value: string): value is Resource {
  return (RESOURCES as readonly string[]).includes(value);
}
