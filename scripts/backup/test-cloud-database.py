import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('cloud-database.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

class PrivilegeTests(unittest.TestCase):
    def test_valid(self):
        backup.validate_metadata([self.table()])

    @staticmethod
    def table():
        return dict(schema='portal_read_model',name='example',can_read=True,can_write=False,rls=True,backup_policy=True,restrictive=False)

    def test_new_table_without_explicit_backup_policy_fails(self):
        table=self.table(); table['backup_policy']=False
        with self.assertRaises(RuntimeError): backup.validate_metadata([table])

    def test_empty_and_unexpected_identifier_fail(self):
        with self.assertRaises(RuntimeError): backup.validate_metadata([])
        table=self.table(); table['name']='test;drop'
        with self.assertRaises(RuntimeError): backup.validate_metadata([table])

    def test_write_access_restrictive_policy_and_wrong_schema_fail(self):
        for key,value in [('can_write',True),('restrictive',True),('can_read',False),('schema','vault')]:
            table=self.table(); table[key]=value
            with self.subTest(key=key),self.assertRaises(RuntimeError): backup.validate_metadata([table])

if __name__ == '__main__': unittest.main()
