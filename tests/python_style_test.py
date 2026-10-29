import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
HELPER = ROOT / 'app/src/main/assets/python/style_tools.py'
MANIFEST = json.loads(HELPER.with_name('style-manifest.json').read_text(encoding='utf-8'))


class PythonStyleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.storage = tempfile.TemporaryDirectory(prefix='devforge-style-')
        cls.cache = pathlib.Path(cls.storage.name) / 'wheels'
        cls.cache.mkdir()
        staged = pathlib.Path(os.environ.get('DEVFORGE_STYLE_CACHE', ROOT / 'work/python-style-060-20261029'))
        for item in MANIFEST['packages']:
            file = staged / item['filename']
            if file.is_file():
                shutil.copy2(file, cls.cache / file.name)
        cls.call('install', cache=cls.cache)

    @classmethod
    def tearDownClass(cls):
        cls.storage.cleanup()

    @classmethod
    def call(cls, action, text='', root=None, path=None, notebook=False, cache=None):
        result = subprocess.run([sys.executable, '-B', '-S', str(HELPER), action, str(cache or cls.cache)], input=json.dumps({'text': text, 'root': str(root) if root else None, 'path': str(path) if path else None, 'notebook': notebook}), capture_output=True, text=True, encoding='utf-8', timeout=120)
        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)

    def test_pinned_download_info_and_no_global_interpreter_install(self):
        result = self.call('info')
        self.assertTrue(result['installed'])
        self.assertEqual(len(result['packages']), 3)
        for item in result['packages']:
            self.assertEqual(hashlib.sha256((self.cache / item['filename']).read_bytes()).hexdigest(), item['sha256'])
        self.assertFalse((self.cache / 'site-packages').exists())

    def test_formatting_and_lint_use_the_actual_pinned_tools(self):
        source = 'import os,sys\n\nx=1; y=2\n'
        result = self.call('format', source)
        self.assertTrue(result['ok'], result)
        self.assertIn('x = 1\n', result['text'])
        self.assertNotIn('os,sys', result['text'])
        findings = self.call('analyze', 'x=1  \n')['diagnostics']
        self.assertTrue(any(d['code'] == 'E225' for d in findings))
        self.assertTrue(any(d['code'] == 'W291' for d in findings))

    def test_syntax_errors_keep_source_and_never_run_it(self):
        result = self.call('format', 'def bad(:\n')
        self.assertEqual(result['text'], 'def bad(:\n')
        self.assertEqual(result['diagnostics'][0]['severity'], 'error')
        result = self.call('analyze', 'raise RuntimeError("must not execute")\n')
        self.assertTrue(result['ok'])
        self.assertFalse(result['diagnostics'])

    def test_project_config_and_nearest_directory_override(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / '.pep8').write_text('[pycodestyle]\nmax-line-length=120\nignore=E225\n', encoding='utf-8')
            sub = root / 'src'
            sub.mkdir()
            (sub / 'pyproject.toml').write_text('[tool.autopep8]\nmax-line-length=79\nignore=[]\n', encoding='utf-8')
            source = 'x=1\nvalue = "' + 'a' * 90 + '"\n'
            result = self.call('analyze', source, root, root / 'main.py')
            self.assertFalse(result['diagnostics'])
            result = self.call('analyze', source, root, sub / 'main.py')
            self.assertTrue(any(d['code'] == 'E225' for d in result['diagnostics']))
            self.assertTrue(any(d['code'] == 'E501' for d in result['diagnostics']))
            self.assertEqual(len(result['config']), 2)

    def test_invalid_config_and_source_containment_are_visible_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / '.pep8').write_text('[pycodestyle]\nmax-line-length=0\n', encoding='utf-8')
            result = self.call('analyze', 'x=1\n', root, root / 'main.py')
            self.assertFalse(result['ok'])
            self.assertIn('Invalid Python style option', result['error'])
            result = self.call('analyze', 'x=1\n', root, root.parent / 'outside.py')
            self.assertFalse(result['ok'])
            self.assertIn('outside project', result['error'])

    def test_notebook_cells_do_not_require_a_file_ending_newline(self):
        self.assertFalse(any(d['code'] == 'W292' for d in self.call('analyze', 'value = 1', notebook=True)['diagnostics']))
        self.assertTrue(any(d['code'] == 'W292' for d in self.call('analyze', 'value = 1')['diagnostics']))

    def test_notebook_trailing_blank_lines_are_not_a_file_end_warning(self):
        self.assertFalse(any(d['code'] == 'W391' for d in self.call('analyze', '!pip install pandas\n\n', notebook=True)['diagnostics']))
        self.assertTrue(any(d['code'] == 'W391' for d in self.call('analyze', 'value = 1\n\n')['diagnostics']))

    def test_notebook_magic_does_not_create_a_false_import_placement_warning(self):
        result = self.call('analyze', '!pip --version\nimport json\n', notebook=True)
        self.assertFalse(any(d['code'] == 'E402' for d in result['diagnostics']))
        result = self.call('analyze', 'print(1)\nimport json\n', notebook=True)
        self.assertTrue(any(d['code'] == 'E402' for d in result['diagnostics']))

    def test_notebook_magics_strings_and_modulo_are_retained(self):
        source = '%pwd\n!echo hello\nx=1\ntext="!literal"\nvalue = (42\n % 5)\n'
        result = self.call('format', source, notebook=True)
        self.assertTrue(result['ok'], result)
        self.assertIn('%pwd\n', result['text'])
        self.assertIn('!echo hello\n', result['text'])
        self.assertIn('x = 1\n', result['text'])
        self.assertIn('"!literal"', result['text'])
        result = self.call('analyze', source, notebook=True)
        self.assertFalse(any(d['line'] in (0, 1) for d in result['diagnostics']))
        result = self.call('format', '%%bash\necho unformatted\n', notebook=True)
        self.assertTrue(result['skipped'])
        self.assertEqual(result['text'], '%%bash\necho unformatted\n')

    def test_corrupt_or_missing_package_cannot_be_imported(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = pathlib.Path(directory)
            shutil.copytree(self.cache, cache, dirs_exist_ok=True)
            (cache / MANIFEST['packages'][0]['filename']).write_bytes(b'corrupt')
            self.assertFalse(self.call('info', cache=cache)['installed'])
            self.assertFalse(self.call('analyze', 'x=1\n', cache=cache)['ok'])

    def test_remove_only_deletes_owned_wheels_and_does_not_change_projects(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = pathlib.Path(directory)
            shutil.copytree(self.cache, cache, dirs_exist_ok=True)
            (cache / 'user-file.py').write_text('retained', encoding='utf-8')
            self.assertFalse(self.call('remove', cache=cache)['installed'])
            self.assertEqual((cache / 'user-file.py').read_text(encoding='utf-8'), 'retained')


if __name__ == '__main__':
    unittest.main()
