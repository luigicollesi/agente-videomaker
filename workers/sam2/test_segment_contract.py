"""Dependency-free validation tests for the worker's command contract."""
import importlib.util
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("segment", ROOT / "segment.py")
segment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(segment)


class CliTests(unittest.TestCase):
    def test_required_parameters(self):
        with self.assertRaises(SystemExit):
            segment.parser().parse_args([])

    def test_rejects_missing_input_before_loading_model(self):
        with tempfile.TemporaryDirectory() as d:
            checkpoint = pathlib.Path(d) / "fake.pt"
            checkpoint.write_bytes(b"placeholder")
            args = ["--input", str(pathlib.Path(d) / "absent.png"),
                    "--checkpoint", str(checkpoint),
                    "--box", "[0,0,1,1]", "--output-mask", str(pathlib.Path(d) / "out.png")]
            with self.assertRaisesRegex(ValueError, "Input image not found"):
                segment.main(args)

    def test_rejects_missing_selection_before_loading_model(self):
        with tempfile.TemporaryDirectory() as d:
            source = pathlib.Path(d) / "image.png"
            checkpoint = pathlib.Path(d) / "fake.pt"
            source.write_bytes(b"placeholder")
            checkpoint.write_bytes(b"placeholder")
            args = ["--input", str(source), "--checkpoint", str(checkpoint),
                    "--output-mask", str(pathlib.Path(d) / "out.png")]
            with self.assertRaisesRegex(ValueError, "Provide --points or --box"):
                segment.main(args)


if __name__ == "__main__":
    unittest.main()
