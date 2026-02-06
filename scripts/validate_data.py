#!/usr/bin/env python3
# validate_data.py
#
# Minimal, strict validator for the Japanese SRS App language datasets.
#
# What it validates:
# - JSON Schema validation for:
#   - data/verbs/verbs.v2.jsonl (line-by-line, each line is one verb record)
#   - data/conjugations/conjugation_templates.v2.json
#   - data/exceptions/verb_exceptions.v1.json
#   - data/ui_text/example_sentences.v3.json
# - Additional integrity checks:
#   - duplicate verb IDs
#   - kana is hiragana-only
#   - gloss_en is a non-empty array
#   - ambiguous_kana references real verb IDs
#   - special_cases keys reference real verbs (by kana)
#   - example_sentences character_ids reference real characters
#   - example_sentences template ids exist and cover active templates
#
# Usage:
#   python scripts/validate_data.py --root .
#
# Requirements:
#   pip install jsonschema

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    from jsonschema import Draft202012Validator
except Exception:
    print("ERROR: Missing dependency 'jsonschema'. Install with: pip install jsonschema", file=sys.stderr)
    raise

HIRAGANA_RE = re.compile(r"^[ぁ-ゟ]+$")  # hiragana + small kana

@dataclass
class Issue:
    severity: str  # "ERROR" or "WARN"
    where: str
    message: str

def find_project_root(start: Path) -> Path:
    """Walk upward until we see 'schemas/' and 'data/' folders."""
    cur = start.resolve()
    for _ in range(10):
        if (cur / "schemas").is_dir() and (cur / "data").is_dir():
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    return start.resolve()

def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))

def build_validator(schema_path: Path) -> Draft202012Validator:
    schema = load_json(schema_path)
    return Draft202012Validator(schema)

def validate_json(validator: Draft202012Validator, data: Any, where: str, issues: List[Issue]) -> None:
    for err in sorted(validator.iter_errors(data), key=str):
        issues.append(Issue("ERROR", where, err.message))

def validate_jsonl_records(
    schema_validator: Draft202012Validator,
    jsonl_path: Path,
    issues: List[Issue],
) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    records: List[Dict[str, Any]] = []
    by_id: Dict[str, Dict[str, Any]] = {}

    if not jsonl_path.exists():
        issues.append(Issue("ERROR", str(jsonl_path), "File not found."))
        return records, by_id

    with jsonl_path.open("r", encoding="utf-8") as f:
        for lineno, raw in enumerate(f, start=1):
            line = raw.strip()
            if not line:
                continue
            where = f"{jsonl_path}:{lineno}"
            try:
                rec = json.loads(line)
            except Exception as e:
                issues.append(Issue("ERROR", where, f"Invalid JSON: {e}"))
                continue

            # Schema validation
            validate_json(schema_validator, rec, where, issues)

            # Basic integrity checks (align with DATA_SPEC.md)
            kana = rec.get("kana")
            if not isinstance(kana, str) or not kana:
                issues.append(Issue("ERROR", where, "Missing or invalid 'kana'."))
            elif not HIRAGANA_RE.match(kana):
                issues.append(Issue("ERROR", where, f"'kana' must be hiragana-only. Got: {kana!r}"))

            gloss = rec.get("gloss_en")
            if not isinstance(gloss, list) or len(gloss) == 0 or not all(isinstance(x, str) and x.strip() for x in gloss):
                issues.append(Issue("ERROR", where, "'gloss_en' must be a non-empty array of strings."))

            rid = rec.get("id")
            if not isinstance(rid, str) or not rid:
                issues.append(Issue("ERROR", where, "Missing or invalid 'id'."))
            else:
                if rid in by_id:
                    issues.append(Issue("ERROR", where, f"Duplicate id: {rid!r}"))
                else:
                    by_id[rid] = rec

            records.append(rec)

    # Soft warning: if kana appears multiple times, disambiguation should be present for each entry.
    kana_counts: Dict[str, int] = {}
    for r in records:
        k = r.get("kana")
        if isinstance(k, str):
            kana_counts[k] = kana_counts.get(k, 0) + 1
    for r in records:
        k = r.get("kana")
        if isinstance(k, str) and kana_counts.get(k, 0) > 1:
            if not r.get("disambiguation"):
                issues.append(Issue("WARN", str(jsonl_path), f"kana {k!r} appears multiple times but an entry has null/empty disambiguation (id={r.get('id')})."))

    return records, by_id

