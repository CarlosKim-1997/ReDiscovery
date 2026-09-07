import path from "node:path";

const allowedLayers = {
  domain: ["domain", "shared"],
  ports: ["ports", "domain", "shared"],
  application: ["application", "domain", "ports", "shared"],
  shared: ["shared"],
  adapters: ["adapters", "domain", "ports", "shared"],
  config: ["config"],
  server: ["server", "adapters", "application", "ports", "config", "shared"],
  app: ["app", "application", "ports", "server", "shared"],
};
const coreLayers = new Set(["domain", "application", "ports", "shared"]);
const vendor = /^(?:@supabase\/|openai(?:\/|$)|@openai\/|@upstash\/|cloudflare(?:\/|$)|@cloudflare\/|@sentry\/)/;

export default {
  rules: {
    boundaries: {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          boundary: "Forbidden dependency from {{from}} to {{to}}. Depend on an inward layer or a port.",
          vendor: "Vendor SDKs belong only in src/adapters/.",
          external: "Core layers may only import local inward layers or zod, never runtime/framework SDKs.",
          dynamic: "Use a literal module path so architecture boundaries can be checked.",
        },
      },
      create(context) {
        const filename = context.filename.replaceAll("\\", "/");
        const root = `${context.cwd.replaceAll("\\", "/")}/src/`;
        if (!filename.startsWith(root)) return {};
        const from = filename.slice(root.length).split("/")[0];

        function check(node, source) {
          if (typeof source !== "string") {
            context.report({ node, messageId: "dynamic" });
            return;
          }
          if (vendor.test(source) && from !== "adapters") {
            context.report({ node, messageId: "vendor" });
            return;
          }
          const resolved = source.startsWith("@/")
            ? path.posix.normalize(root + source.slice(2))
            : source.startsWith(".")
              ? path.posix.normalize(path.posix.join(path.posix.dirname(filename), source))
              : null;
          if (resolved) {
            const to = resolved.startsWith(root) ? resolved.slice(root.length).split("/")[0] : "outside-src";
            if (!allowedLayers[from]?.includes(to)) {
              context.report({ node, messageId: "boundary", data: { from, to } });
            }
          } else if (coreLayers.has(from) && source !== "zod") {
            context.report({ node, messageId: "external" });
          }
        }

        return {
          ImportDeclaration: (node) => check(node, node.source.value),
          ExportNamedDeclaration: (node) => { if (node.source) check(node, node.source.value); },
          ExportAllDeclaration: (node) => check(node, node.source.value),
          ImportExpression: (node) => check(node, node.source.value),
          TSImportType: (node) => check(node, (node.source ?? node.argument)?.value),
          TSImportEqualsDeclaration: (node) => check(node, node.moduleReference.expression?.value),
          CallExpression: (node) => {
            if (node.callee.type === "Identifier" && node.callee.name === "require") {
              check(node, node.arguments[0]?.value);
            }
          },
        };
      },
    },
  },
};
