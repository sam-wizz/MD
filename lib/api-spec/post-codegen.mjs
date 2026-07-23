import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const apiZod = path.join(root, "lib", "api-zod", "src", "generated", "api.ts");

// Orval 8 may emit zod.email() (Zod 4); this repo uses Zod 3.
let src = readFileSync(apiZod, "utf8");
src = src.replaceAll("zod.email()", "zod.string().email()");
writeFileSync(apiZod, src);
console.log("post-codegen: patched zod.email() → zod.string().email()");