def validate_exceptions_against_verbs(
    exceptions: Dict[str, Any],
    verbs_by_id: Dict[str, Dict[str, Any]],
    verbs_records: List[Dict[str, Any]],
    issues: List[Issue],
    where: str,
) -> None:
    # Build quick lookup by kana
    verbs_by_kana: Dict[str, List[Dict[str, Any]]] = {}
    for r in verbs_records:
        k = r.get("kana")
        if isinstance(k, str):
            verbs_by_kana.setdefault(k, []).append(r)

    # irregular_verbs should exist in verbs list (by kana)
    for k in exceptions.get("irregular_verbs", []):
        if k not in verbs_by_kana:
            issues.append(Issue("WARN", where, f"irregular_verbs includes {k!r} but no verb record with kana={k!r} exists."))

    # ambiguous_kana must reference existing IDs
    ambiguous = exceptions.get("ambiguous_kana", {}) or {}
    if isinstance(ambiguous, dict):
        for kana, ids in ambiguous.items():
            if not isinstance(ids, list):
                issues.append(Issue("ERROR", where, f"ambiguous_kana[{kana!r}] must be an array of ids."))
                continue
            for rid in ids:
                if rid not in verbs_by_id:
                    issues.append(Issue("ERROR", where, f"ambiguous_kana[{kana!r}] references missing id: {rid!r}"))

    # special_cases: keys are kana; ensure kana exists in verbs list.
    special = exceptions.get("special_cases", {}) or {}
    if isinstance(special, dict):
        for section_name, mapping in special.items():
            if not isinstance(mapping, dict):
                issues.append(Issue("ERROR", where, f"special_cases.{section_name} must be an object of kana->string."))
                continue
            for kana in mapping.keys():
                if kana not in verbs_by_kana:
                    issues.append(Issue("WARN", where, f"special_cases.{section_name} includes {kana!r} but no verb record with kana={kana!r} exists."))

