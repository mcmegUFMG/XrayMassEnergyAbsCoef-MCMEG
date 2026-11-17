# X-Ray Mass Energy-Absorption Coefficients ($\mu_{\text{en}}/\rho$) — MCMEG / UFMG

Interactive web database for **X-Ray Mass Energy-Absorption Coefficients ($\mu_{\text{en}}/\rho$)** developed by the **Monte Carlo Modeling Expert Group (MCMEG)** at the **Universidade Federal de Minas Gerais (UFMG)**.

## Scientific Scope

While the classic [NIST Standard Reference Database 126](https://www.nist.gov/pml/x-ray-mass-attenuation-coefficients) covers photon energies from **1 keV to 20 MeV**, this work evaluates $\mu_{\text{en}}/\rho$ in the low-energy photon regime from **50 eV to 1000 eV (0.05 keV – 1.0 keV)** for:

1. **Elemental Media (15 Nanoparticle Elements, 100 wt%):**
   - Fe ($Z=26$), Co ($Z=27$), Ni ($Z=28$), Cu ($Z=29$), Zn ($Z=30$), Pd ($Z=46$), Ag ($Z=47$), I ($Z=53$), Gd ($Z=64$), Hf ($Z=72$), Ta ($Z=73$), W ($Z=74$), Pt ($Z=78$), Au ($Z=79$), and Bi ($Z=83$).
2. **Tissues & Compounds (Water + 11 ICRU Report 44 Human Tissues):**
   - Liquid Water, Adipose Tissue, Whole Blood, Cortical Bone, Brain (Grey/White Matter), Breast Tissue, Eye Lens, Lung Tissue, Skeletal Muscle, Ovary, Testis, and Soft Tissue (Four-Component).

> **Current Status:** The interactive portal is pre-populated with official NIST reference datasets for **Gold (`Au`, $Z=79$)** in *Elemental Media* and **Liquid Water (`H₂O`)** in *Tissues & Compounds* as functional examples while the 50 eV – 1000 eV MCMEG tables are finalized for publication.

---

## Project Structure

```text
├── index.html                  # Main interactive single-page application
├── assets/
│   └── logos/
│       ├── logo-mcmeg.png      # MCMEG official logo
│       └── ufmg-logo.png       # UFMG official logo
├── css/
│   └── styles.css              # Custom scientific theme & periodic table styles
├── js/
│   ├── data.js                 # Catalog metadata & embedded datasets
│   └── app.js                  # Interactive Log-Log Plotly chart, interpolator & tables
└── data/
    ├── README.md               # Instructions for adding new CSV tables
    ├── elemental/
    │   └── Au_gold.csv         # Gold (Z=79) tabular dataset
    └── tissues/
        └── water.csv           # Liquid Water tabular dataset
```
