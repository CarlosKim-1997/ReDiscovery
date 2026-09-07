import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

// Check the Node used by project scripts, which can differ from pnpm's own Node.
const baseline = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const [minimumMajor, minimumMinor, minimumPatch] = baseline.split(".").map(Number);
const supportedRange = `>=${baseline} <${minimumMajor + 1}`;

if (metadata.engines.node !== supportedRange) {
  process.stderr.write("Runtime configuration mismatch: align package.json engines.node with .node-version.\n");
  process.exit(1);
}

const [major, minor, patch] = process.versions.node.split(".").map(Number);
const supported = !process.versions.node.includes("-")
  && major === minimumMajor
  && (minor > minimumMinor || (minor === minimumMinor && patch >= minimumPatch));

if (!supported) {
  process.stderr.write(
    `Unsupported Node.js ${process.versions.node}; required ${supportedRange}.\n`
    + `Install and activate Node.js ${baseline} from .node-version in this shell, then retry.\n`
    + `Current executable: ${process.execPath}\n`,
  );
  process.exit(1);
}
