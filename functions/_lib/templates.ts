export interface TemplateContext {
  input: unknown;
  prev_output: unknown;
  run_id: string;
  org_id: string;
  [key: string]: unknown;
}

export function getByPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, rawPath: string) => {
    const [root, ...rest] = rawPath.split(".");
    const rootValue = context[root];
    return stringify(getByPath(rootValue, rest.join(".")));
  });
}

export function renderJsonTemplate(value: unknown, context: TemplateContext): unknown {
  if (typeof value === "string") {
    const exact = value.match(/^{{\s*([\w.]+)\s*}}$/);
    if (exact) {
      const [root, ...rest] = exact[1].split(".");
      return getByPath(context[root], rest.join("."));
    }
    return renderTemplate(value, context);
  }
  if (Array.isArray(value)) return value.map((item) => renderJsonTemplate(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, renderJsonTemplate(item, context)]),
    );
  }
  return value;
}
