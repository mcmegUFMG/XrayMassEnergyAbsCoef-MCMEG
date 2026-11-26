"""
Encrypt MCMEG sub-keV (0.05 - 1.0 keV) CSV datasets into a static AES-256-GCM
payload (`js/subkev_encrypted.js`) for password-protected reviewer access on
GitHub Pages without exposing raw data or the passphrase in the repository.

Usage:
    python scripts/encrypt_subkev.py
    (or set MCMEG_SUBKEV_KEY in the environment for non-interactive runs)
"""

from __future__ import annotations

import base64
import getpass
import json
import os
import re
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_JS = ROOT_DIR / "js" / "subkev_encrypted.js"

SUBKEV_DIRS = [
    ROOT_DIR / "data" / "elemental" / "sub-keV_MCMEG",
    ROOT_DIR / "data" / "tissues" / "sub-keV_MCMEG",
]

# Maps normalized CSV material names / filename keywords to material IDs in js/data.js
NAME_TO_ID = {
    # Elemental Media
    "iron": "Fe",
    "fe": "Fe",
    "cobalt": "Co",
    "co": "Co",
    "nickel": "Ni",
    "ni": "Ni",
    "copper": "Cu",
    "cu": "Cu",
    "zinc": "Zn",
    "zn": "Zn",
    "palladium": "Pd",
    "pd": "Pd",
    "silver": "Ag",
    "ag": "Ag",
    "iodine": "I",
    "i": "I",
    "gadolinium": "Gd",
    "gd": "Gd",
    "hafnium": "Hf",
    "hf": "Hf",
    "tantalum": "Ta",
    "ta": "Ta",
    "tungsten": "W",
    "w": "W",
    "platinum": "Pt",
    "pt": "Pt",
    "gold": "Au",
    "au": "Au",
    "bismuth": "Bi",
    "bi": "Bi",
    # Tissues & Compounds
    "water": "water",
    "liquid water": "water",
    "adipose": "adipose_tissue",
    "adipose tissue": "adipose_tissue",
    "blood": "blood_whole",
    "blood whole": "blood_whole",
    "whole blood": "blood_whole",
    "bone": "bone_cortical",
    "bone cortical": "bone_cortical",
    "cortical bone": "bone_cortical",
    "brain": "brain",
    "breast": "breast_tissue",
    "breast tissue": "breast_tissue",
    "eye lens": "eye_lens",
    "lens": "eye_lens",
    "lung": "lung_tissue",
    "lung tissue": "lung_tissue",
    "muscle": "muscle_skeletal",
    "muscle skeletal": "muscle_skeletal",
    "skeletal muscle": "muscle_skeletal",
    "ovary": "ovary",
    "cpe estudo ovary": "ovary",
    "testis": "testis",
    "soft tissue": "soft_tissue_4comp",
    "soft tissue four comp": "soft_tissue_4comp",
}

ITERATIONS = 600_000


def resolve_material_id(csv_path: Path, header_material: str) -> str:
    candidates = [
        header_material,
        csv_path.stem,
    ]
    for raw in candidates:
        cleaned = re.sub(r"[^a-z0-9]+", " ", raw.lower()).strip()
        if cleaned in NAME_TO_ID:
            return NAME_TO_ID[cleaned]
        for token in cleaned.split():
            if token in NAME_TO_ID and len(token) > 1:
                return NAME_TO_ID[token]
    raise ValueError(
        f"Could not map CSV '{csv_path.name}' (Material='{header_material}') to an ID in js/data.js"
    )


