import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type OpenApiDocument = {
  openapi: string;
  paths: Record<string, Record<string, {
    operationId?: string;
    requestBody?: unknown;
    responses?: Record<string, { description?: string; $ref?: string }>;
    security?: unknown[];
  }>>;
  components: {
    schemas: Record<string, unknown>;
    responses: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
  security?: unknown[];
};

const contractPath = resolve(process.cwd(), "../../docs/api/openapi.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as OpenApiDocument;
const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

function resolveReference(reference: string): unknown {
  if (!reference.startsWith("#/")) return undefined;
  return reference.slice(2).split("/").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part.replaceAll("~1", "/").replaceAll("~0", "~")];
  }, contract);
}

function references(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(references);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.$ref === "string" ? [record.$ref] : []),
    ...Object.values(record).flatMap(references)
  ];
}

describe("machine-readable Portal API contract", () => {
  it("covers every stable backend path and no unknown path", () => {
    expect(Object.keys(contract.paths).sort()).toEqual([
      "/api/assistant",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/health",
      "/api/inventory",
      "/api/journal",
      "/api/media/{id}",
      "/api/pregnancy",
      "/api/pregnancy/health",
      "/api/procurement",
      "/api/tasks"
    ]);
  });

  it("uses OAS 3.0, unique operation IDs and resolvable local references", () => {
    expect(contract.openapi).toBe("3.0.3");
    const operationIds: string[] = [];
    for (const operations of Object.values(contract.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        if (!methods.has(method)) continue;
        expect(operation.operationId).toMatch(/^[a-z][A-Za-z0-9]+$/);
        operationIds.push(operation.operationId!);
        if (["get", "delete", "head"].includes(method)) expect(operation.requestBody).toBeUndefined();
        for (const response of Object.values(operation.responses ?? {})) {
          if (response.$ref) expect(resolveReference(response.$ref)).toBeDefined();
          else expect(response.description).toBeTruthy();
        }
      }
    }
    expect(new Set(operationIds).size).toBe(operationIds.length);
    for (const reference of references(contract)) expect(resolveReference(reference)).toBeDefined();
  });

  it("keeps only login and content-free health public", () => {
    expect(contract.security).toEqual([{ FamilySession: [] }]);
    expect(contract.paths["/api/auth/login"].post.security).toEqual([]);
    expect(contract.paths["/api/health"].get.security).toEqual([]);
    expect(contract.paths["/api/media/{id}"].get.responses?.["401"]).toBeDefined();
  });
});
