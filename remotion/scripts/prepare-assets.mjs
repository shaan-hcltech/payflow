import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const publicDir = path.join(root, "remotion", "public");
const source = path.join(root, "demo-output", "payflow-recovery-agent-detailed-demo.mp4");
const target = path.join(publicDir, "payflow-app-walkthrough.mp4");

if (!existsSync(source)) {
  throw new Error(`Missing app recording at ${source}. Run npm run record:demo:detailed first.`);
}

mkdirSync(publicDir, { recursive: true });
copyFileSync(source, target);
console.log(`Prepared Remotion asset: ${target}`);