def parse_subkev_csv(csv_path: Path) -> tuple[str, dict]:
    header_material = ""
    dataset_version = "1.0"
    monte_carlo_code = "MCNP6.2"
    rows: list[dict[str, float]] = []

    with csv_path.open("r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    energy_unit_factor = 1e-3  # default: energy_keV -> MeV
    header_seen = False

    for line in lines:
        if line.startswith("#"):
            m_mat = re.match(r"^#\s*Material\s*:\s*(.+)$", line, re.IGNORECASE)
            m_ver = re.match(r"^#\s*Dataset\s+Version\s*:\s*v?(.+)$", line, re.IGNORECASE)
            m_mc = re.match(r"^#\s*Monte\s+Carlo\s+Code\s*:\s*(.+)$", line, re.IGNORECASE)
            if m_mat:
                header_material = m_mat.group(1).strip()
            elif m_ver:
                dataset_version = m_ver.group(1).strip()
            elif m_mc:
                monte_carlo_code = m_mc.group(1).strip()
            continue

        if not header_seen:
            header_seen = True
            lower_hdr = line.lower()
            if "energy_mev" in lower_hdr:
                energy_unit_factor = 1.0
            elif "energy_ev" in lower_hdr and "kev" not in lower_hdr:
                energy_unit_factor = 1e-6
            else:
                energy_unit_factor = 1e-3
            continue

        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 2:
            continue
        energy_val = float(parts[0]) * energy_unit_factor
        muen_val = float(parts[1])
        rows.append(
            {
                "energy_MeV": float(f"{energy_val:.6g}"),
                "muen_rho": muen_val,
            }
        )

    if not rows:
        raise ValueError(f"No data rows found in {csv_path}")

    mat_id = resolve_material_id(csv_path, header_material)
    entry = {
        "dataSourceLabel": "MCMEG (0.05–1 keV) + NIST Reference (1 keV–20 MeV)",
        "datasetVersion": dataset_version,
        "monteCarloCode": monte_carlo_code,
        "subKeVData": rows,
    }
    return mat_id, entry


def encrypt_payload(plaintext_obj: dict, passphrase: str) -> dict:
    salt = os.urandom(16)
    iv = os.urandom(12)

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=ITERATIONS,
    )
    key = kdf.derive(passphrase.encode("utf-8"))

    plaintext_bytes = json.dumps(
        plaintext_obj, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    ciphertext = AESGCM(key).encrypt(iv, plaintext_bytes, None)

    return {
        "version": 1,
        "algorithm": "AES-256-GCM",
        "kdf": "PBKDF2-SHA256",
        "iterations": ITERATIONS,
        "salt": base64.b64encode(salt).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }


def main() -> None:
    datasets: dict[str, dict] = {}
    for folder in SUBKEV_DIRS:
        if not folder.exists():
            continue
        for csv_file in sorted(folder.glob("*.csv")):
            mat_id, entry = parse_subkev_csv(csv_file)
            datasets[mat_id] = entry
            print(
                f"Loaded {mat_id:<18} ({len(entry['subKeVData'])} pts) from {csv_file.name}"
            )

    if not datasets:
        raise SystemExit("No sub-keV CSV files found to encrypt.")

    passphrase = os.environ.get("MCMEG_SUBKEV_KEY")
    if not passphrase:
        passphrase = getpass.getpass("Enter sub-keV encryption passphrase: ")
        confirm = getpass.getpass("Confirm passphrase: ")
        if passphrase != confirm:
            raise SystemExit("Passphrases do not match.")

    if len(passphrase) < 12:
        raise SystemExit("Passphrase must be at least 12 characters long.")

    envelope = encrypt_payload({"materials": datasets}, passphrase)

    js_content = (
        "/**\n"
        " * MCMEG - UFMG | Encrypted Sub-keV (0.05 - 1.0 keV) Dataset Payload\n"
        " * Generated by scripts/encrypt_subkev.py (AES-256-GCM / PBKDF2-SHA256).\n"
        " * Neither the plaintext data nor the passphrase is stored in this file.\n"
        " */\n"
        f"window.MCMEG_ENCRYPTED_SUBKEV = {json.dumps(envelope, indent=2)};\n"
    )
    OUTPUT_JS.write_text(js_content, encoding="utf-8")
    print(f"Wrote encrypted payload for {len(datasets)} materials to {OUTPUT_JS}")


if __name__ == "__main__":
    main()
