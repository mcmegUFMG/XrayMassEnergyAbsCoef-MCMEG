# Estrutura de Dados — MCMEG X-Ray Mass Energy-Absorption Coefficients

Esta pasta armazena as tabelas de coeficientes para **Elemental Media** (nanopartículas) e **Tissues & Compounds** (água e tecidos da ICRU Report 44).

## Pastas

- `data/elemental/` — Arquivos `.csv` para os 15 elementos puros (ex.: `Au_gold.csv`, `Fe_iron.csv`, `Gd_gadolinium.csv`, etc.).
- `data/tissues/` — Arquivos `.csv` para a Água e os 11 tecidos da ICRU 44 (ex.: `water.csv`, `adipose_tissue.csv`, `bone_cortical.csv`, etc.).

## Formato do CSV

Cada arquivo `.csv` segue o cabeçalho padrão:

```csv
edge,energy_MeV,mu_rho_cm2_g,muen_rho_cm2_g
,1.00000E-03,4.652E+03,4.639E+03
M5,2.20570E-03,9.971E+02,9.836E+02
```

- `edge` *(opcional)*: Designação da camada/subcamada da borda de absorção atômica (`K`, `L1`, `L2`, `L3`, `M1`..`M5`, `N1`..`N7`, etc.). Deixe vazio para energias normais da grade.
- `energy_MeV` *(ou `energy_eV` / `energy_keV`)*: Energia do fóton. O sistema converte automaticamente entre **eV**, **keV** e **MeV** na interface.
- `mu_rho_cm2_g` *(opcional)*: Coeficiente de atenuação em massa $\mu/\rho$ ($\text{cm}^2/\text{g}$). Caso seus dados de 50 eV – 1000 eV contenham apenas $\mu_{\text{en}}/\rho$, basta deixar esta coluna vazia.
- `muen_rho_cm2_g`: Coeficiente de absorção de energia em massa $\mu_{\text{en}}/\rho$ ($\text{cm}^2/\text{g}$).
