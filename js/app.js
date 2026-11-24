/**
 * MCMEG - UFMG | X-Ray Mass Energy-Absorption Coefficients Database (μ_en/ρ)
 * Main Interactive Application Logic:
 *   - Plotly.js Log-Log Chart (Single Material, Overlay Comparison, and Ratio Plot)
 *   - Interactive Periodic Table & Material Selector
 *   - Log-Log Interpolation Calculator
 *   - Clean HTML & ASCII Data Tables (Energy & μ_en/ρ + Ratio)
 *   - Dark / Light Theme Support
 */

(function () {
  "use strict";

  const DB = window.MCMEG_DATABASE;

  // Application State
  const state = {
    darkMode: localStorage.getItem("mcmeg_theme") === "dark",
    mainTab: "explorer",          // 'explorer' | 'catalog' | 'methodology'
    category: "elemental",        // 'elemental' | 'tissues'
    selectorView: "list",         // 'list' | 'periodic' (for elemental media)
    selectedId: null,             // No material selected initially until user clicks one
    compareMode: false,           // Compare active material with another material
    compareCategory: "tissues",   // 'elemental' | 'tissues' (category for second material in comparison)
    compareTargetId: "water",     // Target material ID for comparison ('water', 'Au', etc.)
    comparePlotType: "overlay",   // 'overlay' (both curves) | 'ratio' ((μ_en/ρ)_A / (μ_en/ρ)_B)
    invertRatio: false,           // false: MatA / MatB, true: MatB / MatA
    energyUnit: "keV",            // 'eV' | 'keV' | 'MeV'
    logScaleX: true,              // Log X axis (default true)
    logScaleY: true,              // Log Y axis (default true)
    showMcmegRegion: false,       // Highlight 50 eV - 1000 eV MCMEG target window
    tableView: "html",            // 'html' | 'ascii'
    searchQuery: "",              // Material search filter
    tableEnergyFilter: "",        // Table energy filter
    interpolatedPoint: null       // { energy_MeV, yVal, label }
  };

  // Unit conversion factors from MeV
  const UNIT_FACTORS = {
    MeV: 1,
    keV: 1e3,
    eV: 1e6
  };

  const UNIT_LABELS = {
    MeV: "MeV",
    keV: "keV",
    eV: "eV"
  };

  function applyTheme() {
    document.documentElement.classList.toggle("dark", state.darkMode);
    const iconEl = document.getElementById("theme-toggle-icon");
    const labelEl = document.getElementById("theme-toggle-label");
    if (iconEl && labelEl) {
      if (state.darkMode) {
        iconEl.textContent = "☀️";
        labelEl.textContent = "Light Mode";
      } else {
        iconEl.textContent = "🌙";
        labelEl.textContent = "Dark Mode";
      }
    }
    try {
      localStorage.setItem("mcmeg_theme", state.darkMode ? "dark" : "light");
    } catch (_) {}
  }

  // Helper: Find material by ID across both categories
  function getMaterialById(id) {
    return (
      DB.elementalMedia.find((m) => m.id === id) ||
      DB.tissuesAndCompounds.find((m) => m.id === id)
    );
  }

  // Helper: Get primary active material with loaded data
  function getPrimaryActiveMaterial() {
    const currentMat = getMaterialById(state.selectedId);
    if (currentMat && currentMat.data && currentMat.data.length > 0) {
      return currentMat;
    }
    return state.category === "elemental"
      ? getMaterialById("Au")
      : getMaterialById("water");
  }

  // Helper: Get comparison target material (Material B) with loaded data
  function getCompareTargetMaterial() {
    const targetMat = getMaterialById(state.compareTargetId);
    if (targetMat && targetMat.data && targetMat.data.length > 0) {
      return targetMat;
    }
    const list =
      state.compareCategory === "elemental"
        ? DB.elementalMedia
        : DB.tissuesAndCompounds;
    const avail = list.find((m) => m.status === "available" || (m.data && m.data.length > 0));
    return avail || getMaterialById("water") || getMaterialById("Au");
  }

  function getShortMatLabel(mat) {
    if (!mat) return "";
    return mat.symbol || mat.shortName || mat.name;
  }

  function getFullMatLabel(mat) {
    if (!mat) return "";
    return mat.category === "elemental"
      ? `${mat.name} (Z = ${mat.z})`
      : mat.name;
  }

  // Compute dataset provenance & version lines dynamically from energy range and per-material metadata
  function getDatasetProvenance(mat) {
    const meta = DB.metadata || {};
    const dbVer = meta.version || "1.0";
    const dbDate = meta.releaseDate || "Nov 2026";
    const dsVer = (mat && mat.datasetVersion) || dbVer;
    const rows = (mat && mat.data) || [];
    const hasSubKeV = rows.some((r) => r.energy_MeV < 0.000999);
    const hasHighKeV = rows.some((r) => r.energy_MeV > 0.00105);

    let regime = "nist_only";
    if (hasSubKeV && hasHighKeV) {
      regime = "combined";
    } else if (hasSubKeV && !hasHighKeV) {
      regime = "mcmeg_only";
    }

    const articleFull = (mat && mat.articleRef) || meta.mcmegArticleRef || "";
    const articleShort = (mat && mat.articleShortRef) || meta.mcmegShortRef || "Araújo et al., 2026";
    const doi = (mat && mat.doi) || meta.mcmegDoi || "";

    let sourceLabel = (mat && mat.dataSourceLabel) || "NIST Reference (1 keV – 20 MeV)";
    let versionPillText = `Dataset v${dsVer} · NIST SRD 126 v1.4`;
    if (regime === "mcmeg_only") {
      sourceLabel = "MCMEG (0.05 – 1.0 keV)";
      versionPillText = `Dataset v${dsVer} · ${articleShort}${doi ? ` · DOI: ${doi}` : ""}`;
    } else if (regime === "combined") {
      sourceLabel = "MCMEG (0.05–1 keV) + NIST Reference (1 keV–20 MeV)";
      versionPillText = `Dataset v${dsVer} · ${articleShort}${doi ? ` · DOI: ${doi}` : ""}`;
    }

    const nistLines = [
      `# ${regime === "combined" ? "NIST Reference   " : "Reference        "}: Hubbell, J.H., Seltzer, S.M., 2004. Tables of x-ray mass`,
      `#                    attenuation coefficients and mass energy-absorption`,
      `#                    coefficients. URL: http://physics.nist.gov/xaamdi`,
      `#                    (version 1.4), National Institute of Standards and`,
      `#                    Technology (NIST), Gaithersburg, MD. Accessed: 2026-07-02.`
    ];

    const headerLines = [
      `# Database Version : v${dbVer} (${dbDate})`
    ];

    if (regime === "nist_only") {
      headerLines.push(`# Dataset Version  : v${dsVer}`);
      headerLines.push(`# Source           : ${sourceLabel}`);
      headerLines.push(...nistLines);
    } else if (regime === "mcmeg_only") {
      headerLines.push(
        `# Dataset Version  : v${dsVer} (${articleShort}${doi ? ` / DOI: ${doi}` : ""})`
      );
      headerLines.push(`# Source           : MCMEG Low-Energy Simulation (0.05 keV – 1.0 keV)`);
      if (articleFull) headerLines.push(`# Reference Article: ${articleFull}`);
      if (doi) headerLines.push(`# Article DOI      : ${doi}`);
    } else {
      headerLines.push(
        `# Dataset Version  : v${dsVer} (${articleShort}${doi ? ` / DOI: ${doi}` : ""})`
      );
      headerLines.push(`# Sources          : MCMEG (0.05–1.0 keV) + NIST Reference (1 keV–20 MeV)`);
      if (articleFull) headerLines.push(`# Reference Article: ${articleFull}`);
      if (doi) headerLines.push(`# Article DOI      : ${doi}`);
      headerLines.push(...nistLines);
    }

    return {
      dbVer,
      dbDate,
      dsVer,
      regime,
      hasSubKeV,
      hasHighKeV,
      sourceLabel,
      versionPillText,
      articleFull,
      articleShort,
      doi,
      headerLines
    };
  }

  function buildCompareProvenanceLines(matA, matB) {
    const provA = getDatasetProvenance(matA);
    const provB = getDatasetProvenance(matB);
    const shortA = getShortMatLabel(matA);
    const shortB = getShortMatLabel(matB);
    const anySubKeV = provA.hasSubKeV || provB.hasSubKeV;
    const anyHighKeV = provA.hasHighKeV || provB.hasHighKeV || !anySubKeV;

    const lines = [
      `# Database Version : v${provA.dbVer} (${provA.dbDate})`,
      `# Dataset Versions : ${shortA} (v${provA.dsVer}) vs. ${shortB} (v${provB.dsVer})`
    ];

    if (anySubKeV && anyHighKeV) {
      lines.push(`# Sources          : MCMEG (0.05–1.0 keV) + NIST Reference (1 keV–20 MeV)`);
    } else if (anySubKeV) {
      lines.push(`# Source           : MCMEG Low-Energy Simulation (0.05 keV – 1.0 keV)`);
    } else {
      lines.push(`# Source           : NIST Reference (1 keV – 20 MeV)`);
    }

    if (anySubKeV) {
      const mcmegProvs = [provA, provB].filter((p) => p.hasSubKeV);
      const seenArticles = new Set();
      mcmegProvs.forEach((p) => {
        const key = `${p.articleFull}|${p.doi}`;
        if (!seenArticles.has(key) && p.articleFull) {
          seenArticles.add(key);
          lines.push(`# Reference Article: ${p.articleFull}${p.doi ? ` (DOI: ${p.doi})` : ""}`);
        }
      });
    }

    if (anyHighKeV) {
      lines.push(
        `# ${anySubKeV ? "NIST Reference   " : "Reference        "}: Hubbell, J.H., Seltzer, S.M., 2004. Tables of x-ray mass`,
        `#                    attenuation coefficients and mass energy-absorption`,
        `#                    coefficients. URL: http://physics.nist.gov/xaamdi`,
        `#                    (version 1.4), National Institute of Standards and`,
        `#                    Technology (NIST), Gaithersburg, MD. Accessed: 2026-07-02.`
      );
    }

    return lines;
  }

  // Helper: Format number in scientific notation like NIST (e.g. 4.639E+03)
  function formatSci(val, digits = 3) {
    if (val === null || val === undefined || isNaN(val)) return "—";
    const expStr = Number(val).toExponential(digits).toUpperCase();
    return expStr.replace(/E([+-])(\d)$/, "E$10$2");
  }

  function formatEnergy(energyMeV, unit) {
    const val = energyMeV * UNIT_FACTORS[unit];
    if (unit === "MeV") {
      return Number(val).toExponential(5).toUpperCase().replace(/E([+-])(\d)$/, "E$10$2");
    }
    if (unit === "keV") {
      return val >= 0.01 && val < 10000
        ? Number(val.toPrecision(6)).toString()
        : formatSci(val, 4);
    }
    return val >= 1 && val < 1e6
      ? Number(val.toPrecision(6)).toString()
      : formatSci(val, 4);
  }

  // Helper: Log-Log interpolate μ_en/ρ of a material at any target energy_MeV
  function interpolateMuenAtEnergy(matData, targetMeV) {
    if (!matData || matData.length === 0) return null;
    const minE = matData[0].energy_MeV;
    const maxE = matData[matData.length - 1].energy_MeV;
    if (targetMeV < minE * 0.999999 || targetMeV > maxE * 1.000001) return null;

    // Check exact match (preferring the upper side of any edge if duplicated)
    for (let i = matData.length - 1; i >= 0; i--) {
      if (Math.abs(matData[i].energy_MeV - targetMeV) / targetMeV < 1e-7) {
        return matData[i].muen_rho;
      }
    }

    for (let i = 0; i < matData.length - 1; i++) {
      const e1 = matData[i].energy_MeV;
      const e2 = matData[i + 1].energy_MeV;
      if (targetMeV >= e1 && targetMeV <= e2 && e2 > e1) {
        const logE = Math.log10(targetMeV);
        const logE1 = Math.log10(e1);
        const logE2 = Math.log10(e2);
        const t = (logE - logE1) / (logE2 - logE1);
        const logY1 = Math.log10(matData[i].muen_rho);
        const logY2 = Math.log10(matData[i + 1].muen_rho);
        return Math.pow(10, logY1 + t * (logY2 - logY1));
      }
    }
    return null;
  }

  // Compute comparison dataset (Primary Material A vs Target Material B) across Material A's energy grid
  function buildComparisonDataset() {
    const matA = getPrimaryActiveMaterial();
    const matB = getCompareTargetMaterial();
    if (!matA || !matB || !matA.data || !matB.data) return [];

    return matA.data.map((row) => {
      const eMeV = row.energy_MeV;
      const muenA = row.muen_rho;
      const muenB = interpolateMuenAtEnergy(matB.data, eMeV);
      const ratio =
        muenB && muenA
          ? state.invertRatio
            ? muenB / muenA
            : muenA / muenB
          : null;
      return {
        energy_MeV: eMeV,
        muen_A: muenA,
        muen_B: muenB,
        ratio: ratio
      };
    });
  }

  // Try loading CSV dynamically if served via HTTP/GitHub Pages
  async function tryLoadCsvForMaterial(material) {
    if (!material || !material.csvPath || (material.data && material.data.length > 0)) {
      return;
    }
    if (window.location.protocol === "file:") {
      return;
    }
    try {
      const response = await fetch(material.csvPath);
      if (!response.ok) return;
      const text = await response.text();
      const lines = text
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
      if (lines.length < 2) return;
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length >= 4) {
          const edge = cols[0].trim();
          const energy_MeV = parseFloat(cols[1]);
          const mu_rho = cols[2].trim() !== "" ? parseFloat(cols[2]) : null;
          const muen_rho = parseFloat(cols[3]);
          if (!isNaN(energy_MeV) && !isNaN(muen_rho)) {
            parsed.push({ edge, energy_MeV, mu_rho, muen_rho });
          }
        } else if (cols.length === 2) {
          const energy_MeV = parseFloat(cols[0]);
          const muen_rho = parseFloat(cols[1]);
          if (!isNaN(energy_MeV) && !isNaN(muen_rho)) {
            parsed.push({ edge: "", energy_MeV, mu_rho: null, muen_rho });
          }
        }
      }
      if (parsed.length > 0) {
        material.data = parsed;
        material.status = "available";
      }
    } catch (_) {}
  }

  // Render Sidebar Material List or Periodic Table
  function renderMaterialSelector() {
    const listContainer = document.getElementById("material-list-container");
    const ptContainer = document.getElementById("periodic-table-container");
    const viewToggleWrap = document.getElementById("elemental-view-toggle");

    const btnElem = document.getElementById("cat-btn-elemental");
    const btnTiss = document.getElementById("cat-btn-tissues");

    if (state.category === "elemental") {
      btnElem.className =
        "flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-rose-700 text-white shadow-sm";
      btnTiss.className =
        "flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100";
      viewToggleWrap.classList.remove("hidden");
    } else {
      btnTiss.className =
        "flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-sky-600 text-white shadow-sm";
      btnElem.className =
        "flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100";
      viewToggleWrap.classList.add("hidden");
    }

    if (state.category === "elemental" && state.selectorView === "periodic") {
      listContainer.classList.add("hidden");
      ptContainer.classList.remove("hidden");
      renderPeriodicTable(ptContainer);
      return;
    } else {
      listContainer.classList.remove("hidden");
      ptContainer.classList.add("hidden");
    }

    const items =
      state.category === "elemental" ? DB.elementalMedia : DB.tissuesAndCompounds;
    const query = state.searchQuery.trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (!query) return true;
      const matchName = item.name.toLowerCase().includes(query);
      const matchSym = item.symbol && item.symbol.toLowerCase().includes(query);
      const matchZ = item.z && String(item.z).includes(query);
      const matchComp = item.composition && item.composition.toLowerCase().includes(query);
      return matchName || matchSym || matchZ || matchComp;
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center py-8 px-4 text-slate-400 text-sm">
          No material matching "${state.searchQuery}".
        </div>
      `;
      return;
    }

    listContainer.innerHTML = filtered
      .map((item) => {
        const isSelected = item.id === state.selectedId;
        const isAvailable = item.status === "available";
        const activeClass = isSelected
          ? state.category === "elemental"
            ? "active-elemental"
            : "active-tissue"
          : "bg-white hover:bg-slate-50";

        if (state.category === "elemental") {
          return `
            <button
              type="button"
              data-material-id="${item.id}"
              class="material-item w-full text-left p-3 rounded-xl flex items-center justify-between gap-3 ${activeClass}"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 font-mono-sci ${
                  isAvailable
                    ? "bg-rose-700 text-white font-bold shadow-sm"
                    : "bg-slate-100 text-slate-600 font-semibold"
                }">
                  <span class="text-[10px] leading-none opacity-80">Z=${item.z}</span>
                  <span class="text-sm leading-tight">${item.symbol}</span>
                </div>
                <div class="min-w-0">
                  <div class="font-semibold text-slate-900 text-sm truncate flex items-center gap-1.5">
                    ${item.name}
                  </div>
                  <div class="text-xs text-slate-500 font-mono-sci">
                    ρ = ${item.density} g/cm³
                  </div>
                </div>
              </div>
              <div class="shrink-0">
                ${
                  isAvailable
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                         <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
                       </span>`
                    : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                         0.05–1 keV Soon
                       </span>`
                }
              </div>
            </button>
          `;
        } else {
          return `
            <button
              type="button"
              data-material-id="${item.id}"
              class="material-item w-full text-left p-3 rounded-xl flex items-center justify-between gap-3 ${activeClass}"
            >
              <div class="min-w-0 pr-2">
                <div class="font-semibold text-slate-900 text-sm truncate">
                  ${item.shortName || item.name}
                </div>
                <div class="text-xs text-slate-500 font-mono-sci truncate">
                  ρ = ${item.density.toFixed(3)} g/cm³ · ${item.source}
                </div>
              </div>
              <div class="shrink-0">
                ${
                  isAvailable
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                         <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
                       </span>`
                    : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                         0.05–1 keV Soon
                       </span>`
                }
              </div>
            </button>
          `;
        }
      })
      .join("");

    listContainer.querySelectorAll("[data-material-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-material-id");
        selectMaterial(id);
      });
    });
  }

  // Render Compact Interactive Periodic Table highlighting the 15 Nanoparticle Elements
  function renderPeriodicTable(container) {
    const mcmegMap = {};
    DB.elementalMedia.forEach((m) => {
      mcmegMap[m.z] = m;
    });

    const ptElements = [
      { z: 1, sym: "H", r: 1, c: 1 }, { z: 2, sym: "He", r: 1, c: 18 },
      { z: 3, sym: "Li", r: 2, c: 1 }, { z: 4, sym: "Be", r: 2, c: 2 },
      { z: 5, sym: "B", r: 2, c: 13 }, { z: 6, sym: "C", r: 2, c: 14 },
      { z: 7, sym: "N", r: 2, c: 15 }, { z: 8, sym: "O", r: 2, c: 16 },
      { z: 9, sym: "F", r: 2, c: 17 }, { z: 10, sym: "Ne", r: 2, c: 18 },
      { z: 11, sym: "Na", r: 3, c: 1 }, { z: 12, sym: "Mg", r: 3, c: 2 },
      { z: 13, sym: "Al", r: 3, c: 13 }, { z: 14, sym: "Si", r: 3, c: 14 },
      { z: 15, sym: "P", r: 3, c: 15 }, { z: 16, sym: "S", r: 3, c: 16 },
      { z: 17, sym: "Cl", r: 3, c: 17 }, { z: 18, sym: "Ar", r: 3, c: 18 },
      { z: 19, sym: "K", r: 4, c: 1 }, { z: 20, sym: "Ca", r: 4, c: 2 },
      { z: 21, sym: "Sc", r: 4, c: 3 }, { z: 22, sym: "Ti", r: 4, c: 4 },
      { z: 23, sym: "V", r: 4, c: 5 }, { z: 24, sym: "Cr", r: 4, c: 6 },
      { z: 25, sym: "Mn", r: 4, c: 7 }, { z: 26, sym: "Fe", r: 4, c: 8 },
      { z: 27, sym: "Co", r: 4, c: 9 }, { z: 28, sym: "Ni", r: 4, c: 10 },
      { z: 29, sym: "Cu", r: 4, c: 11 }, { z: 30, sym: "Zn", r: 4, c: 12 },
      { z: 31, sym: "Ga", r: 4, c: 13 }, { z: 32, sym: "Ge", r: 4, c: 14 },
      { z: 33, sym: "As", r: 4, c: 15 }, { z: 34, sym: "Se", r: 4, c: 16 },
      { z: 35, sym: "Br", r: 4, c: 17 }, { z: 36, sym: "Kr", r: 4, c: 18 },
      { z: 37, sym: "Rb", r: 5, c: 1 }, { z: 38, sym: "Sr", r: 5, c: 2 },
      { z: 39, sym: "Y", r: 5, c: 3 }, { z: 40, sym: "Zr", r: 5, c: 4 },
      { z: 41, sym: "Nb", r: 5, c: 5 }, { z: 42, sym: "Mo", r: 5, c: 6 },
      { z: 43, sym: "Tc", r: 5, c: 7 }, { z: 44, sym: "Ru", r: 5, c: 8 },
      { z: 45, sym: "Rh", r: 5, c: 9 }, { z: 46, sym: "Pd", r: 5, c: 10 },
      { z: 47, sym: "Ag", r: 5, c: 11 }, { z: 48, sym: "Cd", r: 5, c: 12 },
      { z: 49, sym: "In", r: 5, c: 13 }, { z: 50, sym: "Sn", r: 5, c: 14 },
      { z: 51, sym: "Sb", r: 5, c: 15 }, { z: 52, sym: "Te", r: 5, c: 16 },
      { z: 53, sym: "I", r: 5, c: 17 }, { z: 54, sym: "Xe", r: 5, c: 18 },
      { z: 55, sym: "Cs", r: 6, c: 1 }, { z: 56, sym: "Ba", r: 6, c: 2 },
      { z: 64, sym: "Gd*", r: 6, c: 3, actualZ: 64 },
      { z: 72, sym: "Hf", r: 6, c: 4 }, { z: 73, sym: "Ta", r: 6, c: 5 },
      { z: 74, sym: "W", r: 6, c: 6 }, { z: 75, sym: "Re", r: 6, c: 7 },
      { z: 76, sym: "Os", r: 6, c: 8 }, { z: 77, sym: "Ir", r: 6, c: 9 },
      { z: 78, sym: "Pt", r: 6, c: 10 }, { z: 79, sym: "Au", r: 6, c: 11 },
      { z: 80, sym: "Hg", r: 6, c: 12 }, { z: 81, sym: "Tl", r: 6, c: 13 },
      { z: 82, sym: "Pb", r: 6, c: 14 }, { z: 83, sym: "Bi", r: 6, c: 15 },
      { z: 84, sym: "Po", r: 6, c: 16 }, { z: 85, sym: "At", r: 6, c: 17 },
      { z: 86, sym: "Rn", r: 6, c: 18 }
    ];

    const posMap = {};
    ptElements.forEach((el) => {
      posMap[`${el.r}-${el.c}`] = el;
    });

    let cellsHtml = "";
    for (let r = 1; r <= 6; r++) {
      for (let c = 1; c <= 18; c++) {
        const el = posMap[`${r}-${c}`];
        if (!el) {
          cellsHtml += `<div class="pt-cell opacity-0 pointer-events-none"></div>`;
          continue;
        }
        const mcmegItem = mcmegMap[el.z];
        if (mcmegItem) {
          const isAvail = mcmegItem.status === "available";
          const isSelected = mcmegItem.id === state.selectedId;
          const cellClass = isAvail
            ? "pt-cell-mcmeg-available"
            : "pt-cell-mcmeg-upcoming";
          const selClass = isSelected ? "pt-cell-selected" : "";
          cellsHtml += `
            <button
              type="button"
              data-pt-id="${mcmegItem.id}"
              title="${mcmegItem.name} (Z=${mcmegItem.z}, ρ=${mcmegItem.density} g/cm³)"
              class="pt-cell ${cellClass} ${selClass}"
            >
              <span class="text-[8px] leading-none opacity-75 font-mono-sci">${el.z}</span>
              <span class="text-[11px] font-bold leading-tight">${mcmegItem.symbol}</span>
            </button>
          `;
        } else {
          cellsHtml += `
            <div class="pt-cell pt-cell-inactive" title="Z=${el.z}">
              <span class="text-[7px] leading-none">${el.z}</span>
              <span class="text-[9px] leading-tight">${el.sym}</span>
            </div>
          `;
        }
      }
    }

    container.innerHTML = `
      <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5 text-xs">
          <span class="font-semibold text-slate-700">Elemental Media</span>
          <div class="flex items-center gap-3">
            <span class="inline-flex items-center gap-1 text-[11px] text-rose-900 dark:text-rose-300 font-medium">
              <span class="w-2.5 h-2.5 rounded-sm bg-rose-200 border border-rose-600 inline-block"></span> Active (Current Study)
            </span>
            <span class="inline-flex items-center gap-1 text-[11px] text-slate-600">
              <span class="w-2.5 h-2.5 rounded-sm bg-white border border-slate-400 inline-block"></span> Unavailable (Soon)
            </span>
          </div>
        </div>
        <div class="periodic-scroll-wrap">
          <div class="periodic-grid">
            ${cellsHtml}
          </div>
        </div>
        <p class="text-[11px] text-slate-500 mt-2">
          *Note: <strong>Gd (Z=64)</strong> is placed in the Lanthanide slot (row 6, col 3) for compact visualization. Click any highlighted element to inspect.
        </p>
      </div>
    `;

    container.querySelectorAll("[data-pt-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectMaterial(btn.getAttribute("data-pt-id"));
      });
    });
  }

  // Select a material and update UI
  async function selectMaterial(id) {
    state.selectedId = id;
    state.interpolatedPoint = null;

    const emptyPlaceholder = document.getElementById("empty-selection-placeholder");
    const activeContent = document.getElementById("active-material-content");
    const dataCards = document.getElementById("active-material-data-cards");

    if (!id) {
      if (emptyPlaceholder) emptyPlaceholder.classList.remove("hidden");
      if (activeContent) activeContent.classList.add("hidden");
      renderMaterialSelector();
      return;
    }

    if (emptyPlaceholder) emptyPlaceholder.classList.add("hidden");
    if (activeContent) activeContent.classList.remove("hidden");

    const mat = getMaterialById(id);
    if (mat) {
      await tryLoadCsvForMaterial(mat);
    }

    const hasData = mat && mat.status === "available" && mat.data && mat.data.length > 0;
    if (dataCards) {
      if (hasData) {
        dataCards.classList.remove("hidden");
      } else {
        dataCards.classList.add("hidden");
      }
    }

    // Keep default comparison target distinct when switching primary material
    const primaryMat = getPrimaryActiveMaterial();
    if (primaryMat && state.compareTargetId === primaryMat.id) {
      if (primaryMat.category === "elemental") {
        state.compareCategory = "tissues";
        state.compareTargetId = "water";
      } else {
        state.compareCategory = "elemental";
        state.compareTargetId = "Au";
      }
    }

    renderMaterialSelector();
    renderMaterialHeaderAndDetails();
    if (hasData) {
      renderCompareSubbar();
      renderLogLogChart();
      renderDataTable();
    }
    clearInterpolationResult();
  }

  // Update Compare Sub-Toolbar UI
  function renderCompareSubbar() {
    const subbar = document.getElementById("compare-mode-subbar");
    const btnCatElem = document.getElementById("btn-compare-cat-elemental");
    const btnCatTiss = document.getElementById("btn-compare-cat-tissues");
    const selectMatEl = document.getElementById("select-compare-material");
    const pairBadgeEl = document.getElementById("compare-pair-badge");
    const btnOverlay = document.getElementById("btn-compare-overlay");
    const btnRatio = document.getElementById("btn-compare-ratio");
    const btnSwap = document.getElementById("btn-swap-ratio");
    const summaryEl = document.getElementById("compare-ratio-summary");

    if (!subbar) return;

    if (!state.compareMode) {
      subbar.classList.add("hidden");
      return;
    }

    subbar.classList.remove("hidden");

    // Step 1: Style category buttons
    if (btnCatElem && btnCatTiss) {
      if (state.compareCategory === "elemental") {
        btnCatElem.className =
          "px-2.5 py-1 text-xs font-semibold bg-amber-500 text-slate-950 transition shadow-sm";
        btnCatTiss.className =
          "px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition";
      } else {
        btnCatTiss.className =
          "px-2.5 py-1 text-xs font-semibold bg-sky-600 text-white transition shadow-sm";
        btnCatElem.className =
          "px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition";
      }
    }

    // Step 2: Populate material dropdown for the chosen category
    const catList =
      state.compareCategory === "elemental"
        ? DB.elementalMedia
        : DB.tissuesAndCompounds;

    // Ensure compareTargetId belongs to current compareCategory and is available
    const inCat = catList.find((m) => m.id === state.compareTargetId && (m.status === "available" || (m.data && m.data.length > 0)));
    if (!inCat) {
      const firstAvail = catList.find((m) => m.status === "available" || (m.data && m.data.length > 0));
      if (firstAvail) {
        state.compareTargetId = firstAvail.id;
      }
    }

    if (selectMatEl) {
      selectMatEl.innerHTML = catList
        .map((m) => {
          const isAvail = m.status === "available" || (m.data && m.data.length > 0);
          const isSelected = m.id === state.compareTargetId;
          const label =
            state.compareCategory === "elemental"
              ? `Z=${m.z} · ${m.name} (${m.symbol})${isAvail ? "" : " (Soon)"}`
              : `${m.shortName || m.name}${isAvail ? "" : " (Soon)"}`;
          return `<option value="${m.id}" ${isSelected ? "selected" : ""} ${
            isAvail ? "" : "disabled"
          }>${label}</option>`;
        })
        .join("");
    }

    const matA = getPrimaryActiveMaterial();
    const matB = getCompareTargetMaterial();
    const shortA = getShortMatLabel(matA);
    const shortB = getShortMatLabel(matB);

    if (pairBadgeEl) {
      pairBadgeEl.innerHTML = `Active Pair: <strong class="text-rose-700 dark:text-rose-400">${getFullMatLabel(matA)}</strong> vs. <strong class="text-sky-700 dark:text-sky-300">${getFullMatLabel(matB)}</strong>`;
    }

    const numLabel = state.invertRatio ? shortB : shortA;
    const denLabel = state.invertRatio ? shortA : shortB;

    btnOverlay.innerHTML = `📈 Overlay Curves (${shortA} &amp; ${shortB})`;
    btnRatio.innerHTML = `➗ Ratio Curve: (μ<sub>en</sub>/ρ)<sub>${numLabel}</sub> / (μ<sub>en</sub>/ρ)<sub>${denLabel}</sub>`;

    if (state.comparePlotType === "overlay") {
      btnOverlay.className =
        "px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-600 text-white transition shadow-sm";
      btnRatio.className =
        "px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 transition";
      btnSwap.classList.add("hidden");
      summaryEl.innerHTML = `<span class="text-slate-600">Showing both <strong>μ<sub>en</sub>/ρ</strong> curves on the same Log-Log graph.</span>`;
    } else {
      btnRatio.className =
        "px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-slate-950 transition shadow-sm";
      btnOverlay.className =
        "px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 transition";
      btnSwap.classList.remove("hidden");

      // Compute peak ratio for summary
      const compRows = buildComparisonDataset().filter((r) => r.ratio !== null);
      if (compRows.length > 0) {
        let maxRow = compRows[0];
        let minRow = compRows[0];
        compRows.forEach((r) => {
          if (r.ratio > maxRow.ratio) maxRow = r;
          if (r.ratio < minRow.ratio) minRow = r;
        });
        const unit = state.energyUnit;
        summaryEl.innerHTML = `
          <span>Peak Ratio: <strong class="text-amber-700">${maxRow.ratio.toFixed(2)}×</strong> (at ${formatEnergy(maxRow.energy_MeV, unit)} ${unit})</span>
          <span class="mx-1.5 text-slate-300">|</span>
          <span>Min: <strong>${minRow.ratio.toFixed(3)}×</strong></span>
        `;
      }
    }
  }

  // Render active material metadata banner above chart
  function renderMaterialHeaderAndDetails() {
    const mat = getMaterialById(state.selectedId);
    if (!mat) return;

    const titleEl = document.getElementById("active-material-title");
    const subtitleEl = document.getElementById("active-material-subtitle");
    const badgesEl = document.getElementById("active-material-badges");
    const noticeEl = document.getElementById("upcoming-dataset-notice");

    const prov = getDatasetProvenance(mat);

    if (mat.category === "elemental") {
      titleEl.innerHTML = `Z = ${mat.z}. <span class="ml-1">${mat.name} (${mat.symbol})</span>`;
      subtitleEl.textContent = "";
      subtitleEl.classList.add("hidden");
      badgesEl.innerHTML = `
        <span class="px-2.5 py-1 rounded-md text-xs font-mono-sci font-semibold bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-700/50">
          Elemental Media (100 wt%)
        </span>
        <span class="px-2.5 py-1 rounded-md text-xs font-mono-sci bg-slate-100 text-slate-700 border border-slate-200">
          Atomic Number Z = ${mat.z}
        </span>
        <span class="px-2.5 py-1 rounded-md text-xs font-mono-sci bg-slate-100 text-slate-700 border border-slate-200">
          Density ρ = ${mat.density} g/cm³
        </span>
        ${
          mat.status === "available"
            ? `<span class="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                 Source: ${prov.sourceLabel}
               </span>
               <span class="px-2.5 py-1 rounded-md text-xs font-mono-sci font-medium bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                 ${prov.versionPillText}
               </span>`
            : `<span class="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                 MCMEG 0.05–1 keV Dataset in Preparation
               </span>`
        }
      `;
    } else {
      titleEl.innerHTML = `${mat.name}`;
      subtitleEl.textContent = `Elemental composition by weight: ${mat.composition}`;
      subtitleEl.classList.remove("hidden");
      badgesEl.innerHTML = `
        <span class="px-2.5 py-1 rounded-md text-xs font-mono-sci font-semibold bg-sky-100 text-sky-900 border border-sky-300">
          Tissues & Compounds
        </span>
        <span class="px-2.5 py-1 rounded-md text-xs font-mono-sci bg-slate-100 text-slate-700 border border-slate-200">
          Density ρ = ${mat.density.toFixed(3)} g/cm³
        </span>
        <span class="px-2.5 py-1 rounded-md text-xs font-mono-sci bg-slate-100 text-slate-700 border border-slate-200">
          ${mat.source}
        </span>
        ${
          mat.status === "available"
            ? `<span class="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                 Source: ${prov.sourceLabel}
               </span>
               <span class="px-2.5 py-1 rounded-md text-xs font-mono-sci font-medium bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                 ${prov.versionPillText}
               </span>`
            : `<span class="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                 MCMEG 0.05–1 keV Dataset in Preparation
               </span>`
        }
      `;
    }

    if (mat.status !== "available") {
      const fallbackRef = mat.category === "elemental" ? "Gold (Au, Z=79)" : "Water, Liquid";
      const fallbackId = mat.category === "elemental" ? "Au" : "water";
      noticeEl.classList.remove("hidden");
      noticeEl.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-amber-900 text-sm">
              ⏳ Tabular Data in Preparation for ${mat.name} (0.05 – 1.0 keV)
            </p>
            <p class="text-xs text-amber-800 mt-0.5">
              The MCMEG low-energy tables are currently being finalized for publication. Once ready, drop <code class="font-mono-sci bg-amber-100 px-1 py-0.5 rounded">${mat.csvPath}</code> into the repository folder. For now, you can inspect the active reference example: <strong>${fallbackRef}</strong>.
            </p>
          </div>
          <button
            type="button"
            id="switch-to-active-example-btn"
            data-target-id="${fallbackId}"
            class="shrink-0 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition shadow-sm"
          >
            Load ${fallbackRef} Example →
          </button>
        </div>
      `;
      const btnSwitch = document.getElementById("switch-to-active-example-btn");
      if (btnSwitch) {
        btnSwitch.addEventListener("click", () => {
          selectMaterial(btnSwitch.getAttribute("data-target-id"));
        });
      }
    } else {
      noticeEl.classList.add("hidden");
    }
  }

  // Render Interactive Log-Log Plot using Plotly.js (Focused 100% on μ_en/ρ and Ratio)
  function renderLogLogChart() {
    const plotContainer = document.getElementById("plotly-loglog-chart");
    if (!plotContainer || typeof Plotly === "undefined") return;

    const isDark = state.darkMode;
    const currentMat = getMaterialById(state.selectedId);
    const primaryMat =
      currentMat && currentMat.data && currentMat.data.length > 0
        ? currentMat
        : state.category === "elemental"
        ? getMaterialById("Au")
        : getMaterialById("water");

    const factor = UNIT_FACTORS[state.energyUnit];
    const unitLabel = UNIT_LABELS[state.energyUnit];

    const traces = [];
    const shapes = [];
    const annotations = [];

    // Helper to build a single clean μ_en/ρ trace
    function addMuenTrace(mat, lineColor) {
      if (!mat || !mat.data || mat.data.length === 0) return;
      const xVals = mat.data.map((row) => row.energy_MeV * factor);
      const yMuen = mat.data.map((row) => row.muen_rho);

      traces.push({
        x: xVals,
        y: yMuen,
        mode: "lines+markers",
        marker: {
          size: 4.5,
          color: lineColor
        },
        name: `${mat.symbol || mat.shortName || mat.name} — μ<sub>en</sub>/ρ (cm²/g)`,
        line: {
          color: lineColor,
          width: 2.6,
          dash: "solid"
        },
        hovertemplate:
          `<b>${mat.name}</b><br>` +
          `Energy: %{x:.4g} ${unitLabel}<br>` +
          `<b>μ<sub>en</sub>/ρ</b>: %{y:.4e} cm²/g<extra></extra>`
      });
    }

    let plotTitle = "";
    let yAxisTitle = "";

    const matA = getPrimaryActiveMaterial();
    const matB = getCompareTargetMaterial();
    const shortA = getShortMatLabel(matA);
    const shortB = getShortMatLabel(matB);

    if (state.compareMode && state.comparePlotType === "ratio") {
      // RATIO PLOT: (μ_en/ρ)_A / (μ_en/ρ)_B (or inverted)
      const compRows = buildComparisonDataset().filter((r) => r.ratio !== null);
      const xVals = compRows.map((r) => r.energy_MeV * factor);
      const yRatio = compRows.map((r) => r.ratio);

      const numName = state.invertRatio ? getFullMatLabel(matB) : getFullMatLabel(matA);
      const denName = state.invertRatio ? getFullMatLabel(matA) : getFullMatLabel(matB);
      const numShort = state.invertRatio ? shortB : shortA;
      const denShort = state.invertRatio ? shortA : shortB;
      const ratioSymbol = `(μ<sub>en</sub>/ρ)<sub>${numShort}</sub> / (μ<sub>en</sub>/ρ)<sub>${denShort}</sub>`;

      const ratioColor = isDark ? "#34d399" : "#059669";

      traces.push({
        x: xVals,
        y: yRatio,
        mode: "lines+markers",
        marker: {
          size: 5,
          color: ratioColor
        },
        name: `Ratio: ${ratioSymbol}`,
        line: {
          color: ratioColor,
          width: 2.8,
          dash: "solid"
        },
        hovertemplate:
          `<b>Ratio: ${numShort} / ${denShort}</b><br>` +
          `Energy: %{x:.4g} ${unitLabel}<br>` +
          `<b>Ratio</b>: %{y:.4f}×<extra></extra>`
      });

      // Reference horizontal line at Ratio = 1.0
      if (xVals.length > 1) {
        shapes.push({
          type: "line",
          xref: "x",
          yref: "y",
          x0: xVals[0],
          x1: xVals[xVals.length - 1],
          y0: 1,
          y1: 1,
          line: {
            color: isDark ? "rgba(148, 163, 184, 0.45)" : "rgba(100, 116, 139, 0.5)",
            width: 1.5,
            dash: "dot"
          }
        });
      }

      plotTitle = `Ratio of Mass Energy-Absorption Coefficients: ${numName} / ${denName}`;
      yAxisTitle = `Ratio ${ratioSymbol}`;
    } else if (state.compareMode && state.comparePlotType === "overlay") {
      // OVERLAY PLOT: Primary Material A vs Target Material B
      addMuenTrace(matA, isDark ? "#fb7185" : "#e11d48");
      addMuenTrace(matB, isDark ? "#38bdf8" : "#0284c7");

      plotTitle = `Comparison: ${getFullMatLabel(matA)} vs. ${getFullMatLabel(matB)}`;
      yAxisTitle = `μ<sub>en</sub>/ρ, cm²/g`;
    } else {
      // SINGLE MATERIAL PLOT
      const isElem = primaryMat.category === "elemental";
      const mainColor = isElem
        ? isDark
          ? "#fb7185"
          : "#e11d48"
        : isDark
        ? "#38bdf8"
        : "#0284c7";
      addMuenTrace(primaryMat, mainColor);

      plotTitle =
        primaryMat.category === "elemental"
          ? `Z = ${primaryMat.z}. ${primaryMat.name.toUpperCase()} (${primaryMat.symbol})`
          : `${primaryMat.name.toUpperCase()}`;
      yAxisTitle = `μ<sub>en</sub>/ρ, cm²/g`;
    }

    // Highlight Interpolated Point if user calculated one
    if (state.interpolatedPoint) {
      const pt = state.interpolatedPoint;
      traces.push({
        x: [pt.energy_MeV * factor],
        y: [pt.yVal],
        mode: "markers",
        name: `Interpolated (${formatEnergy(pt.energy_MeV, state.energyUnit)} ${unitLabel})`,
        marker: {
          size: 12,
          symbol: "star",
          color: isDark ? "#a78bfa" : "#7c3aed",
          line: { color: isDark ? "#0f172a" : "#ffffff", width: 1.5 }
        },
        hovertemplate:
          `<b>Interpolated (${pt.label})</b><br>` +
          `Energy: %{x:.5g} ${unitLabel}<br>` +
          `<b>Value</b>: %{y:.4e}<extra></extra>`
      });
    }

    // Highlight MCMEG Target Region (50 eV to 1000 eV = 5e-5 MeV to 1e-3 MeV)
    if (state.showMcmegRegion) {
      const xMin = 5.0e-5 * factor;
      const xMax = 1.0e-3 * factor;
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: xMin,
        x1: xMax,
        y0: 0,
        y1: 1,
        fillcolor: isDark ? "rgba(250, 204, 21, 0.12)" : "rgba(234, 179, 8, 0.15)",
        line: {
          color: isDark ? "rgba(250, 204, 21, 0.65)" : "rgba(202, 138, 4, 0.7)",
          width: 1.5,
          dash: "dash"
        }
      });
      annotations.push({
        x: state.logScaleX ? Math.log10(Math.sqrt(xMin * xMax)) : (xMin + xMax) / 2,
        y: 0.94,
        xref: "x",
        yref: "paper",
        text: "<b>0.05–1 keV Calculated Window</b>",
        showarrow: false,
        font: { size: 11, color: isDark ? "#fef08a" : "#854d0e" },
        bgcolor: isDark ? "rgba(30, 41, 59, 0.92)" : "rgba(254, 249, 195, 0.92)",
        bordercolor: "#eab308",
        borderpad: 4
      });
    }

    const isMobile = window.innerWidth < 640;

    const layout = {
      title: {
        text: plotTitle,
        font: {
          family: "JetBrains Mono, monospace",
          size: isMobile ? 12 : 15,
          color: isDark ? "#f8fafc" : "#0f172a"
        },
        x: 0.5,
        xanchor: "center",
        y: 0.96,
        yanchor: "top"
      },
      paper_bgcolor: isDark ? "#111827" : "#ffffff",
      plot_bgcolor: isDark ? "#0b1120" : "#ffffff",
      font: {
        color: isDark ? "#cbd5e1" : "#1e293b"
      },
      margin: isMobile
        ? { l: 58, r: 16, t: 84, b: 58 }
        : { l: 78, r: 30, t: 82, b: 68 },
      xaxis: {
        title: {
          text: `Photon Energy, ${unitLabel}`,
          standoff: 14,
          font: {
            family: "Inter, sans-serif",
            size: isMobile ? 11.5 : 13,
            color: isDark ? "#e2e8f0" : "#1e293b"
          }
        },
        type: state.logScaleX ? "log" : "linear",
        dtick: state.logScaleX ? 1 : undefined,
        exponentformat: "power",
        showgrid: true,
        gridcolor: isDark ? "#1e293b" : "#e2e8f0",
        minor: {
          dtick: state.logScaleX ? "D1" : undefined,
          showgrid: true,
          ticks: "inside",
          ticklen: 3,
          tickcolor: isDark ? "#475569" : "#94a3b8",
          gridcolor: isDark ? "#131c2e" : "#f1f5f9"
        },
        zeroline: false,
        mirror: true,
        ticks: "inside",
        ticklen: 6,
        tickcolor: isDark ? "#64748b" : "#334155",
        linecolor: isDark ? "#475569" : "#334155",
        linewidth: 1.5
      },
      yaxis: {
        title: {
          text: yAxisTitle,
          standoff: 14,
          font: {
            family: "Inter, sans-serif",
            size: isMobile ? 11.5 : 13,
            color: isDark ? "#e2e8f0" : "#1e293b"
          }
        },
        type: state.logScaleY ? "log" : "linear",
        dtick: state.logScaleY ? 1 : undefined,
        exponentformat: "power",
        showgrid: true,
        gridcolor: isDark ? "#1e293b" : "#e2e8f0",
        minor: {
          dtick: state.logScaleY ? "D1" : undefined,
          showgrid: true,
          ticks: "inside",
          ticklen: 3,
          tickcolor: isDark ? "#475569" : "#94a3b8",
          gridcolor: isDark ? "#131c2e" : "#f1f5f9"
        },
        zeroline: false,
        mirror: true,
        ticks: "inside",
        ticklen: 6,
        tickcolor: isDark ? "#64748b" : "#334155",
        linecolor: isDark ? "#475569" : "#334155",
        linewidth: 1.5
      },
      legend: {
        orientation: "h",
        yanchor: "bottom",
        y: 1.02,
        xanchor: "center",
        x: 0.5,
        bgcolor: "rgba(0,0,0,0)",
        font: { size: isMobile ? 10.5 : 12, color: isDark ? "#e2e8f0" : "#1e293b" }
      },
      shapes: shapes,
      annotations: annotations,
      hovermode: "closest"
    };

    const config = {
      responsive: true,
      displaylogo: false,
      toImageButtonOptions: {
        format: "png",
        filename: state.compareMode
          ? `MCMEG_Compare_Au_Water_${state.comparePlotType}`
          : `MCMEG_${primaryMat.id}_muen_rho`,
        height: 750,
        width: 1100,
        scale: 2
      }
    };

    Plotly.react(plotContainer, traces, layout, config);
  }

  // Render Data Table (HTML Table format & NIST ASCII format — without Edge or μ/ρ columns)
  function renderDataTable() {
    const currentMat = getMaterialById(state.selectedId);
    const activeMat =
      currentMat && currentMat.data && currentMat.data.length > 0
        ? currentMat
        : state.category === "elemental"
        ? getMaterialById("Au")
        : getMaterialById("water");

    const htmlWrap = document.getElementById("table-html-view");
    const asciiWrap = document.getElementById("table-ascii-view");
    const theadRow = document.getElementById("data-table-thead-row");
    const rowCountBadge = document.getElementById("table-row-count");
    const tableTitle = document.getElementById("table-material-label");

    const unit = UNIT_LABELS[state.energyUnit];
    const filterStr = state.tableEnergyFilter.trim().toLowerCase();

    if (state.compareMode) {
      const matA = getPrimaryActiveMaterial();
      const matB = getCompareTargetMaterial();
      const shortA = getShortMatLabel(matA);
      const shortB = getShortMatLabel(matB);
      const ratioHeaderLabel = state.invertRatio
        ? `Ratio (${shortB} / ${shortA})`
        : `Ratio (${shortA} / ${shortB})`;

      if (tableTitle) {
        tableTitle.className = "text-emerald-700 dark:text-emerald-400 font-mono-sci";
        tableTitle.textContent = `Comparison: ${getFullMatLabel(matA)} vs. ${getFullMatLabel(matB)}`;
      }

      if (theadRow) {
        theadRow.innerHTML = `
          <th class="py-2.5 px-4 text-left">
            Energy <span class="font-mono-sci text-slate-500">(${unit})</span>
          </th>
          <th class="py-2.5 px-4 text-right">
            μ<sub>en</sub>/ρ [${shortA}] <span class="font-mono-sci text-slate-500">(cm²/g)</span>
          </th>
          <th class="py-2.5 px-4 text-right">
            μ<sub>en</sub>/ρ [${shortB}] <span class="font-mono-sci text-slate-500">(cm²/g)</span>
          </th>
          <th class="py-2.5 px-4 text-right text-amber-700">
            ${ratioHeaderLabel}
          </th>
        `;
      }

      const compRows = buildComparisonDataset().filter((row) => {
        if (!filterStr) return true;
        const eFormatted = formatEnergy(row.energy_MeV, state.energyUnit).toLowerCase();
        return eFormatted.includes(filterStr);
      });

      if (rowCountBadge) {
        rowCountBadge.textContent = `${compRows.length} points`;
      }

      if (state.tableView === "html") {
        htmlWrap.classList.remove("hidden");
        asciiWrap.classList.add("hidden");
        const tbody = document.getElementById("data-table-tbody");
        tbody.innerHTML = compRows
          .map((row) => {
            const eDisplay = formatEnergy(row.energy_MeV, state.energyUnit);
            const aDisplay = formatSci(row.muen_A, 3);
            const bDisplay = formatSci(row.muen_B, 3);
            const ratioDisplay = row.ratio !== null ? row.ratio.toFixed(4) : "—";
            return `
              <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="py-2 px-4 text-left font-mono-sci text-xs font-medium text-slate-800">
                  ${eDisplay}
                </td>
                <td class="py-2 px-4 text-right font-mono-sci text-xs text-slate-700">
                  ${aDisplay}
                </td>
                <td class="py-2 px-4 text-right font-mono-sci text-xs text-slate-700">
                  ${bDisplay}
                </td>
                <td class="py-2 px-4 text-right font-mono-sci text-xs font-bold text-emerald-700">
                  ${ratioDisplay}
                </td>
              </tr>
            `;
          })
          .join("");
      } else {
        htmlWrap.classList.add("hidden");
        asciiWrap.classList.remove("hidden");
        const asciiPre = document.getElementById("ascii-output-box");
        asciiPre.textContent = generateAsciiTable(activeMat, state.energyUnit);
      }
      return;
    }

    // Standard Single-Material Table (Energy & μ_en/ρ only)
    if (tableTitle) {
      tableTitle.className =
        activeMat.category === "elemental"
          ? "text-rose-700 dark:text-rose-400 font-mono-sci"
          : "text-sky-700 dark:text-sky-300 font-mono-sci";
      tableTitle.textContent =
        activeMat.category === "elemental"
          ? `${activeMat.name} (Z = ${activeMat.z})`
          : activeMat.name;
    }

    if (theadRow) {
      theadRow.innerHTML = `
        <th class="py-2.5 px-4 text-left">
          Energy <span id="table-energy-unit-label" class="font-mono-sci text-slate-500">(${unit})</span>
        </th>
        <th class="py-2.5 px-4 text-right">
          μ<sub>en</sub>/ρ <span class="font-mono-sci text-slate-500">(cm²/g)</span>
        </th>
      `;
    }

    const filteredRows = activeMat.data.filter((row) => {
      if (!filterStr) return true;
      const eFormatted = formatEnergy(row.energy_MeV, state.energyUnit).toLowerCase();
      return eFormatted.includes(filterStr);
    });

    if (rowCountBadge) {
      rowCountBadge.textContent = `${filteredRows.length} points`;
    }

    if (state.tableView === "html") {
      htmlWrap.classList.remove("hidden");
      asciiWrap.classList.add("hidden");

      const tbody = document.getElementById("data-table-tbody");
      tbody.innerHTML = filteredRows
        .map((row) => {
          const eDisplay = formatEnergy(row.energy_MeV, state.energyUnit);
          const muenDisplay = formatSci(row.muen_rho, 3);

          return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td class="py-2 px-4 text-left font-mono-sci text-xs font-medium text-slate-800">
                ${eDisplay}
              </td>
              <td class="py-2 px-4 text-right font-mono-sci text-xs font-bold text-slate-900">
                ${muenDisplay}
              </td>
            </tr>
          `;
        })
        .join("");
    } else {
      htmlWrap.classList.add("hidden");
      asciiWrap.classList.remove("hidden");
      const asciiPre = document.getElementById("ascii-output-box");
      asciiPre.textContent = generateAsciiTable(activeMat, state.energyUnit);
    }
  }

  // Generate NIST-style ASCII table text (Energy & μ_en/ρ, or Comparison/Ratio)
  function generateAsciiTable(mat, unit) {
    if (state.compareMode) {
      const matA = getPrimaryActiveMaterial();
      const matB = getCompareTargetMaterial();
      const shortA = getShortMatLabel(matA);
      const shortB = getShortMatLabel(matB);
      const ratioLabel = state.invertRatio ? `${shortB}/${shortA}` : `${shortA}/${shortB}`;
      const lines = [
        `# ========================================================================`,
        `# Monte Carlo Modelling Expert Group (MCMEG)`,
        `# Universidade Federal de Minas Gerais (UFMG)`,
        `# X-Ray Mass Energy-Absorption Coefficients Database`,
        `# Comparison       : ${getFullMatLabel(matA)} vs. ${getFullMatLabel(matB)}`,
        ...buildCompareProvenanceLines(matA, matB),
        `# ========================================================================`,
        `#        Energy      mu_en/rho [${shortA}]   mu_en/rho [${shortB}]   Ratio (${ratioLabel})`,
        `#         (${unit.padEnd(3, " ")})            (cm^2/g)            (cm^2/g)         (dimensionless)`,
        `# ------------------------------------------------------------------------`
      ];
      buildComparisonDataset().forEach((row) => {
        const eCol = formatSci(row.energy_MeV * UNIT_FACTORS[unit], 5).padStart(13, " ");
        const aCol = formatSci(row.muen_A, 3).padStart(18, " ");
        const bCol = formatSci(row.muen_B, 3).padStart(19, " ");
        const rCol = (row.ratio !== null ? row.ratio.toFixed(4) : "—").padStart(18, " ");
        lines.push(`  ${eCol} ${aCol} ${bCol} ${rCol}`);
      });
      return lines.join("\n");
    }

    const headerTitle =
      mat.category === "elemental"
        ? `${mat.name} (Z = ${mat.z}) — Density = ${mat.density} g/cm^3`
        : `${mat.name} — Density = ${mat.density} g/cm^3`;

    const prov = getDatasetProvenance(mat);
    const lines = [
      `# ========================================================================`,
      `# Monte Carlo Modelling Expert Group (MCMEG)`,
      `# Universidade Federal de Minas Gerais (UFMG)`,
      `# X-Ray Mass Energy-Absorption Coefficients Database`,
      `# Material         : ${headerTitle}`,
      ...prov.headerLines,
      `# ========================================================================`,
      `#        Energy       mu_en/rho`,
      `#         (${unit.padEnd(3, " ")})        (cm^2/g)`,
      `# ------------------------------------------------------------------------`
    ];

    mat.data.forEach((row) => {
      const eCol = formatSci(row.energy_MeV * UNIT_FACTORS[unit], 5).padStart(13, " ");
      const muenCol = formatSci(row.muen_rho, 3).padStart(15, " ");
      lines.push(`  ${eCol} ${muenCol}`);
    });

    return lines.join("\n");
  }

  // Log-Log Interpolation Calculator
  function runLogLogInterpolation() {
    const inputEl = document.getElementById("interp-energy-input");
    const resultEl = document.getElementById("interp-result-box");
    const rawVal = parseFloat(inputEl.value);

    const currentMat = getMaterialById(state.selectedId);
    const activeMat =
      currentMat && currentMat.data && currentMat.data.length > 0
        ? currentMat
        : state.category === "elemental"
        ? getMaterialById("Au")
        : getMaterialById("water");

    if (isNaN(rawVal) || rawVal <= 0) {
      resultEl.innerHTML = `<span class="text-rose-600 text-xs font-medium">Please enter a valid positive photon energy.</span>`;
      resultEl.classList.remove("hidden");
      return;
    }

    const targetMeV = rawVal / UNIT_FACTORS[state.energyUnit];
    const data = activeMat.data;
    const minE = data[0].energy_MeV;
    const maxE = data[data.length - 1].energy_MeV;

    if (targetMeV < minE || targetMeV > maxE) {
      const minDisp = formatEnergy(minE, state.energyUnit);
      const maxDisp = formatEnergy(maxE, state.energyUnit);
      resultEl.innerHTML = `
        <div class="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs">
          Energy <strong>${rawVal} ${state.energyUnit}</strong> is outside the currently loaded table range (${minDisp} – ${maxDisp} ${state.energyUnit}).
        </div>
      `;
      resultEl.classList.remove("hidden");
      return;
    }

    if (state.compareMode) {
      const matA = getPrimaryActiveMaterial();
      const matB = getCompareTargetMaterial();
      const shortA = getShortMatLabel(matA);
      const shortB = getShortMatLabel(matB);
      const muenA = interpolateMuenAtEnergy(matA.data, targetMeV);
      const muenB = interpolateMuenAtEnergy(matB.data, targetMeV);
      const ratioVal = state.invertRatio ? muenB / muenA : muenA / muenB;
      const ratioTitle = state.invertRatio ? `${shortB} / ${shortA}` : `${shortA} / ${shortB}`;

      state.interpolatedPoint = {
        energy_MeV: targetMeV,
        yVal: state.comparePlotType === "ratio" ? ratioVal : muenA,
        label: state.comparePlotType === "ratio" ? `Ratio (${ratioTitle})` : getFullMatLabel(matA)
      };

      resultEl.innerHTML = `
        <div class="bg-slate-900 text-white rounded-lg p-3 text-xs font-mono-sci flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-slate-400">E =</span> <strong>${rawVal} ${state.energyUnit}</strong>
          </div>
          <div class="flex flex-wrap items-center gap-4">
            <span><span class="text-slate-400">μ<sub>en</sub>/ρ [${shortA}] =</span> <strong class="text-rose-400">${formatSci(muenA, 4)}</strong> cm²/g</span>
            <span><span class="text-slate-400">μ<sub>en</sub>/ρ [${shortB}] =</span> <strong class="text-sky-300">${formatSci(muenB, 4)}</strong> cm²/g</span>
            <span><span class="text-slate-400">Ratio (${ratioTitle}) =</span> <strong class="text-emerald-400 text-sm">${ratioVal.toFixed(4)}×</strong></span>
          </div>
        </div>
      `;
      resultEl.classList.remove("hidden");
      renderLogLogChart();
      return;
    }

    const muenInterp = interpolateMuenAtEnergy(data, targetMeV);
    if (muenInterp === null) {
      resultEl.innerHTML = `<span class="text-rose-600 text-xs">Could not bracket energy for interpolation.</span>`;
      resultEl.classList.remove("hidden");
      return;
    }

    state.interpolatedPoint = {
      energy_MeV: targetMeV,
      yVal: muenInterp,
      label: activeMat.name
    };

    const interpMatColor = activeMat.category === "elemental" ? "text-rose-400" : "text-sky-300";
    resultEl.innerHTML = `
      <div class="bg-slate-900 text-white rounded-lg p-3 text-xs font-mono-sci flex flex-wrap items-center justify-between gap-2">
        <div>
          <span class="text-slate-400">Material:</span> <strong class="${interpMatColor}">${activeMat.symbol || activeMat.shortName || activeMat.name}</strong>
          <span class="mx-1.5 text-slate-600">|</span>
          <span class="text-slate-400">E =</span> <strong>${rawVal} ${state.energyUnit}</strong>
        </div>
        <div class="flex items-center gap-4">
          <span><span class="text-slate-400">μ<sub>en</sub>/ρ =</span> <strong class="text-emerald-400 text-sm">${formatSci(muenInterp, 4)}</strong> cm²/g</span>
        </div>
      </div>
    `;
    resultEl.classList.remove("hidden");
    renderLogLogChart();
  }

  function clearInterpolationResult() {
    const resultEl = document.getElementById("interp-result-box");
    if (resultEl) {
      resultEl.innerHTML = "";
      resultEl.classList.add("hidden");
    }
  }

  // Render Catalog Reference Tables (Table 1: 15 Nanoparticle Elements, Table 2: 12 Tissues & Compounds)
  function renderCatalogTables() {
    const elemTbody = document.getElementById("catalog-elemental-tbody");
    const tissTbody = document.getElementById("catalog-tissues-tbody");

    if (elemTbody) {
      elemTbody.innerHTML = DB.elementalMedia
        .map((m) => {
          const isAvail = m.status === "available";
          const prov = getDatasetProvenance(m);
          const statusShort =
            prov.regime === "mcmeg_only"
              ? `Active (MCMEG · ${prov.dsVer})`
              : prov.regime === "combined"
              ? `Active (MCMEG + NIST v1.4 · ${prov.dsVer})`
              : `Active (NIST v1.4 · ${prov.dsVer})`;
          return `
            <tr class="border-b border-slate-200 hover:bg-slate-50 transition">
              <td class="py-2.5 px-4 font-semibold text-slate-900">${m.name}</td>
              <td class="py-2.5 px-4 text-center font-mono-sci font-bold text-slate-800">${m.symbol}</td>
              <td class="py-2.5 px-4 text-center font-mono-sci text-slate-700">${m.z}</td>
              <td class="py-2.5 px-4 text-right font-mono-sci text-slate-700">${m.density.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".000")}</td>
              <td class="py-2.5 px-4 text-center">
                ${
                  isAvail
                    ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">${statusShort}</span>`
                    : `<span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">0.05–1 keV Soon</span>`
                }
              </td>
              <td class="py-2.5 px-4 text-right">
                <button
                  type="button"
                  data-jump-material="${m.id}"
                  data-jump-cat="elemental"
                  class="text-xs font-semibold text-rose-700 hover:text-rose-900 dark:text-rose-400 dark:hover:text-rose-300 underline"
                >
                  Open in Explorer →
                </button>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    if (tissTbody) {
      tissTbody.innerHTML = DB.tissuesAndCompounds
        .map((m) => {
          const isAvail = m.status === "available";
          const prov = getDatasetProvenance(m);
          const statusShort =
            prov.regime === "mcmeg_only"
              ? `Active (MCMEG · ${prov.dsVer})`
              : prov.regime === "combined"
              ? `Active (MCMEG + NIST v1.4 · ${prov.dsVer})`
              : `Active (NIST v1.4 · ${prov.dsVer})`;
          return `
            <tr class="border-b border-slate-200 hover:bg-slate-50 transition">
              <td class="py-2.5 px-4 font-semibold text-slate-900">${m.name}</td>
              <td class="py-2.5 px-4 text-right font-mono-sci text-slate-700">${m.density.toFixed(3)}</td>
              <td class="py-2.5 px-4 font-mono-sci text-xs text-slate-600">${m.composition}</td>
              <td class="py-2.5 px-4 text-center">
                ${
                  isAvail
                    ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">${statusShort}</span>`
                    : `<span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">0.05–1 keV Soon</span>`
                }
              </td>
              <td class="py-2.5 px-4 text-right">
                <button
                  type="button"
                  data-jump-material="${m.id}"
                  data-jump-cat="tissues"
                  class="text-xs font-semibold text-sky-700 hover:text-sky-900 underline"
                >
                  Open in Explorer →
                </button>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    document.querySelectorAll("[data-jump-material]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-jump-material");
        const cat = btn.getAttribute("data-jump-cat");
        state.category = cat;
        switchMainTab("explorer");
        selectMaterial(id);
      });
    });
  }

  // Switch top-level navigation tabs ('explorer', 'catalog', 'comparison', 'methodology')
  function switchMainTab(tabName) {
    state.mainTab = tabName;
    const sections = {
      explorer: document.getElementById("section-explorer"),
      catalog: document.getElementById("section-catalog"),
      comparison: document.getElementById("section-comparison"),
      methodology: document.getElementById("section-methodology")
    };
    const navBtns = {
      explorer: document.getElementById("nav-tab-explorer"),
      catalog: document.getElementById("nav-tab-catalog"),
      comparison: document.getElementById("nav-tab-comparison"),
      methodology: document.getElementById("nav-tab-methodology")
    };

    const navLabels = {
      explorer: "📈 Data & Plot Explorer",
      catalog: "📋 Material Constants",
      comparison: "📑 Reference Comparison",
      methodology: "📖 About, Methodology & Citation"
    };

    Object.keys(sections).forEach((key) => {
      if (key === tabName) {
        sections[key].classList.remove("hidden");
        navBtns[key].className =
          "w-full sm:w-auto text-center px-4 py-2 rounded-lg text-sm font-semibold transition bg-amber-500 text-slate-950 shadow-sm";
      } else {
        sections[key].classList.add("hidden");
        navBtns[key].className =
          "w-full sm:w-auto text-center px-4 py-2 rounded-lg text-sm font-medium transition text-slate-300 hover:text-white hover:bg-slate-800/70";
      }
    });

    const mobileLabel = document.getElementById("mobile-nav-current-label");
    if (mobileLabel && navLabels[tabName]) {
      mobileLabel.textContent = navLabels[tabName];
    }

    const navMenu = document.getElementById("main-nav-menu");
    const mobileChevron = document.getElementById("mobile-nav-chevron");
    const mobileToggleBtn = document.getElementById("btn-mobile-nav-toggle");
    if (navMenu && !navMenu.classList.contains("hidden")) {
      navMenu.classList.add("hidden");
      navMenu.classList.remove("flex");
      if (mobileChevron) mobileChevron.textContent = "▼";
      if (mobileToggleBtn) mobileToggleBtn.setAttribute("aria-expanded", "false");
    }

    if (tabName === "explorer" && state.selectedId) {
      renderLogLogChart();
    }
  }

  // Export & Copy handlers
  function setupExportButtons() {
    const getActiveMat = () => {
      const m = getMaterialById(state.selectedId);
      return m && m.data && m.data.length > 0
        ? m
        : state.category === "elemental"
        ? getMaterialById("Au")
        : getMaterialById("water");
    };

    const btnCopy = document.getElementById("btn-copy-table");
    const btnCsv = document.getElementById("btn-download-csv");
    const btnAscii = document.getElementById("btn-download-ascii");

    if (btnCopy) {
      btnCopy.addEventListener("click", async () => {
        const mat = getActiveMat();
        const text = generateAsciiTable(mat, state.energyUnit);
        try {
          await navigator.clipboard.writeText(text);
          const orig = btnCopy.innerHTML;
          btnCopy.innerHTML = `✓ Copied!`;
          setTimeout(() => {
            btnCopy.innerHTML = orig;
          }, 1800);
        } catch (_) {}
      });
    }

    if (btnCsv) {
      btnCsv.addEventListener("click", () => {
        const mat = getActiveMat();
        const factor = UNIT_FACTORS[state.energyUnit];
        const dbVer = (DB.metadata && DB.metadata.version) || "1.0";
        let rows = [];
        let filename = "";

        if (state.compareMode) {
          const matA = getPrimaryActiveMaterial();
          const matB = getCompareTargetMaterial();
          const shortA = getShortMatLabel(matA);
          const shortB = getShortMatLabel(matB);
          const ratioColName = state.invertRatio ? `ratio_${shortB}_${shortA}` : `ratio_${shortA}_${shortB}`;
          const metaLines = [
            `# MCMEG - UFMG | X-Ray Mass Energy-Absorption Coefficients Database`,
            `# Comparison       : ${getFullMatLabel(matA)} vs. ${getFullMatLabel(matB)}`,
            ...buildCompareProvenanceLines(matA, matB)
          ];
          rows = [
            ...metaLines,
            `energy_${state.energyUnit},muen_rho_${shortA}_cm2_g,muen_rho_${shortB}_cm2_g,${ratioColName}`,
            ...buildComparisonDataset().map(
              (r) =>
                `${formatSci(r.energy_MeV * factor, 5)},${formatSci(
                  r.muen_A,
                  3
                )},${formatSci(r.muen_B, 3)},${
                  r.ratio !== null ? r.ratio.toFixed(5) : ""
                }`
            )
          ];
          filename = `MCMEG_Compare_${matA.id}_${matB.id}_${state.energyUnit}_v${dbVer}.csv`;
        } else {
          const prov = getDatasetProvenance(mat);
          const metaLines = [
            `# MCMEG - UFMG | X-Ray Mass Energy-Absorption Coefficients Database`,
            `# Material         : ${getFullMatLabel(mat)}`,
            ...prov.headerLines
          ];
          rows = [
            ...metaLines,
            `energy_${state.energyUnit},muen_rho_cm2_g`,
            ...mat.data.map(
              (r) =>
                `${formatSci(r.energy_MeV * factor, 5)},${formatSci(r.muen_rho, 3)}`
            )
          ];
          filename = `MCMEG_${mat.id}_${state.energyUnit}_v${prov.dsVer}.csv`;
        }

        const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (btnAscii) {
      btnAscii.addEventListener("click", () => {
        const mat = getActiveMat();
        const text = generateAsciiTable(mat, state.energyUnit);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const dbVer = (DB.metadata && DB.metadata.version) || "1.0";
        if (state.compareMode) {
          const matA = getPrimaryActiveMaterial();
          const matB = getCompareTargetMaterial();
          a.download = `MCMEG_Compare_${matA.id}_${matB.id}_v${dbVer}_ASCII.txt`;
        } else {
          const prov = getDatasetProvenance(mat);
          a.download = `MCMEG_${mat.id}_v${prov.dsVer}_ASCII.txt`;
        }
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    const btnCopyBibtex = document.getElementById("btn-copy-bibtex");
    if (btnCopyBibtex) {
      btnCopyBibtex.addEventListener("click", async () => {
        const bib = document.getElementById("bibtex-code").textContent;
        try {
          await navigator.clipboard.writeText(bib);
          const orig = btnCopyBibtex.textContent;
          btnCopyBibtex.textContent = "✓ BibTeX Copied!";
          setTimeout(() => {
            btnCopyBibtex.textContent = orig;
          }, 1800);
        } catch (_) {}
      });
    }
  }

  // Initialize Event Listeners
  function init() {
    applyTheme();

    const btnTheme = document.getElementById("btn-theme-toggle");
    if (btnTheme) {
      btnTheme.addEventListener("click", () => {
        state.darkMode = !state.darkMode;
        applyTheme();
        if (state.selectedId) {
          renderLogLogChart();
        }
      });
    }

    const btnMobileNavToggle = document.getElementById("btn-mobile-nav-toggle");
    const mainNavMenu = document.getElementById("main-nav-menu");
    const mobileNavChevron = document.getElementById("mobile-nav-chevron");
    if (btnMobileNavToggle && mainNavMenu) {
      btnMobileNavToggle.addEventListener("click", () => {
        const isHidden = mainNavMenu.classList.contains("hidden");
        if (isHidden) {
          mainNavMenu.classList.remove("hidden");
          mainNavMenu.classList.add("flex");
          if (mobileNavChevron) mobileNavChevron.textContent = "▲";
          btnMobileNavToggle.setAttribute("aria-expanded", "true");
        } else {
          mainNavMenu.classList.add("hidden");
          mainNavMenu.classList.remove("flex");
          if (mobileNavChevron) mobileNavChevron.textContent = "▼";
          btnMobileNavToggle.setAttribute("aria-expanded", "false");
        }
      });
    }

    document
      .getElementById("nav-tab-explorer")
      .addEventListener("click", () => switchMainTab("explorer"));
    document
      .getElementById("nav-tab-catalog")
      .addEventListener("click", () => switchMainTab("catalog"));
    document
      .getElementById("nav-tab-comparison")
      .addEventListener("click", () => switchMainTab("comparison"));
    document
      .getElementById("nav-tab-methodology")
      .addEventListener("click", () => switchMainTab("methodology"));

    // Collapsible table bars (Material Constants, etc.)
    document.querySelectorAll("[data-accordion-target]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-accordion-target");
        const targetEl = document.getElementById(targetId);
        const chevron = btn.querySelector("[data-accordion-chevron]");
        if (!targetEl) return;

        const isHidden = targetEl.classList.contains("hidden");
        targetEl.classList.toggle("hidden", !isHidden);
        btn.setAttribute("aria-expanded", String(isHidden));
        if (chevron) {
          chevron.textContent = isHidden ? "▲" : "▼";
        }
      });
    });

    document.getElementById("cat-btn-elemental").addEventListener("click", () => {
      state.category = "elemental";
      renderMaterialSelector();
    });

    document.getElementById("cat-btn-tissues").addEventListener("click", () => {
      state.category = "tissues";
      renderMaterialSelector();
    });

    const btnViewList = document.getElementById("view-btn-list");
    const btnViewPt = document.getElementById("view-btn-periodic");
    btnViewList.addEventListener("click", () => {
      state.selectorView = "list";
      btnViewList.className = "px-2.5 py-1 rounded text-xs font-semibold bg-slate-900 text-white";
      btnViewPt.className = "px-2.5 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-200";
      renderMaterialSelector();
    });
    btnViewPt.addEventListener("click", () => {
      state.selectorView = "periodic";
      btnViewPt.className = "px-2.5 py-1 rounded text-xs font-semibold bg-slate-900 text-white";
      btnViewList.className = "px-2.5 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-200";
      renderMaterialSelector();
    });

    const searchInput = document.getElementById("material-search-input");
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      if (state.selectorView === "periodic" && state.searchQuery.trim() !== "") {
        state.selectorView = "list";
      }
      renderMaterialSelector();
    });

    document.querySelectorAll("[data-unit-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.energyUnit = btn.getAttribute("data-unit-btn");
        document.querySelectorAll("[data-unit-btn]").forEach((b) => {
          const isCurrent = b.getAttribute("data-unit-btn") === state.energyUnit;
          b.className = isCurrent
            ? "px-2.5 py-1 rounded text-xs font-mono-sci font-bold bg-slate-900 text-amber-400 shadow-sm"
            : "px-2.5 py-1 rounded text-xs font-mono-sci font-medium text-slate-600 hover:bg-slate-200";
        });
        document.getElementById("interp-unit-badge").textContent = state.energyUnit;
        renderCompareSubbar();
        renderLogLogChart();
        renderDataTable();
      });
    });

    // Compare with another material checkbox, category buttons, material select & sub-toolbar buttons
    const chkCompare = document.getElementById("chk-compare-mode");
    chkCompare.addEventListener("change", (e) => {
      state.compareMode = e.target.checked;
      state.interpolatedPoint = null;
      clearInterpolationResult();
      renderCompareSubbar();
      renderLogLogChart();
      renderDataTable();
    });

    const btnCompCatElem = document.getElementById("btn-compare-cat-elemental");
    const btnCompCatTiss = document.getElementById("btn-compare-cat-tissues");
    const selectCompMat = document.getElementById("select-compare-material");

    if (btnCompCatElem) {
      btnCompCatElem.addEventListener("click", () => {
        state.compareCategory = "elemental";
        const avail = DB.elementalMedia.find(
          (m) => m.status === "available" || (m.data && m.data.length > 0)
        );
        if (avail) state.compareTargetId = avail.id;
        state.interpolatedPoint = null;
        clearInterpolationResult();
        renderCompareSubbar();
        renderLogLogChart();
        renderDataTable();
      });
    }

    if (btnCompCatTiss) {
      btnCompCatTiss.addEventListener("click", () => {
        state.compareCategory = "tissues";
        const avail = DB.tissuesAndCompounds.find(
          (m) => m.status === "available" || (m.data && m.data.length > 0)
        );
        if (avail) state.compareTargetId = avail.id;
        state.interpolatedPoint = null;
        clearInterpolationResult();
        renderCompareSubbar();
        renderLogLogChart();
        renderDataTable();
      });
    }

    if (selectCompMat) {
      selectCompMat.addEventListener("change", async (e) => {
        const targetId = e.target.value;
        const targetMat = getMaterialById(targetId);
        if (targetMat) {
          await tryLoadCsvForMaterial(targetMat);
        }
        state.compareTargetId = targetId;
        state.interpolatedPoint = null;
        clearInterpolationResult();
        renderCompareSubbar();
        renderLogLogChart();
        renderDataTable();
      });
    }

    document.getElementById("btn-compare-overlay").addEventListener("click", () => {
      state.comparePlotType = "overlay";
      state.interpolatedPoint = null;
      clearInterpolationResult();
      renderCompareSubbar();
      renderLogLogChart();
    });

    document.getElementById("btn-compare-ratio").addEventListener("click", () => {
      state.comparePlotType = "ratio";
      state.interpolatedPoint = null;
      clearInterpolationResult();
      renderCompareSubbar();
      renderLogLogChart();
    });

    document.getElementById("btn-swap-ratio").addEventListener("click", () => {
      state.invertRatio = !state.invertRatio;
      state.interpolatedPoint = null;
      clearInterpolationResult();
      renderCompareSubbar();
      renderLogLogChart();
      renderDataTable();
    });

    // Axis & Region toggles
    document.getElementById("chk-show-mcmeg-region").addEventListener("change", (e) => {
      state.showMcmegRegion = e.target.checked;
      renderLogLogChart();
    });
    document.getElementById("chk-log-axes").addEventListener("change", (e) => {
      state.logScaleX = e.target.checked;
      state.logScaleY = e.target.checked;
      renderLogLogChart();
    });

    // Interpolation calculator
    document
      .getElementById("btn-run-interp")
      .addEventListener("click", runLogLogInterpolation);
    document
      .getElementById("interp-energy-input")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter") runLogLogInterpolation();
      });

    // Table format toggle (HTML vs ASCII)
    const btnTabHtml = document.getElementById("btn-table-html");
    const btnTabAscii = document.getElementById("btn-table-ascii");
    btnTabHtml.addEventListener("click", () => {
      state.tableView = "html";
      btnTabHtml.className = "px-3 py-1 rounded-md text-xs font-semibold bg-slate-900 text-white";
      btnTabAscii.className = "px-3 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200";
      renderDataTable();
    });
    btnTabAscii.addEventListener("click", () => {
      state.tableView = "ascii";
      btnTabAscii.className = "px-3 py-1 rounded-md text-xs font-semibold bg-slate-900 text-white";
      btnTabHtml.className = "px-3 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200";
      renderDataTable();
    });

    // Table energy filter
    document.getElementById("table-filter-input").addEventListener("input", (e) => {
      state.tableEnergyFilter = e.target.value;
      renderDataTable();
    });

    setupExportButtons();
    renderCatalogTables();
    renderMaterialSelector();

    const footerVerEl = document.getElementById("footer-db-version");
    const footerDateEl = document.getElementById("footer-db-updated");
    if (footerVerEl && DB.metadata && DB.metadata.version) {
      footerVerEl.textContent = `MCMEG Database v${DB.metadata.version}`;
    }
    if (footerDateEl && DB.metadata && DB.metadata.releaseDate) {
      footerDateEl.textContent = `Updated ${DB.metadata.releaseDate}`;
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.mainTab === "explorer" && state.selectedId) {
          renderLogLogChart();
        }
      }, 150);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