def validate_example_sentences(
    example_sentences: Dict[str, Any],
    verbs_by_id: Dict[str, Dict[str, Any]],
    templates: List[Dict[str, Any]],
    issues: List[Issue],
    where: str,
) -> None:
    if not isinstance(example_sentences, dict):
        issues.append(Issue("ERROR", where, "example_sentences must be an object."))
        return

    # characters: build set of ids
    characters = example_sentences.get("characters", [])
    character_ids: set[str] = set()
    if isinstance(characters, list):
        for idx, c in enumerate(characters):
            if not isinstance(c, dict):
                issues.append(Issue("ERROR", where, f"characters[{idx}] must be an object."))
                continue
            cid = c.get("id")
            if not isinstance(cid, str) or not cid:
                issues.append(Issue("ERROR", where, f"characters[{idx}].id must be a non-empty string."))
                continue
            if cid in character_ids:
                issues.append(Issue("ERROR", where, f"Duplicate character id: {cid!r}"))
            character_ids.add(cid)
    else:
        issues.append(Issue("ERROR", where, "characters must be an array."))

    # templates coverage checks
    active_template_ids: set[str] = set()
    for t in templates:
        tid = t.get("id")
        if isinstance(tid, str) and t.get("active") is True:
            active_template_ids.add(tid)

    tpl_map = example_sentences.get("templates", {})
    if not isinstance(tpl_map, dict):
        issues.append(Issue("ERROR", where, "templates must be an object."))
        return

    example_template_ids = set(k for k in tpl_map.keys() if isinstance(k, str))
    missing = sorted(active_template_ids - example_template_ids)
    extra = sorted(example_template_ids - set(t.get("id") for t in templates if isinstance(t.get("id"), str)))
    for tid in missing:
        issues.append(Issue("ERROR", where, f"Missing example sentences for active template_id: {tid!r}"))
    for tid in extra:
        issues.append(Issue("WARN", where, f"example_sentences has unknown template_id (not in templates file): {tid!r}"))

    # character_ids referenced by examples must exist
    lexicon = example_sentences.get("lexicon", {}) or {}
    if lexicon is not None and not isinstance(lexicon, dict):
        issues.append(Issue("ERROR", where, "lexicon must be an object if present."))
        lexicon = {}

    placeholder_re = re.compile(r"\{([A-Za-z0-9_]+)\}")

    for template_id, tpl in tpl_map.items():
        if not isinstance(tpl, dict):
            issues.append(Issue("ERROR", where, f"templates[{template_id!r}] must be an object."))
            continue
        by_class = tpl.get("by_verb_class", {})
        if not isinstance(by_class, dict):
            issues.append(Issue("ERROR", where, f"templates[{template_id!r}].by_verb_class must be an object."))
            continue
        for verb_class, examples in by_class.items():
            if not isinstance(examples, list):
                issues.append(Issue("ERROR", where, f"templates[{template_id!r}].by_verb_class[{verb_class!r}] must be an array."))
                continue
            for i, ex in enumerate(examples):
                if not isinstance(ex, dict):
                    issues.append(Issue("ERROR", where, f"templates[{template_id!r}].by_verb_class[{verb_class!r}][{i}] must be an object."))
                    continue
                text = ex.get("text")
                if isinstance(text, str):
                    for token in placeholder_re.findall(text):
                        if token == "V":
                            continue
                        if token not in lexicon:
                            issues.append(Issue("ERROR", where, f"Unknown placeholder {{{token}}} in templates[{template_id!r}].by_verb_class[{verb_class!r}][{i}].text"))
                cids = ex.get("character_ids", [])
                if not isinstance(cids, list):
                    issues.append(Issue("ERROR", where, f"templates[{template_id!r}].by_verb_class[{verb_class!r}][{i}].character_ids must be an array."))
                    continue
                for cid in cids:
                    if cid not in character_ids:
                        issues.append(Issue("ERROR", where, f"templates[{template_id!r}].by_verb_class[{verb_class!r}][{i}] references unknown character_id: {cid!r}"))

        # overrides: verb_ids must exist; examples must reference valid characters
        overrides = tpl.get("overrides", []) or []
        if overrides:
            if not isinstance(overrides, list):
                issues.append(Issue("ERROR", where, f"templates[{template_id!r}].overrides must be an array."))
            else:
                used_verb_ids: set[str] = set()
                for j, ov in enumerate(overrides):
                    if not isinstance(ov, dict):
                        issues.append(Issue("ERROR", where, f"templates[{template_id!r}].overrides[{j}] must be an object."))
                        continue
                    vids = ov.get("verb_ids", [])
                    if not isinstance(vids, list) or not vids:
                        issues.append(Issue("ERROR", where, f"templates[{template_id!r}].overrides[{j}].verb_ids must be a non-empty array."))
                        continue
                    for vid in vids:
                        if vid not in verbs_by_id:
                            issues.append(Issue("ERROR", where, f"templates[{template_id!r}].overrides[{j}] references missing verb id: {vid!r}"))
                        if vid in used_verb_ids:
                            issues.append(Issue("ERROR", where, f"templates[{template_id!r}] has duplicate override for verb id: {vid!r}"))
                        used_verb_ids.add(vid)

                    if ov.get("disabled") is True:
                        continue
                    examples = ov.get("examples")
                    if examples is None:
                        continue
                    if not isinstance(examples, list):
                        issues.append(Issue("ERROR", where, f"templates[{template_id!r}].overrides[{j}].examples must be an array."))
                        continue
                    for k, ex in enumerate(examples):
                        if not isinstance(ex, dict):
                            issues.append(Issue("ERROR", where, f"templates[{template_id!r}].overrides[{j}].examples[{k}] must be an object."))
                            continue
                        text = ex.get("text")
                        if isinstance(text, str):
                            for token in placeholder_re.findall(text):
                                if token == "V":
                                    continue
                                if token not in lexicon:
                                    issues.append(Issue("ERROR", where, f"Unknown placeholder {{{token}}} in templates[{template_id!r}].overrides[{j}].examples[{k}].text"))
                        cids = ex.get("character_ids", [])
                        if not isinstance(cids, list):
                            issues.append(Issue("ERROR", where, f"templates[{template_id!r}].overrides[{j}].examples[{k}].character_ids must be an array."))
                            continue
                        for cid in cids:
                            if cid not in character_ids:
                                issues.append(Issue("ERROR", where, f"templates[{template_id!r}].overrides[{j}].examples[{k}] references unknown character_id: {cid!r}"))

