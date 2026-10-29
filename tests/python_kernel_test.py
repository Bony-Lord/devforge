import json, os, pathlib, subprocess, sys, unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class KernelTests(unittest.TestCase):
    def setUp(self):
        self.child = subprocess.Popen([sys.executable, '-u', str(ROOT/'app/src/main/assets/python/kernel.py')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
        self.assertEqual(json.loads(self.child.stdout.readline())['type'], 'ready')

    def tearDown(self):
        self.child.kill()
        self.child.communicate(timeout=5)

    def cell(self, code, identifier='cell'):
        self.child.stdin.write(json.dumps({'id':identifier,'code':code,'filename':'fixture.ipynb#cell'})+'\n')
        self.child.stdin.flush()
        result=[]
        while True:
            line=self.child.stdout.readline()
            self.assertTrue(line)
            item=json.loads(line);self.assertEqual(item['id'],identifier);result.append(item)
            if item['type']=='idle':return result

    def test_bare_pip_uses_kernel_interpreter_even_with_another_pip_on_path(self):
        import tempfile
        with tempfile.TemporaryDirectory(prefix='devforge-wrong-pip-') as directory:
            script = pathlib.Path(directory) / ('pip.bat' if os.name == 'nt' else 'pip')
            script.write_text('@echo WRONG_PIP' if os.name == 'nt' else '#!/bin/sh\necho WRONG_PIP\n', encoding='utf-8')
            script.chmod(0o755)
            code = 'import os\nos.environ["PATH"] = ' + repr(directory + os.pathsep) + ' + os.environ["PATH"]\n'
            self.cell(code)
            result = self.cell('!pip --version')
            output = ''.join(e.get('text', '') for e in result)
            self.assertNotIn('WRONG_PIP', output)
            self.assertIn('pip ', output)
            self.assertFalse(any(e['type'] == 'error' for e in result))

    def test_failed_pip_is_an_error_instead_of_a_successful_install(self):
        result = self.cell('!pip --devforge-invalid-option')
        self.assertTrue(any(e['type'] == 'error' and 'pip failed in' in e['evalue'] for e in result))

    def test_notebook_can_import_project_modules_after_changing_directory(self):
        import tempfile
        with tempfile.TemporaryDirectory(prefix='devforge-local-module-') as directory:
            (pathlib.Path(directory) / 'devforge_local_probe.py').write_text('answer = 42\n', encoding='utf-8')
            self.cell('import os\nos.chdir(' + repr(directory) + ')')
            result = self.cell('import devforge_local_probe\ndevforge_local_probe.answer')
            self.cell('os.chdir(' + repr(str(ROOT)) + ')')
            self.assertEqual(next(e['text'] for e in result if e['type'] == 'result'), '42')

    def test_shared_state_result_and_unicode_stream(self):
        self.cell('answer = 40')
        result=self.cell('print("Привет")\nanswer + 2')
        self.assertIn('Привет',''.join(e.get('text','')for e in result))
        self.assertEqual(next(e['text']for e in result if e['type']=='result'),'42')
        self.assertEqual(result[-1]['count'],2)

    def test_runtime_and_syntax_errors_keep_session_alive(self):
        for code,kind in [('1 / 0','ZeroDivisionError'),('if :','SyntaxError'),('raise SystemExit(4)','SystemExit')]:
            output=self.cell(code);self.assertEqual(next(e['ename']for e in output if e['type']=='error'),kind)
        self.assertEqual(next(e['text']for e in self.cell('6*7')if e['type']=='result'),'42')

    def test_native_writes_do_not_corrupt_protocol(self):
        result=self.cell('import os\nos.write(1, b"native-output\\n")\n42')
        self.assertEqual(next(e['text']for e in result if e['type']=='result'),'42')

    def test_output_is_bounded_and_next_cell_works(self):
        output=self.cell('print("x" * 1200000)')
        self.assertLess(sum(len(e.get('text',''))for e in output),1050000)
        self.assertTrue(any('truncated' in e.get('text','')for e in output))
        self.assertEqual(self.cell('x = 1')[-1]['type'],'idle')

    def test_shell_output_capture_unicode_and_exit_status(self):
        result=self.cell('!echo notebook-shell\nlines = !echo captured\n(lines[0], _exit_code)')
        self.assertTrue(any('notebook-shell' in e.get('text','') for e in result))
        self.assertEqual(next(e['text']for e in result if e['type']=='result'),"('captured', 0)")
        result=self.cell('!exit 7\n_exit_code')
        self.assertEqual(next(e['text']for e in result if e['type']=='result'),'7')

    def test_magics_preserve_literals_comments_modulo_and_line_numbers(self):
        source='text = """\n!not a shell command\n%not a magic\n"""\n# !not a command\nvalue = (42\n % 5)\n(text, value)'
        result=self.cell(source)
        self.assertFalse(any(e['type']=='error' for e in result))
        self.assertIn('not a shell',next(e['text']for e in result if e['type']=='result'))
        result=self.cell('!echo line-one\n1/0')
        error=next(e for e in result if e['type']=='error')
        self.assertIn('line 2',''.join(error['traceback']))

    def test_cwd_env_writefile_and_run_share_the_kernel(self):
        import tempfile
        with tempfile.TemporaryDirectory(prefix='devforge magic ') as directory:
            # One path containing spaces is accepted on both desktop platforms.
            result=self.cell('%cd '+json.dumps(directory)+'\n%env DF_MAGIC_TEST=hello\n%pwd')
            self.assertFalse(any(e['type']=='error' for e in result))
            self.cell('%%writefile sample.py\nshared_answer = 42\n')
            self.cell('%run sample.py')
            result=self.cell('import os\n(shared_answer, os.environ["DF_MAGIC_TEST"])')
            self.assertEqual(next(e['text']for e in result if e['type']=='result'),"(42, 'hello')")
            self.cell('%cd -')

    def test_unknown_magic_and_time_capture_leave_the_kernel_alive(self):
        result=self.cell('%unsupported')
        self.assertEqual(next(e['ename']for e in result if e['type']=='error'),'ValueError')
        result=self.cell('%%time\nanswer = 6 * 7')
        self.assertTrue(any('Wall time' in e.get('text','')for e in result))
        self.cell('%%capture captured_output\nprint("hidden")')
        result=self.cell('(answer, captured_output["stdout"])')
        self.assertEqual(next(e['text']for e in result if e['type']=='result'),"(42, 'hidden\\n')")

    def test_shell_output_without_newlines_is_streamed_and_bounded(self):
        command = subprocess.list2cmdline([sys.executable,'-c','print("x"*1200000, end="")']) if os.name=='nt' else __import__('shlex').join([sys.executable,'-c','print("x"*1200000, end="")'])
        result=self.cell('!'+command)
        self.assertLess(sum(len(e.get('text',''))for e in result),1050000)
        self.assertTrue(any('truncated' in e.get('text','')for e in result))
        self.assertEqual(next(e['text']for e in self.cell('6*7')if e['type']=='result'),'42')


if __name__ == '__main__':unittest.main()
