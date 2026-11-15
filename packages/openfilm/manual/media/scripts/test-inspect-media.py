#!/usr/bin/env python3
"""Smoke tests for the read-only Media inspection helper."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT=Path(__file__).with_name('inspect-media.py')

class InspectMediaTests(unittest.TestCase):
    def test_image_path_and_reject_outside_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/'assets').mkdir()
            (root/'assets'/'photo.jpg').write_bytes(b'fake image bytes')
            good=subprocess.run([sys.executable,str(SCRIPT),'image','assets/photo.jpg',
                                 '--project',str(root)],capture_output=True,text=True)
            self.assertEqual(good.returncode,0,good.stderr)
            self.assertEqual(json.loads(good.stdout)['kind'],'image')
            (root/'elsewhere.jpg').write_bytes(b'fake')
            bad=subprocess.run([sys.executable,str(SCRIPT),'image','elsewhere.jpg',
                                '--project',str(root)],capture_output=True,text=True)
            self.assertNotEqual(bad.returncode,0)

    def test_invalid_frame_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/'assets').mkdir()
            (root/'assets'/'movie.mp4').write_bytes(b'fake')
            result=subprocess.run([sys.executable,str(SCRIPT),'video','assets/movie.mp4',
                                   '--project',str(root),'--max-frames','999'],
                                  capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('max-frames',result.stderr)

if __name__=='__main__':
    unittest.main()
