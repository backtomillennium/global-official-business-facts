(() => {
  "use strict";

  const STORAGE_KEY = "gobf-jurisdiction-review-v1";
  const SCHEMA = "gobf-jurisdiction-review-v1";
  const rows = Array.from(document.querySelectorAll(".jurisdiction-row"));
  const progress = document.getElementById("review-progress");
  const status = document.getElementById("save-status");
  const exportButton = document.getElementById("export-json");
  const importButton = document.getElementById("import-json");
  const importFile = document.getElementById("import-file");

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveState(message = "Saved in this browser.") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      status.textContent = message;
    } catch {
      status.textContent = "Could not save locally. Export JSON now.";
    }
  }

  function rowSeed(row) {
    return {
      country: row.dataset.country || "",
      iso2: row.dataset.iso2 || null,
      iso3: row.dataset.iso3 || "",
      officialUrl: row.dataset.officialUrl || "",
      urlSource: row.dataset.urlSource || null,
      queryFormat: row.dataset.initialFormat || "",
      formatSource: row.dataset.formatSource || null,
      lookupAvailable: row.dataset.lookupAvailable === "true",
    };
  }

  function normalizedEntry(row) {
    const seed = rowSeed(row);
    const saved = state[seed.iso3] || {};
    return {
      ...seed,
      confirmedSearchable: saved.confirmedSearchable === true,
      hasIssue: saved.hasIssue === true,
      queryFormat: typeof saved.queryFormat === "string" ? saved.queryFormat : seed.queryFormat,
      formatSource: saved.formatSource === "manual" ? "manual" : seed.formatSource,
    };
  }

  function renderRow(row) {
    const item = normalizedEntry(row);
    const searchable = row.querySelector(".js-searchable");
    const issue = row.querySelector(".js-issue");
    const format = row.querySelector(".js-format");
    searchable.checked = item.confirmedSearchable;
    issue.checked = item.hasIssue;
    format.value = item.queryFormat;
    row.classList.toggle("is-reviewed", item.confirmedSearchable || item.hasIssue);
    row.classList.toggle("has-issue", item.hasIssue);
  }

  function renderAll() {
    rows.forEach(renderRow);
    updateProgress();
  }

  function updateProgress() {
    const reviewed = rows.reduce((count, row) => {
      const item = normalizedEntry(row);
      return count + ((item.confirmedSearchable || item.hasIssue) ? 1 : 0);
    }, 0);
    progress.textContent = `Reviewed ${reviewed} / ${rows.length}`;
  }

  function patchRow(row, patch) {
    const iso3 = row.dataset.iso3;
    const previous = state[iso3] && typeof state[iso3] === "object" ? state[iso3] : {};
    state[iso3] = { ...previous, ...patch };
    saveState();
    renderRow(row);
    updateProgress();
  }

  rows.forEach((row) => {
    row.querySelector(".js-searchable").addEventListener("change", (event) => {
      patchRow(row, { confirmedSearchable: event.currentTarget.checked });
    });
    row.querySelector(".js-issue").addEventListener("change", (event) => {
      patchRow(row, { hasIssue: event.currentTarget.checked });
    });
    row.querySelector(".js-format").addEventListener("input", (event) => {
      patchRow(row, { queryFormat: event.currentTarget.value, formatSource: "manual" });
    });
  });

  function exportPayload() {
    return {
      schemaVersion: SCHEMA,
      exportedAt: new Date().toISOString(),
      jurisdictions: rows.map((row) => {
        const item = normalizedEntry(row);
        return {
          country: item.country,
          iso2: item.iso2,
          iso3: item.iso3,
          officialUrl: item.officialUrl,
          confirmedSearchable: item.confirmedSearchable,
          hasIssue: item.hasIssue,
          queryFormat: item.queryFormat,
          formatSource: item.formatSource,
        };
      }),
    };
  }

  exportButton.addEventListener("click", () => {
    const payload = exportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gobf-jurisdictions-reviewed.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "Exported gobf-jurisdictions-reviewed.json.";
  });

  importButton.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.schemaVersion !== SCHEMA || !Array.isArray(parsed.jurisdictions)) {
        throw new Error("Wrong schema");
      }
      const known = new Set(rows.map((row) => row.dataset.iso3));
      for (const item of parsed.jurisdictions) {
        const iso3 = String(item?.iso3 ?? "").toUpperCase();
        if (!known.has(iso3)) continue;
        state[iso3] = {
          confirmedSearchable: item.confirmedSearchable === true,
          hasIssue: item.hasIssue === true,
          queryFormat: typeof item.queryFormat === "string" ? item.queryFormat : "",
          formatSource: item.formatSource === "manual" ? "manual" : null,
        };
      }
      saveState("Imported and saved in this browser.");
      renderAll();
    } catch {
      status.textContent = "Import failed: expected gobf-jurisdiction-review-v1 JSON.";
    }
  });

  renderAll();
})();
