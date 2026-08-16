(() => {
  "use strict";

  const STORAGE_KEY = "gobf-jurisdiction-review-v1";
  const directory = document.getElementById("directory");
  const progress = document.getElementById("progress");
  const saveStatus = document.getElementById("save-status");
  const exportButton = document.getElementById("export-button");
  const importButton = document.getElementById("import-button");
  const importFile = document.getElementById("import-file");

  let baseData = [];
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveStatus.textContent = "Saved in this browser.";
    updateProgress();
  }

  function reviewFor(item) {
    const saved = state[item.iso3] || {};
    return {
      confirmedSearchable: saved.confirmedSearchable === true,
      hasIssue: saved.hasIssue === true,
      queryFormat: typeof saved.queryFormat === "string" ? saved.queryFormat : item.queryFormat,
      formatSource:
        typeof saved.formatSource === "string"
          ? saved.formatSource
          : item.formatSource
    };
  }

  function setReview(iso3, patch) {
    state[iso3] = { ...(state[iso3] || {}), ...patch };
    saveState();
  }

  function updateProgress() {
    const reviewed = baseData.reduce((count, item) => {
      const r = reviewFor(item);
      return count + ((r.confirmedSearchable || r.hasIssue) ? 1 : 0);
    }, 0);
    progress.textContent = `Reviewed ${reviewed} / ${baseData.length}`;
  }

  function createRow(item) {
    const review = reviewFor(item);

    const article = document.createElement("article");
    article.className = "row";
    article.dataset.iso3 = item.iso3;
    if (review.confirmedSearchable) article.classList.add("searchable");
    if (review.hasIssue) article.classList.add("issue");

    const reviewBox = document.createElement("div");
    reviewBox.className = "review";

    const searchableLabel = document.createElement("label");
    const searchable = document.createElement("input");
    searchable.type = "checkbox";
    searchable.checked = review.confirmedSearchable;
    searchable.addEventListener("change", () => {
      setReview(item.iso3, { confirmedSearchable: searchable.checked });
      article.classList.toggle("searchable", searchable.checked);
    });
    searchableLabel.append(searchable, document.createTextNode("確認可查"));

    const issueLabel = document.createElement("label");
    const issue = document.createElement("input");
    issue.type = "checkbox";
    issue.checked = review.hasIssue;
    issue.addEventListener("change", () => {
      setReview(item.iso3, { hasIssue: issue.checked });
      article.classList.toggle("issue", issue.checked);
    });
    issueLabel.append(issue, document.createTextNode("有狀況"));

    reviewBox.append(searchableLabel, issueLabel);

    const country = document.createElement("div");
    country.className = "country";
    const name = document.createElement("h2");
    name.className = "country-name";
    name.textContent = item.country;
    const codes = document.createElement("div");
    codes.className = "codes";
    codes.textContent = [item.iso2, item.iso3].filter(Boolean).join(" / ");
    country.append(name, codes);

    const format = document.createElement("div");
    format.className = "format";
    const formatLabel = document.createElement("label");
    formatLabel.textContent = "查詢格式";
    formatLabel.htmlFor = `format-${item.iso3}`;
    const formatInput = document.createElement("input");
    formatInput.id = `format-${item.iso3}`;
    formatInput.type = "text";
    formatInput.autocomplete = "off";
    formatInput.spellcheck = false;
    formatInput.value = review.queryFormat || "";
    formatInput.placeholder = "尚未確認";
    formatInput.addEventListener("input", () => {
      const value = formatInput.value;
      const formatSource =
        value === item.queryFormat ? item.formatSource : "manual";
      setReview(item.iso3, { queryFormat: value, formatSource });
    });
    format.append(formatLabel, formatInput);

    const link = document.createElement("div");
    link.className = "link";
    if (item.officialUrl) {
      const a = document.createElement("a");
      a.href = item.officialUrl;
      a.target = "_blank";
      a.rel = "external noreferrer";
      a.textContent = "Open official registry ↗";
      link.append(a);
    } else {
      const span = document.createElement("span");
      span.className = "no-url";
      span.textContent = "No official URL in current data";
      link.append(span);
    }

    article.append(reviewBox, country, format, link);
    return article;
  }

  function render() {
    directory.replaceChildren();
    for (const item of baseData) {
      directory.append(createRow(item));
    }
    updateProgress();
  }

  function exportedData() {
    return {
      schemaVersion: "gobf-jurisdiction-review-v1",
      exportedAt: new Date().toISOString(),
      jurisdictions: baseData.map(item => {
        const r = reviewFor(item);
        return {
          country: item.country,
          iso2: item.iso2,
          iso3: item.iso3,
          officialUrl: item.officialUrl,
          urlSource: item.urlSource,
          queryFormat: r.queryFormat,
          formatSource: r.formatSource,
          confirmedSearchable: r.confirmedSearchable,
          hasIssue: r.hasIssue
        };
      })
    };
  }

  exportButton.addEventListener("click", () => {
    const blob = new Blob(
      [JSON.stringify(exportedData(), null, 2) + "\n"],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gobf-jurisdictions-reviewed.json";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  importButton.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;

    try {
      const imported = JSON.parse(await file.text());
      if (
        imported?.schemaVersion !== "gobf-jurisdiction-review-v1" ||
        !Array.isArray(imported.jurisdictions)
      ) {
        throw new Error("Unsupported review file");
      }

      const allowed = new Set(baseData.map(item => item.iso3));
      const next = { ...state };

      for (const item of imported.jurisdictions) {
        if (!allowed.has(item.iso3)) continue;
        next[item.iso3] = {
          confirmedSearchable: item.confirmedSearchable === true,
          hasIssue: item.hasIssue === true,
          queryFormat: typeof item.queryFormat === "string" ? item.queryFormat : "",
          formatSource:
            ["research", "inferred", "manual"].includes(item.formatSource)
              ? item.formatSource
              : null
        };
      }

      state = next;
      saveState();
      render();
      saveStatus.textContent = "Imported and saved in this browser.";
    } catch (error) {
      alert(`Import failed: ${error instanceof Error ? error.message : "Invalid JSON"}`);
    } finally {
      importFile.value = "";
    }
  });

  fetch("./jurisdictions.json", { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (
        data?.schemaVersion !== "gobf-jurisdiction-directory-v1" ||
        !Array.isArray(data.jurisdictions)
      ) {
        throw new Error("Invalid jurisdictions.json");
      }
      baseData = data.jurisdictions;
      render();
    })
    .catch(error => {
      directory.textContent = `Could not load jurisdictions.json: ${error.message}`;
    });
})();
