import unittest

from shell_leak_guard import is_leaked_shell


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
