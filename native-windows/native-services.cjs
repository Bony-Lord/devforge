'use strict';
const fs = require('node:fs/promises'), path = require('node:path');
function services(backend) {
 const ui = require(path.join(backend, 'assets.cjs')).ui;
 const core = require(path.join(ui, 'addon-core.js')), templates = require(path.join(ui, 'project-templates.js'));
 const profiles = require(path.join(ui, 'run-configurations.js'));
 const modules = require(path.join(ui, 'addons/modules.json'));
 const builtinTemplates = require(path.join(ui, 'addons/templates.json'));
 const builtin = new Set(['studio.window-manager']);
 const identity = r => typeof r === 'string' ? r : r.id;
 const resolve=(manifests,requested)=>core.resolve(manifests.map(m=>m.platforms?{...m,platforms:m.platforms.map(p=>p==='windows'?'win32':p)}:m),requested,{platform:process.platform});
 function catalog(host) {
  const all = [...modules.map(m => ({ manifest: m.manifest, builtin: true })), ...host.addons.catalog().map(p => ({ manifest: p.manifest, package: p, official: true })), ...host.addons.state().packages.map(p => ({ manifest: p.package.manifest, package: p.package, installed: true }))];
  const map = new Map(); for (const item of all) { const old = map.get(item.manifest.id); if (!old || core.compare(item.manifest.version, old.manifest.version) >= 0) map.set(item.manifest.id, item); }
  for (const pack of host.toolPacks().packs) map.set('studio.tool.' + pack.id, { manifest: { schemaVersion: 1, id: 'studio.tool.' + pack.id, version: '1.0.0', api: { min: '0.1.1', maxExclusive: '0.2.0' }, name: pack.name, description: pack.description, kind: 'runtime', capabilities: ['tools.runtime'], dependencies: {}, conflicts: {}, nativePack: pack.id }, tool: pack });
  return [...map.values()].map(e => ({ ...e, core: builtin.has(e.manifest.id), enabled: builtin.has(e.manifest.id) || host.addons.enabled(e.manifest.id), installed: e.installed || !!e.builtin || !!e.tool?.installed, compatible: !e.manifest.platforms?.length || e.manifest.platforms.includes('windows') || e.manifest.platforms.includes('win32') }));
 }
 function roots(host) { return host.addons.state().profile.defaultRequested || host.addons.state().profile.requested || []; }
 async function setProfile(host, requested) {
  const all = catalog(host), resolved = resolve(all.map(e => e.manifest), requested);
  const profile = { ...host.addons.state().profile, requested, defaultRequested: requested, resolved: resolved.map(m => m.id), safeMode: false, activating: false };
  const install = resolved.filter(m => !modules.some(e => e.manifest.id === m.id) && !host.addons.state().packages.some(e => e.package.manifest.id === m.id && e.package.manifest.version === m.version)).map(m => all.find(e => e.manifest.id === m.id)).filter(e => e?.official).map(e => ({ official: e.manifest.id + '@' + e.manifest.version }));
  const tx = await host.addons.handle('addonBegin', { revision: host.addons.state().revision, profile, defaultRequested: requested, install, accepted: false });
  await host.addons.handle('addonFinish', { token: tx.token, commit: true }); return catalog(host);
 }
 function relations(host, id) {
  const all = catalog(host), map = new Map(all.map(e => [e.manifest.id, e.manifest])), closure = (name, seen = new Set()) => { if (seen.has(name)) return seen; seen.add(name); for (const dep of Object.keys(map.get(name)?.dependencies || {})) closure(dep, seen); return seen; };
  return { requires: [...closure(id)].filter(n => n !== id).map(n => map.get(n)), dependents: all.filter(e => e.enabled && e.manifest.id !== id && closure(e.manifest.id).has(id)).map(e => e.manifest), installedDependents: all.filter(e => !e.enabled && e.installed && e.manifest.id !== id && closure(e.manifest.id).has(id)).map(e => e.manifest) };
 }
 function templateCatalog(host) {
  const extra = host.addons.state().packages.filter(p => host.addons.enabled(p.package.manifest.id)).flatMap(p => (p.package.contributions || []).filter(c => c.point === 'projectTemplates').map(c => c.value));
  return [...builtinTemplates, ...(host.ws.prefs.settings.projectTemplates || []), ...extra];
 }
 return async function handle(host, op, d) {
  if (op === 'nativeAddonCatalog') return catalog(host);
  if(op.startsWith('nativeDebug')){host.ws.assertEditable();if(!host.trust().trusted)throw Error('WORKSPACE_UNTRUSTED');host.nativeDebugger??=new(require('./native-debugger.cjs').NativeDebugger)(host,require(path.join(ui,'debugger.js')).parseMI);if(op==='nativeDebugStart')return host.nativeDebugger.start(d);if(op==='nativeDebugSnapshot')return host.nativeDebugger.snapshot(d);if(op==='nativeDebugChildren')return host.nativeDebugger.children(d);if(op==='nativeDebugStop')return host.nativeDebugger.stop();if(op==='nativeDebugCommand'){const commands={continue:'-exec-continue',pause:'-exec-interrupt',over:'-exec-next',into:'-exec-step',out:'-exec-finish'};if(!commands[d.action])throw Error('Unknown debug action');return host.nativeDebugger.command(commands[d.action]);}}
  if (op === 'nativeAddonRelations') return relations(host, d.id);
  if (op === 'nativeAddonInit') { if (!roots(host).length) await setProfile(host, ['studio.pack.essentials']); return catalog(host); }
  if (op === 'nativeAddonToggle') {
   if (builtin.has(d.id)) throw Error('Оконник встроен в приложение. Режим перемещения меняется в меню «Вид».');
   const all = catalog(host), item = all.find(e => e.manifest.id === d.id); if (!item) throw Error('Дополнение не найдено');
   if(!!d.enable===!!item.enabled)return all;
   let requested = roots(host).filter(r => identity(r) !== d.id);
   if (d.enable) {
    const resolved = resolve(all.map(e => e.manifest), [d.id]);
    for (const m of resolved) {
     const entry = all.find(e => e.manifest.id === m.id);
     if (entry?.tool) { if (!entry.tool.available) throw Error('Установите ' + entry.tool.name + ' или укажите путь в настройках.'); await host.handle('toolEnable', { id: entry.tool.id }); }
     if (m.externalTool === 'python-intelligence' && !(await host.handle('pythonIntelligenceInfo')).installed) await host.handle('pythonIntelligenceInstall', { options: host.ws.prefs.settings });
     if (m.externalTool === 'python-style' && !(await host.handle('pythonStyleInfo')).installed) await host.handle('pythonStyleInstall', { options: host.ws.prefs.settings });
     if (m.externalTool?.startsWith('python-3.')) await host.handle('pythonRuntimeInstall', { id: m.externalTool });
    }
    requested.push(d.id);
   } else {
    const info = relations(host, d.id); if (info.dependents.length && !d.confirm) return { needsConfirmation: true, ...info };
    const retiring = new Set([d.id, ...info.dependents.map(m => m.id)]); requested = requested.filter(r => !retiring.has(identity(r)));
   }
   const result=await setProfile(host, requested);
   if(!host.addons.enabled('studio.clangd'))host.tools.stopLsp();
   if(!host.addons.enabled('studio.python-intelligence'))await host.pythonIntelligence.stop();
   if(!host.addons.enabled('studio.python-diagnostics')&&!host.addons.enabled('studio.python-formatting'))host.pythonStyle.stop();
   if(!host.addons.enabled('studio.debugger')&&host.nativeDebugger?.active)await host.nativeDebugger.stop();
   return result;
  }
  if (op === 'nativeAddonRemove') {
   const entry = catalog(host).find(e => e.manifest.id === d.id); if (!entry || entry.core) throw Error('Встроенный компонент не удаляется.');
   const info = relations(host, d.id); if (!d.confirm) return { needsConfirmation: true, ...info };
   await handle(host, 'nativeAddonToggle', { id: d.id, enable: false, confirm: true });
   if (entry.tool?.system) return { retainedSystemFiles: true, catalog: catalog(host) };
   for (const pkg of [...host.addons.state().packages].filter(p => p.package.manifest.id === d.id)) {
    const tx = await host.addons.handle('addonBegin', { revision: host.addons.state().revision, profile: host.addons.state().profile, remove: d.id + '@' + pkg.package.manifest.version }); await host.addons.handle('addonFinish', { token: tx.token, commit: true });
   }
   return { catalog: catalog(host) };
  }
  if (op === 'nativeTemplates') return templateCatalog(host);
  if (op === 'nativeAddonImport') {
   if (!d.accepted) throw Error('Подтвердите установку стороннего дополнения.');
   const pkg = require(path.join(ui, 'addon-packages.js')).parse(d.package);
   if (pkg.module) throw Error('Это дополнение использует прежний браузерный API. Нативный адаптер ещё не перенесён.');
   const current = catalog(host), manifests = [...current.filter(e => e.manifest.id !== pkg.manifest.id).map(e => e.manifest), pkg.manifest];
   const requested = [...roots(host).filter(r => identity(r) !== pkg.manifest.id), { id: pkg.manifest.id, version: pkg.manifest.version }], resolved = resolve(manifests, requested);
   const profile = { ...host.addons.state().profile, requested, defaultRequested: requested, resolved: resolved.map(m => m.id), safeMode: false, activating: false };
   const tx = await host.addons.handle('addonBegin', { revision: host.addons.state().revision, profile, defaultRequested: requested, install: [{ package: pkg }], accepted: true });
   await host.addons.handle('addonFinish', { token: tx.token, commit: true }); return { id: pkg.manifest.id, catalog: catalog(host) };
  }
  if (op === 'nativeVsixInstall') {
   if (!d.accepted) throw Error('Подтвердите условия автора расширения.');
   const prepared = await host.handle('extensionGalleryPrepare', d);
   const result = await handle(host, 'nativeAddonImport', { package: JSON.parse(prepared.text), accepted: true });
   return { ...result, sha256: prepared.sha256 };
  }
  if (op === 'nativeSnippets') return host.addons.state().packages.filter(p => host.addons.enabled(p.package.manifest.id)).flatMap(p => (p.package.contributions || []).filter(c => c.point === 'snippets').map(c => c.value));
  if (op === 'nativeProjectConfiguration') { const file = path.join(host.ws.root, '.devforge/project.json'); try { return JSON.parse((await host.ws.read(file)).text); } catch (e) { if (e.code !== 'ENOENT') throw e; return profiles.defaults(host.ws.prefs.settings, 'main.cpp', await require(path.join(backend, 'workspace.cjs')).exists(path.join(host.ws.root, 'CMakeLists.txt'))); } }
  if (op === 'nativeResolveConfiguration') { const document=profiles.validate(await handle(host,'nativeProjectConfiguration',{}));if(!document.configurations.length)return {options:host.ws.prefs.settings,path:d.path||''};return profiles.resolve(document,host.ws.prefs.settings,host.ws.root,d.path); }
  if (op === 'nativeProjectSave') { host.ws.assertEditable(); const document = profiles.validate(d.document),file = path.join(host.ws.root,'.devforge/project.json'); await fs.mkdir(path.dirname(file),{recursive:true}); await host.ws.write(file,JSON.stringify(document,null,2)+'\n'); return document; }
  if (op === 'nativeTemplateApply') {
   host.ws.assertEditable();
   const t = templateCatalog(host).find(t => t.id === d.id); if (!t) throw Error('Шаблон не найден');
   const instance = templates.instantiate(t, d.parameters || {}, d.name || path.basename(host.ws.root));
   if (instance.kind === 'project') { const created = await host.handle('newProject', { name: d.name, language: 'template' }); await host.handle('project', { name: created.createdProject }); }
   const document = instance.kind === 'project' ? null : await handle(host, 'nativeProjectConfiguration', {});
   const paths = [...instance.files.map(f => f.path), '.devforge/project.json'];
   const snapshot = await host.templates.snapshot({ root: host.ws.root, paths });
   const current = Object.fromEntries(Object.entries(snapshot.files).map(([k, v]) => [k, v?.text ?? null]));
   const planned = templates.plan(instance, { current, document, replace: d.replace || [] });
   if (planned.conflicts.length) return { conflicts: planned.conflicts, root: host.ws.root };
   const changes = planned.changes.map(c => ({ path: c.path, text: c.text, expected: snapshot.files[c.path]?.sha256 ?? null }));
   if (planned.project) changes.push({ path: '.devforge/project.json', text: JSON.stringify(planned.project, null, 2) + '\n', expected: snapshot.files['.devforge/project.json']?.sha256 ?? null });
   if (changes.length) await host.templates.apply({ root: host.ws.root, changes });
   if (['cmake','cpp','c'].includes(planned.project?.projectType)) await fs.mkdir(await host.ws.writable('build'), { recursive: true });
   if (d.installRequirements) for (const id of [...instance.requires.addons, ...instance.requires.tools.map(id => 'studio.tool.' + id)]) await handle(host, 'nativeAddonToggle', { id, enable: true });
   return { state: await host.state(), entryFile: planned.entryFile, project: planned.project };
  }
  throw Error('Unknown native service: ' + op);
 };
}
module.exports = { services };
