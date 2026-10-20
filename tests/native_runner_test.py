"""Real Linux test of the Android host's fork/dlopen/signal protocol and cleanup."""
import pathlib,subprocess,tempfile,time,os,signal,json
ROOT=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='studio-runner-')as folder:
    work=pathlib.Path(folder);runner=work/'studio-runner';program=work/'program.so';source=work/'main.cpp'
    subprocess.run(['cc','-O2',str(ROOT/'native/studio-runner.c'),'-ldl','-o',str(runner)],check=True)
    source.write_text('''#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
int main(int argc,char** argv){
 if(argc>1&&!strcmp(argv[1],"signal")){volatile int* p=nullptr;*p=42;}
 if(argc>1&&!strcmp(argv[1],"return139"))return 139;
 if(argc>1&&!strcmp(argv[1],"tree")){if(fork()==0){printf("%d\\n",getpid());fflush(stdout);for(;;)sleep(1);}for(;;)sleep(1);}
 printf("%d|%s|%s\\n",argc,argv[0],argc>1?argv[1]:"");return 0;
}
''')
    subprocess.run(['c++','-fPIC','-shared','-g',str(source),'-o',str(program)],check=True)
    normal=subprocess.run([str(runner),str(program),'hello'],capture_output=True,text=True,check=True)
    assert normal.stdout==f'2|{program}|hello\n',normal
    direct=subprocess.run([str(runner),'--direct',str(program),'debug'],capture_output=True,text=True,check=True)
    assert direct.stdout==f'2|{program}|debug\n',direct
    returned=subprocess.run([str(runner),str(program),'return139'],capture_output=True,text=True)
    assert returned.returncode==139 and 'CPPSTUDIO_FAULT'not in returned.stderr,returned
    crashed=subprocess.run([str(runner),str(program),'signal'],capture_output=True,text=True)
    assert crashed.returncode==139 and json.loads(crashed.stderr.split('CPPSTUDIO_FAULT:')[1])['signal']==11,crashed
    command=subprocess.run([str(runner),'--command','/bin/sh','-c','printf command-ok'],capture_output=True,text=True,check=True)
    assert command.stdout=='command-ok',command
    tree=subprocess.Popen([str(runner),str(program),'tree'],stdout=subprocess.PIPE,text=True)
    descendant=int(tree.stdout.readline());tree.terminate();assert tree.wait(timeout=3)!=0
    for _ in range(30):
        proc=pathlib.Path('/proc')/str(descendant)/'stat'
        if not proc.exists()or proc.read_text().split()[2]=='Z':break
        time.sleep(.02)
    else:raise AssertionError('Stopped program left a running descendant')
    print('6 real native host checks passed')
