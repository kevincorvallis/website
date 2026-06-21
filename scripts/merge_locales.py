#!/usr/bin/env python3
"""Merge i18n overlay updates into fr/ko/ja locale files."""
import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "i18n"


def deep_merge(base: dict, overlay: dict) -> dict:
    for key, value in overlay.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save(path: Path, data: dict) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main() -> None:
    en = load(ROOT / "en.json")
    overlays = {
        "fr": load(ROOT / "overlays" / "fr.json"),
        "ko": load(ROOT / "overlays" / "ko.json"),
        "ja": load(ROOT / "overlays" / "ja.json"),
    }

    # Ensure new top-level sections exist in all langs (from en structure + overlay)
    for lang, overlay in overlays.items():
        target = load(ROOT / f"{lang}.json")
        deep_merge(target, overlay)
        # Copy any en-only sections missing entirely (shouldn't happen if overlay complete)
        for section in ("shredders", "spacec", "terms", "privacy"):
            if section not in target and section in en:
                target[section] = deepcopy(en[section])
        save(ROOT / f"{lang}.json", target)
        print(f"Updated {lang}.json")


if __name__ == "__main__":
    main()
