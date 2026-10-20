const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RuntimeFaultParser}=require('../app/src/main/assets/ui/runtime-errors.js');

test('ASan report survives every possible byte/chunk boundary and prefers the cause over SIGABRT',()=>{
  const text='==21==ERROR: AddressSanitizer: heap-use-after-free on address 0x1234\n'+
    '    #0 0x5123 in use(int*) /home/me/project/main.cpp:12:7\n'+
    '    #1 0x5124 in main /home/me/project/main.cpp:20\n'+
    '\x1eCPPSTUDIO_FAULT:{"kind":"signal","signal":6}\n';
  for(let chunk=1;chunk<=text.length;chunk++){
    const p=new RuntimeFaultParser();for(let at=0;at<text.length;at+=chunk)p.feed(text.slice(at,at+chunk));p.flush();
    assert.equal(p.fault.kind,'sanitizer');assert.match(p.fault.title,/heap-use-after-free/);
    assert.equal(p.fault.signal,'SIGABRT');assert.equal(p.frames.length,2);
    assert.equal(p.frames[0].line,12);assert.equal(p.frames[0].column,7);assert.equal(p.frames[0].path,'/home/me/project/main.cpp');
  }
});
test('UBSan handles Windows paths and spaces without treating drive as source location',()=>{
  const p=new RuntimeFaultParser();p.feed('C:\\My Projects\\demo\\main.cpp:7:9: runtime error: division by zero\n');
  assert.equal(p.fault.kind,'undefined');assert.equal(p.frames[0].path,'C:\\My Projects\\demo\\main.cpp');assert.equal(p.frames[0].line,7);
});
test('stdlib assertions and uncaught exception retain actionable diagnostics',()=>{
  const p=new RuntimeFaultParser();p.feed('/usr/include/c++/vector:400: Assertion "index < size()" failed\n');assert.equal(p.fault.kind,'assertion');assert.equal(p.frames[0].line,400);
  p.reset();p.feed("terminate called after throwing an instance of 'std::out_of_range'\n  what():  vector::_M_range_check\n");assert.equal(p.fault.kind,'exception');assert.match(p.fault.detail,/range_check/);
});
test('exit status, user text and incomplete records never imply an actual signal',()=>{
  const p=new RuntimeFaultParser();p.feed('Process returned 139\nnormal runtime error: expected test output\nCPPSTUDIO_FAULT:{"signal":11}\n');assert.equal(p.fault,null);
  p.feed('\x1eCPPSTUDIO_FAULT:{"kind":"signal","signal":11}\n');assert.equal(p.fault.title,'SIGSEGV');
});
test('malformed/native records remain data and logs are bounded',()=>{
  const p=new RuntimeFaultParser();p.feed('\x1eCPPSTUDIO_FAULT:alert(1)\n\x1eCPPSTUDIO_FAULT:{"kind":"signal","signal":"<script>"}\n');assert.equal(p.fault,null);
  for(let i=0;i<2000;i++)p.feed('A'.repeat(1000)+'\n');assert.equal(p.lines.length,200);assert.ok(p.report().length<=96000);
  p.feed('z'.repeat(60000));assert.ok(p.tail.length<=8192);p.flush();assert.ok(p.tail.length===0);
});
