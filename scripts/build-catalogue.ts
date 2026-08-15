import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCatalogueFiles, validateCatalogue } from "./catalogue-utils";

const root = path.resolve(import.meta.dirname, "..");
const data = await loadCatalogueFiles();
const errors = validateCatalogue(data);
if (errors.length) throw new Error(`Catalogue invalid:\n${errors.join("\n")}`);

await mkdir(path.join(root, "src", "generated"), { recursive: true });
await writeFile(
  path.join(root, "src", "generated", "catalogue.generated.ts"),
  `import type { CompiledCatalogue } from "../catalogue/types";\n\nexport const compiledCatalogue: CompiledCatalogue = ${JSON.stringify(data, null, 2)};\n`,
);
console.log(`Compiled catalogue with ${data.jurisdictions.length} jurisdictions.`);
