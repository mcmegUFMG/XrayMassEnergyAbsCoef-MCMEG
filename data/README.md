# Estrutura de Dados — MCMEG X-Ray Mass Energy-Absorption Coefficients

Esta pasta armazena as tabelas de coeficientes de absorção de energia em massa ($\mu_{\text{en}}/\rho$) para **Elemental Media** (nanopartículas) e **Tissues & Compounds** (água e tecidos da ICRU Report 44).

## Pastas

- `data/elemental/` — Arquivos `.csv` para os 15 elementos puros (ex.: `Au_gold.csv`, `Fe_iron.csv`, `Gd_gadolinium.csv`, etc.).
- `data/tissues/` — Arquivos `.csv` para a Água e os 11 tecidos da ICRU 44 (ex.: `water.csv`, `adipose_tissue.csv`, `bone_cortical.csv`, etc.).

## Formato Padrão do CSV (2 Colunas)

Cada arquivo `.csv` utiliza apenas 2 colunas (`energy_MeV` e `muen_rho_cm2_g`):

```csv
energy_MeV,muen_rho_cm2_g
1.00000E-03,4.639E+03
1.50000E-03,2.076E+03
2.00000E-03,1.125E+03
```

- `energy_MeV`: Energia do fóton em MeV (o site converte automaticamente entre **eV**, **keV** e **MeV** na interface).
- `muen_rho_cm2_g`: Coeficiente de absorção de energia em massa $\mu_{\text{en}}/\rho$ ($\text{cm}^2/\text{g}$).