def print_report(issues: List[Issue], verbs_count: int | None = None) -> None:
    errors = [i for i in issues if i.severity == "ERROR"]
    warns = [i for i in issues if i.severity == "WARN"]

    print("\n=== DATA VALIDATION REPORT ===")
    if verbs_count is not None:
        print(f"Verbs loaded: {verbs_count}")
    print(f"Errors: {len(errors)}")
    print(f"Warnings: {len(warns)}\n")

    for i in errors:
        print(f"[ERROR] {i.where} - {i.message}")
    for i in warns:
        print(f"[WARN ] {i.where} - {i.message}")

    if not issues:
        print("All checks passed.")

def main() -> int:
    ap = argparse.ArgumentParser(description="Validate language data files for Japanese SRS App.")
    ap.add_argument("--root", default=".", help="Project root containing 'data/' and 'schemas/' (default: current dir)")
    args = ap.parse_args()

    root = find_project_root(Path(args.root))
    schemas_dir = root / "schemas"
    data_dir = root / "data"

    issues: List[Issue] = []

    # Paths
    verbs_schema_path = schemas_dir / "verbs.schema.json"
    templates_schema_path = schemas_dir / "conjugation_templates.schema.json"
    exceptions_schema_path = schemas_dir / "exceptions.schema.json"
    example_sentences_schema_path = schemas_dir / "example_sentences.schema.json"

    verbs_jsonl_path = data_dir / "verbs" / "verbs.v2.jsonl"
    templates_json_path = data_dir / "conjugations" / "conjugation_templates.v2.json"
    exceptions_json_path = data_dir / "exceptions" / "verb_exceptions.v1.json"
    example_sentences_json_path = data_dir / "ui_text" / "example_sentences.v3.json"

    # Ensure schemas exist
    for p in [verbs_schema_path, templates_schema_path, exceptions_schema_path, example_sentences_schema_path]:
        if not p.exists():
            issues.append(Issue("ERROR", str(p), "Schema file not found."))
    if any(i.severity == "ERROR" for i in issues):
        print_report(issues)
        return 1

    verbs_validator = build_validator(verbs_schema_path)
    templates_validator = build_validator(templates_schema_path)
    exceptions_validator = build_validator(exceptions_schema_path)
    example_sentences_validator = build_validator(example_sentences_schema_path)

    # Validate verbs JSONL (line-by-line)
    verbs_records, verbs_by_id = validate_jsonl_records(verbs_validator, verbs_jsonl_path, issues)

    # Validate conjugation templates JSON
    templates = None
    if templates_json_path.exists():
        try:
            templates = load_json(templates_json_path)
            validate_json(templates_validator, templates, str(templates_json_path), issues)
        except Exception as e:
            issues.append(Issue("ERROR", str(templates_json_path), f"Invalid JSON: {e}"))
    else:
        issues.append(Issue("ERROR", str(templates_json_path), "File not found."))

    # Validate exceptions JSON
    exceptions_data = None
    if exceptions_json_path.exists():
        try:
            exceptions_data = load_json(exceptions_json_path)
            validate_json(exceptions_validator, exceptions_data, str(exceptions_json_path), issues)
        except Exception as e:
            issues.append(Issue("ERROR", str(exceptions_json_path), f"Invalid JSON: {e}"))
    else:
        issues.append(Issue("ERROR", str(exceptions_json_path), "File not found."))

    # Validate example sentences JSON
    example_sentences = None
    if example_sentences_json_path.exists():
        try:
            example_sentences = load_json(example_sentences_json_path)
            validate_json(example_sentences_validator, example_sentences, str(example_sentences_json_path), issues)
        except Exception as e:
            issues.append(Issue("ERROR", str(example_sentences_json_path), f"Invalid JSON: {e}"))
    else:
        issues.append(Issue("ERROR", str(example_sentences_json_path), "File not found."))

    # Cross-file checks
    if isinstance(exceptions_data, dict) and verbs_records:
        validate_exceptions_against_verbs(exceptions_data, verbs_by_id, verbs_records, issues, str(exceptions_json_path))
    if isinstance(example_sentences, dict) and isinstance(templates, list):
        validate_example_sentences(example_sentences, verbs_by_id, templates, issues, str(example_sentences_json_path))

    print_report(issues, verbs_count=len(verbs_records))
    return 1 if any(i.severity == "ERROR" for i in issues) else 0

if __name__ == "__main__":
    raise SystemExit(main())
