#!/usr/bin/env python3
"""Validate policy output without coercing fields. Emit JSON or resultJson envelope."""
import argparse
import json
import sys

FIELDS = ("schemaVersion", "outcome", "vendorId", "procedure", "description", "precedentCodes", "correctionCodes")
PROCEDURES = {"controller_confirmation", "signed_schedule_first"}

def normalize(obj):
    if not isinstance(obj, dict) or set(obj) != set(FIELDS):
        raise ValueError("Expected exactly the seven policy payload fields")
    if type(obj["schemaVersion"]) is not int or obj["schemaVersion"] != 1:
        raise ValueError("schemaVersion must be 1")
    if not isinstance(obj["outcome"], str) or obj["outcome"] not in {"candidate", "no_change", "insufficient_evidence"}:
        raise ValueError("Invalid outcome")
    if obj["vendorId"] != "VEN-MERIDIAN":
        raise ValueError("vendorId must be VEN-MERIDIAN")
    if not isinstance(obj["description"], str) or not 20 <= len(obj["description"]) <= 4000:
        raise ValueError("description must contain 20-4000 characters")
    for field in ("precedentCodes", "correctionCodes"):
        codes = obj[field]
        if not isinstance(codes, list) or len(codes) > 30 or not all(isinstance(x, str) and x.strip() for x in codes):
            raise ValueError(field + " must be an array of at most 30 nonempty strings")
        if len(set(codes)) != len(codes):
            raise ValueError(field + " must contain distinct codes")
    if obj["outcome"] == "candidate":
        if not isinstance(obj["procedure"], str) or obj["procedure"] not in PROCEDURES or len(obj["precedentCodes"]) < 2:
            raise ValueError("Candidate needs a supported procedure and two precedents")
    elif obj["procedure"] is not None:
        raise ValueError("Abstention requires null procedure")
    return {field: obj[field] for field in FIELDS}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--envelope", action="store_true")
    args = parser.parse_args()
    try:
        text = sys.stdin.read() if args.file == "-" else open(args.file, encoding="utf-8").read()
        body = json.dumps(normalize(json.loads(text)), ensure_ascii=False)
        print(json.dumps({"resultJson": body}, ensure_ascii=False) if args.envelope else body)
    except (ValueError, TypeError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
