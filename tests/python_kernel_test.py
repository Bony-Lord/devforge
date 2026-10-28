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


if __name__ == '__main__':unittest.main()
