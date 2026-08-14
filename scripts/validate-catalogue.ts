import { loadCatalogueFiles, validateCatalogue } from "./catalogue-utils";

const data = await loadCatalogueFiles();
const errors = validateCatalogue(data);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Catalogue valid: ${data.jurisdictions.length} jurisdictions, ${data.adapters.length} adapters.`);
