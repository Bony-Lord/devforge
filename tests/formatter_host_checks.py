"""Real clang-format CLI checks on the development host, not Android/IME verification."""
import argparse, json, pathlib, re, subprocess, tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]

def run(binary):
    checks=[]
    def check(name,passed,evidence):
        checks.append({'test':name,'passed':bool(passed),'evidence':evidence})
        if not passed:raise AssertionError(name+': '+str(evidence))
    version=subprocess.check_output([str(binary),'--version'],text=True).strip()
    build=ROOT/'build'/'formatter-host-checks';build.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='fixture-',dir=build) as folder:
        root=pathlib.Path(folder).resolve()
        assert root.is_relative_to(build.resolve())
        java=(ROOT/'app/src/main/java/dev/forge/ide/LanguageTools.java').read_text(encoding='utf-8')
        style=json.loads('"'+re.search(r'DEFAULT_STYLE="((?:\\.|[^"\\])*)"',java).group(1)+'"')
        (root/'.clang-format').write_text(style,encoding='utf-8')
        file=root/'main.cpp'
        def fmt(text,extra=(),style='--style=file',path=file):
            return subprocess.run([str(binary),style,'--assume-filename='+str(path),*extra],input=text.encode('utf-8'),capture_output=True,check=False)
        text='void f(){for(auto & el:v){auto*ptr=&el;*ptr+=1;}}\n'
        result=fmt(text);out=result.stdout.decode('utf-8')
        check('Requested reference, pointer and range-for style',result.returncode==0 and 'for (auto& el : v)' in out and 'auto *ptr = &el;' in out,out)
        text='void f(){\nint x=1;\nif(x){x++;}\n}\n'
        tabs='--style={BasedOnStyle: InheritParentConfig, IndentWidth: 4, TabWidth: 4, UseTab: Always}'
        out=fmt(text,style=tabs).stdout.decode('utf-8')
        check('Tab override indents the function body','\n\tint x = 1;' in out and '\n\t\tx++;' in out,out)
        spaces='--style={BasedOnStyle: InheritParentConfig, IndentWidth: 2, TabWidth: 8, UseTab: Never}'
        out=fmt(text,style=spaces).stdout.decode('utf-8')
        check('Space override applies the selected width','\n  int x = 1;' in out and '\t' not in out,out)
        sub=root/'nested';sub.mkdir();(sub/'.clang-format').write_text('BasedOnStyle: InheritParentConfig\nIndentWidth: 6\n',encoding='utf-8')
        out=fmt(text,path=sub/'nested.cpp').stdout.decode('utf-8')
        check('Nested project style is inherited','\n      int x = 1;' in out,out)
        out=fmt(text,style=spaces,path=sub/'nested.cpp').stdout.decode('utf-8')
        check('Explicit indentation overrides a nested style','\n  int x = 1;' in out,out)
        text='// Привет 🙂\nvoid f(){int x=1;}\n';cursor=text.index('}')+1
        result=fmt(text,extra=['--lines=2:2','--cursor='+str(len(text[:cursor].encode('utf-8')))])
        header,_,body=result.stdout.partition(b'\n');offset=json.loads(header)['Cursor'];prefix=body[:offset].decode('utf-8')
        check('On-type cursor mapping uses UTF-8 byte offsets',result.returncode==0 and prefix.endswith('}') and 'Привет 🙂' in prefix,{'cursorBytes':offset,'prefix':prefix})
        check('Mapped cursor converts safely to UTF-16',len(prefix.encode('utf-16-le'))//2==len(prefix)+1,{'utf16':len(prefix.encode('utf-16-le'))//2,'characters':len(prefix)})
        text='int    untouched   = 0;\n\nvoid f(){\nint x=1;\n}\n\nint    after =2;\n'
        out=fmt(text,extra=['--lines=3:5']).stdout.decode('utf-8')
        check('Block range formatting preserves separate declarations',out.startswith('int    untouched   = 0;') and out.endswith('int    after =2;\n') and '    int x = 1;' in out,out)
        out=fmt('void f(){\r\nint x=1;\r\n}\r\n').stdout
        check('Formatter preserves CRLF line endings',b'\r\n' in out and b'\n' not in out.replace(b'\r\n',b''),repr(out))
        result=fmt(text,style='--style={NotAValidOption: broken}')
        check('Invalid formatter config fails without output',result.returncode!=0 and not result.stdout,result.stderr.decode('utf-8'))
    return {'scope':'host CLI; Android on-type integration remains a separate device check','version':version,'checks':checks}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--binary',required=True,type=pathlib.Path);parser.add_argument('--report',type=pathlib.Path);args=parser.parse_args()
    report=run(args.binary)
    if args.report:args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(str(len(report['checks']))+' real host formatter checks passed ('+report['version']+')')
