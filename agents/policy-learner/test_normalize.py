import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
spec = importlib.util.spec_from_file_location("normalizer", Path(__file__).with_name("normalize_output.py"))
normalizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(normalizer)

class NormalizerTest(unittest.TestCase):
    def sample(self):
        return dict(schemaVersion=1, outcome="candidate", vendorId="VEN-MERIDIAN", procedure="signed_schedule_first", description="Inspect the signed schedule, then ask only when evidence is missing.", precedentCodes=["HIST-1", "HIST-2"], correctionCodes=["CORR-1"])
    def test_preserves_exact_strings_and_idempotence(self):
        value = self.sample()
        value["precedentCodes"] = ["one, literal citation", "two"]
        self.assertEqual(normalizer.normalize(value), value)
        self.assertEqual(normalizer.normalize(normalizer.normalize(value)), value)
    def test_abstention_needs_no_citations(self):
        for outcome in ["no_change", "insufficient_evidence"]:
            value = self.sample(); value.update(outcome=outcome, procedure=None, precedentCodes=[], correctionCodes=[])
            self.assertEqual(normalizer.normalize(value), value)
    def test_rejects_corrupt_shapes(self):
        for change in [dict(precedentCodes="A,B"), dict(precedentCodes=None), dict(precedentCodes=[1,2]), dict(precedentCodes=["A","A"]), dict(schemaVersion=True), dict(procedure="run_code"), dict(extra="ignored"), dict(vendorId="OTHER"), dict(description=7)]:
            with self.subTest(change=change), self.assertRaises(ValueError): normalizer.normalize(self.sample() | change)
    def test_envelope_roundtrip(self):
        proc = subprocess.run([sys.executable,str(Path(__file__).with_name("normalize_output.py")),"-","--envelope"], input=json.dumps(self.sample()),text=True,capture_output=True,check=True)
        self.assertEqual(json.loads(json.loads(proc.stdout)["resultJson"]),self.sample())
    def test_bundle_examples(self):
        for example in json.loads(Path(__file__).with_name("examples.json").read_text()):
            value = example["illustrativeResponse"]
            self.assertEqual(normalizer.normalize(value), value)
    def test_invalid_input_emits_no_body(self):
        proc = subprocess.run([sys.executable,str(Path(__file__).with_name("normalize_output.py")),"-"],input='{"precedentCodes":"[]"}',text=True,capture_output=True)
        self.assertNotEqual(proc.returncode,0); self.assertEqual(proc.stdout,"")

if __name__ == "__main__": unittest.main()
