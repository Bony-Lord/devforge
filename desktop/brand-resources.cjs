'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto'),ResEdit=require('resedit');
async function brandExecutable(file,icon,version){
 const exe=ResEdit.NtExecutable.from(await fs.readFile(file),{ignoreCert:true}),res=ResEdit.NtExecutableResource.from(exe),ico=ResEdit.Data.IconFile.from(await fs.readFile(icon));
 const groups=ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);for(const group of groups.length?groups:[{id:1,lang:1033}])ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries,group.id,group.lang,ico.icons.map(item=>item.data));
 for(const vi of ResEdit.Resource.VersionInfo.fromEntries(res.entries)){vi.setStringValues({lang:1033,codepage:1200},{FileDescription:'DevForge',ProductName:'DevForge',OriginalFilename:'DevForge.exe',InternalName:'DevForge',CompanyName:'DevForge contributors',ProductVersion:version,FileVersion:version});vi.outputToResourceEntries(res.entries);}res.outputResource(exe);await fs.writeFile(file,Buffer.from(exe.generate()));
 return verifyBrand(file,icon);
}
async function verifyBrand(file,icon){const exe=ResEdit.NtExecutable.from(await fs.readFile(file),{ignoreCert:true}),res=ResEdit.NtExecutableResource.from(exe),ico=ResEdit.Data.IconFile.from(await fs.readFile(icon)),groups=ResEdit.Resource.IconGroupEntry.fromEntries(res.entries),hash=buffer=>crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex'),expected=ico.icons.map(item=>hash((item.data.isRaw()?item.data.bin:item.data.generate()))).sort();if(!groups.length)throw Error('Missing executable icon group');for(const group of groups){const actual=group.getIconItemsFromEntries(res.entries).map(item=>hash(item.isRaw()?item.bin:item.generate())).sort();if(actual.length!==expected.length||actual.some((h,i)=>h!==expected[i]))throw Error('Executable icon differs from DevForge brand');}return{iconGroups:groups.length,iconSizes:ico.icons.length};}
module.exports={brandExecutable,verifyBrand};
