import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "shell_leak_guard.py"
SPEC = importlib.util.spec_from_file_location("shell_leak_guard", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
is_leaked_shell = MODULE.is_leaked_shell


class ShellLeakGuardTests(unittest.TestCase):
    def test_matches_only_old_bare_powershell_owned_by_claude(self):
        self.assertTrue(is_leaked_shell(
            name="powershell.exe", command_line=["powershell.exe"],
            parent_name="claude.exe", age_seconds=20,
        ))
        self.assertFalse(is_leaked_shell(
            name="powershell.exe", command_line=["powershell.exe", "-File", "backup.ps1"],
            parent_name="claude.exe", age_seconds=20,
        ))
        self.assertFalse(is_leaked_shell(
            name="powershell.exe", command_line=["powershell.exe"],
            parent_name="explorer.exe", age_seconds=20,
        ))
        self.assertFalse(is_leaked_shell(
            name="powershell.exe", command_line=["powershell.exe"],
            parent_name="claude.exe", age_seconds=3,
        ))


if __name__ == "__main__":
    unittest.main()
