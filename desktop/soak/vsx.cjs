'use strict';
const path=require('node:path'),os=require('node:os');
function argumentsFor(argv){
 const has=name=>argv.some(a=>a===name||a.startsWith(name+'='));
 const defaults=['--focus','vsx'];
 for(const[name,value]of [['--report-root',path.join(os.homedir(),'DevForgeVSXTests')],['--max-memory-mb','3072'],['--max-disk-mb','512'],['--worker-memory-mb','3072'],['--max-workers','1'],['--reserve-memory-mb','6144'],['--cycle-steps','60'],['--suite-every-minutes','15']])if(!has(name))defaults.push(name,value);
 if(has('--focus'))throw Error('This launcher is reserved for VSX; use run.cjs for other targets');
 return [...defaults,...argv];
}
module.exports={argumentsFor};
if(require.main===module)require('./run.cjs').main(argumentsFor(process.argv.slice(2))).then(state=>{process.exitCode=state?.status==='failed'?1:0;}).catch(error=>{console.error(error.stack);process.exitCode=1;});
