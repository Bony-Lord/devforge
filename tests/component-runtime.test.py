"""Ownership regression checks: extracting Python must not require the GDB payload."""
import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('components',pathlib.Path(__file__).resolve().parents[1]/'tools/prepare_component_runtime.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class Components(unittest.TestCase):
 def test_python_and_its_shared_libraries_are_independent(self):
  catalog={'packs':[{'id':'platform','files':['lib/libc++_shared.so'],'links':[]},{'id':'gcc','files':[],'links':[]},{'id':'debugger','files':['bin/gdb','bin/python3.14','lib/libpython3.14.so','lib/libandroid-support.so','lib/python3.14/os.py'],'links':['bin/python3']},{'id':'python','aliasOf':'debugger'}]}
  paths=['lib/libc++_shared.so','bin/gdb','bin/python3.14','lib/libpython3.14.so','lib/libandroid-support.so','lib/gcc/x86_64-linux-android/15.2.0/cc1','bin/ctest']
  manifest={'native':[{'path':p}for p in paths],'files':[{'path':'lib/python3.14/os.py'}],'links':[{'path':'bin/python3','target':'python3.14'}]};owners=c.partition(manifest,catalog)
  for p in ['bin/python3','bin/python3.14','lib/libpython3.14.so','lib/python3.14/os.py']:self.assertEqual(owners[p],'python')
  self.assertEqual(owners['bin/gdb'],'debugger');self.assertEqual(owners['lib/libandroid-support.so'],'platform');self.assertEqual(owners['lib/gcc/x86_64-linux-android/15.2.0/cc1'],'gcc');self.assertEqual(owners['bin/ctest'],'cmake')
 def test_shared_paths_have_one_common_owner(self):
  catalog={'packs':[{'id':'platform','files':['lib/libffi.so'],'links':[]},{'id':'debugger','files':['lib/libffi.so'],'links':[]}]};owners=c.partition({'native':[{'path':'lib/libffi.so'}],'files':[],'links':[]},catalog);self.assertEqual(owners['lib/libffi.so'],'platform')
if __name__=='__main__':unittest.main()
