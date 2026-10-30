'use strict';
// Native WPF host. No Electron, Chromium, WebView, HTTP server or renderer.
const fs = require('node:fs/promises'), path = require('node:path'), readline = require('node:readline');
const source = process.env.DEVFORGE_SOURCE_ROOT || path.resolve(__dirname, '..');
const backend = require('node:fs').existsSync(path.join(__dirname, 'host.cjs')) ? __dirname : path.join(source, 'desktop');
const { DesktopHost } = require(path.join(backend, 'host.cjs'));
const { WindowStore } = require(path.join(backend, 'window-store.cjs'));
const nativeHandle = require('./native-services.cjs').services(backend);
const data = path.resolve(process.argv.find(x => x.startsWith('--data-dir='))?.slice(11) || path.join(require('node:os').homedir(), '.devforge-native'));
const windows = new Map();
let closing = false;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const output = new (require('./output-buffer.cjs').OutputBuffer)(send);
const projectsDirectory = process.argv.find(x => x.startsWith('--projects-dir='))?.slice(15) || path.join(require('node:os').homedir(), 'Documents', 'DevForge');
const stores = new WindowStore(data, projectsDirectory);
const ready = stores.init().then(() => createWindow('main', undefined, true));
async function createWindow(id, project, initial = false, readOnly = false) {
  if (windows.has(id)) throw Error('Window already exists');
  const workspace = await stores.workspace(project, initial, readOnly);
  const host = new DesktopHost(data, (event, value) => { host.nativeDebugger?.receive(event,value);if(event==='output')output.push(id,value);else{if(event==='exit')output.flush();send({ event, data: value, window: id });} }, {
    workspace, projectInUse: project => [...windows.values()].some(h => h !== host && h.ws.prefs.current === project),
    projectEditingElsewhere: project => [...windows.values()].some(h => h !== host && h.ws.prefs.current === project && !h.ws.projectReadOnly),
    openProjectWindow: async (project, readOnly) => {
      if (!readOnly && [...windows.values()].some(h => h.ws.prefs.current === project && !h.ws.projectReadOnly)) return { conflict: true };
      const key = require('node:crypto').randomUUID(); await createWindow(key, project, false, readOnly);
      return { window: key, state: await windows.get(key).state() };
    },
    reducedMotion: () => false
  });
  host.addons = stores.addonFacade(host);
  await host.init(); windows.set(id, host); return host;
}
async function closeHost(host) { await host.nativeDebugger?.stop(); await host.close(); }
async function shutdown() { if (closing) return; closing = true; await Promise.allSettled([...windows.values()].map(closeHost)); output.flush(); windows.clear(); }
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', async line => {
  let request;
  try {
    if (line.length > 12 * 1024 * 1024) throw Error('Request too large');
    request = JSON.parse(line); if (typeof request.id !== 'string' || typeof request.op !== 'string') throw Error('Invalid request');
    await ready;
    let value;
    if (request.op === 'shutdown') { await shutdown(); value = true; }
    else if (request.op === 'windowClose') { const host = windows.get(request.window); if (host) await closeHost(host); windows.delete(request.window); value = true; }
    else {
      const host = windows.get(request.window || 'main'); if (!host) throw Error('Window is closed');
      if(['project','openFolder','newProject'].includes(request.op)||(request.op==='nativeTemplateApply'&&request.data?.name))if(host.tools.building||host.tools.execution||host.tools.gdb||host.tools.dap||host.python.busy)throw Error('Сначала остановите выполняющийся процесс перед сменой проекта.');
      const previousProfile=JSON.stringify(host.addons.state().profile);
      value = request.op.startsWith('native') ? await nativeHandle(host, request.op, request.data || {}) : await host.handle(request.op, request.data || {});
      if (['nativeAddonToggle','nativeAddonRemove','nativeAddonImport','nativeVsixInstall'].includes(request.op)&&previousProfile!==JSON.stringify(host.addons.state().profile)) {
        const profile = host.addons.state().profile;
        for (const [key, other] of windows) { if (other !== host) { other.addons.profile = structuredClone(profile); await other.addons.remember();if(!other.addons.enabled('studio.clangd'))other.tools.stopLsp();if(!other.addons.enabled('studio.python-intelligence'))await other.pythonIntelligence.stop();if(!other.addons.enabled('studio.python-diagnostics')&&!other.addons.enabled('studio.python-formatting'))other.pythonStyle.stop();if(!other.addons.enabled('studio.debugger')&&other.nativeDebugger?.active)await other.nativeDebugger.stop(); } send({ event: 'addonsChanged', window: key, data: { requested: profile.defaultRequested || profile.requested } }); }
      }
      for(const state of [value,value?.state])if(state?.capabilities){state.capabilities={...state.capabilities,editor:'avalonedit',browser:false,nativeWindows:true};state.version='0.8.0-native.1';}
    }
    send({ id: request.id, value: value ?? null });
    if (closing) { lines.close(); process.stdin.pause(); process.exitCode = 0; }
  } catch (error) { send({ id: request?.id || '', error: error.message }); }
});
lines.on('close', () => shutdown().finally(() => { process.exitCode = 0; }));
process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)));
ready.catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; lines.close(); });
