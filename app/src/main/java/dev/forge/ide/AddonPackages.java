package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Data-only packages. A library transaction keeps the previous packages AND profile. */
final class AddonPackages {
    final IdeEngine ide;final SnapshotFile file;JSONObject data;boolean transactionRecovered;
    AddonPackages(IdeEngine ide){this.ide=ide;file=new SnapshotFile(new File(ide.app.getFilesDir(),"addons/library.json"),8*1024*1024,this::validateLibrary);}
    static JSONObject copy(JSONObject value)throws JSONException{return new JSONObject(value.toString());}
    static void profile(JSONObject p)throws Exception{if(p==null||p.optInt("schemaVersion")!=1||p.toString().length()>65536||p.optJSONArray("requested")==null||p.getJSONArray("requested").length()>128)throw new IOException("Invalid addon profile");}
    static String key(JSONObject p)throws Exception{JSONObject m=p.getJSONObject("manifest");String id=m.getString("id"),version=m.getString("version");if(id.length()>100||!id.matches("[a-z][a-z0-9-]*\\.[a-z][a-z0-9.-]*")||!version.matches("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)"))throw new IOException("Invalid addon identity");return id+"@"+version;}
    static void keys(JSONObject object,String... allowed)throws Exception{Set<String> names=new HashSet<>(Arrays.asList(allowed));Iterator<String> it=object.keys();while(it.hasNext())if(!names.contains(it.next()))throw new IOException("Unsupported data addon field");}
    static void label(Object value)throws Exception{if(value instanceof String){if(((String)value).isEmpty()||((String)value).length()>240)throw new IOException("Invalid addon label");return;}if(!(value instanceof JSONObject)||((JSONObject)value).length()==0)throw new IOException("Invalid addon label");JSONObject labels=(JSONObject)value;Iterator<String> it=labels.keys();while(it.hasNext()){String locale=it.next();if(!locale.matches("[a-z]{2}(-[A-Za-z]{2,4})?")||!(labels.get(locale)instanceof String))throw new IOException("Invalid addon label");label(labels.get(locale));}}
    static void range(Object value)throws Exception{if(value instanceof String){version((String)value);return;}if(!(value instanceof JSONObject))throw new IOException("Invalid addon version range");JSONObject r=(JSONObject)value;keys(r,"min","maxExclusive");if(r.has("min"))version(r.getString("min"));if(r.has("maxExclusive"))version(r.getString("maxExclusive"));}
    static void version(String value)throws Exception{if(!value.matches("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)"))throw new IOException("Invalid addon version");for(String component:value.split("\\."))if(component.length()>16||Long.parseLong(component)>9007199254740991L)throw new IOException("Invalid addon version");}
    static void pack(JSONObject p)throws Exception{
        key(p);keys(p,"format","formatVersion","manifest","contributions");if(!"cppstudio.addon".equals(p.optString("format"))||!(p.get("formatVersion")instanceof Number)||p.getDouble("formatVersion")!=1||p.toString().getBytes(StandardCharsets.UTF_8).length>262144)throw new IOException("Invalid data addon package");
        JSONObject m=p.getJSONObject("manifest");if(m.optInt("schemaVersion")!=1||!m.has("api"))throw new IOException("Unsupported addon manifest");JSONArray capabilities=m.getJSONArray("capabilities"),contributions=p.getJSONArray("contributions");if(capabilities.length()>64||contributions.length()>128)throw new IOException("Addon limit exceeded");
        version(m.getString("version"));range(m.get("api"));label(m.get("name"));if(!(m.get("license")instanceof String)||m.getString("license").isEmpty()||m.getString("license").length()>100)throw new IOException("Missing addon license");
        Set<String> granted=new HashSet<>();for(int i=0;i<capabilities.length();i++)granted.add(capabilities.getString(i));
        for(int i=0;i<capabilities.length();i++)if(!Arrays.asList("ui.commands","ui.theme","projects.templates","editor.snippets").contains(capabilities.getString(i)))throw new IOException("Unsupported addon capability");
        Set<String> ids=new HashSet<>();for(int i=0;i<contributions.length();i++){
            JSONObject c=contributions.getJSONObject(i);keys(c,"point","id","value");String point=c.getString("point"),id=c.getString("id");if(!id.startsWith(m.getString("id")+"/")||id.length()>180||!ids.add(id))throw new IOException("Invalid addon contribution id");JSONObject value=c.getJSONObject("value");
            if(point.equals("commands")){keys(value,"label","action");label(value.get("label"));if(!granted.contains("ui.commands")||!Arrays.asList("editor.focus","editor.resetZoom","ui.settings","ui.focusMode").contains(value.getString("action")))throw new IOException("Unsupported addon command");}
            else if(point.equals("themes")){keys(value,"dark","light");if(!granted.contains("ui.theme")||value.length()==0)throw new IOException("Invalid addon theme");Iterator<String> modes=value.keys();while(modes.hasNext()){JSONObject colors=value.getJSONObject(modes.next());if(colors.length()==0)throw new IOException("Invalid addon colors");keys(colors,"--bg","--deep","--panel","--elev","--hover","--line","--text","--muted","--accent","--accent-bg","--green","--red","--yellow","--purple","--cyan","--surface-inset","--surface-active");Iterator<String> names=colors.keys();while(names.hasNext())if(!colors.getString(names.next()).matches("#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?"))throw new IOException("Invalid addon color");}}
            else if(point.equals("snippets")){keys(value,"language","prefix","label","body","description");if(!granted.contains("editor.snippets"))throw new IOException("Snippet capability denied");for(String field:new String[]{"language","prefix","label","body"})if(!(value.get(field)instanceof String)||value.getString(field).isEmpty())throw new IOException("Invalid snippet");if(value.getString("language").length()>80||value.getString("prefix").length()>160||value.getString("label").length()>160||value.getString("body").length()>16384||value.optString("description").length()>240)throw new IOException("Snippet limit exceeded");}
            else if(point.equals("projectTemplates")){if(!granted.contains("projects.templates")||!value.optString("id").startsWith(m.getString("id")+"."))throw new IOException("Invalid template contribution ownership");ProjectTemplateFiles.validateTemplate(value);}
            else throw new IOException("Unsupported addon contribution");
        }
    }
    void validateLibrary(byte[] bytes)throws Exception{
        JSONObject value=new JSONObject(new String(bytes,StandardCharsets.UTF_8));validateSnapshot(value);
        JSONObject pending=value.optJSONObject("pending");if(pending!=null){if(pending.getJSONObject("before").has("pending"))throw new IOException("Nested addon transaction");validateSnapshot(pending.getJSONObject("before"));pending.getString("token");}
    }
    void validateSnapshot(JSONObject value)throws Exception{if(value.optInt("schemaVersion")!=1||value.getLong("revision")<0)throw new IOException("Invalid addon library");profile(value.getJSONObject("profile"));JSONArray entries=value.getJSONArray("packages");if(entries.length()>128||entries.toString().getBytes(StandardCharsets.UTF_8).length>2*1024*1024)throw new IOException("Addon library limit exceeded");Set<String> keys=new HashSet<>();for(int i=0;i<entries.length();i++){JSONObject entry=entries.getJSONObject(i),p=entry.getJSONObject("package");pack(p);if(!keys.add(key(p)))throw new IOException("Duplicate installed addon");}}
    void write(JSONObject next)throws Exception{file.write(next.toString().getBytes(StandardCharsets.UTF_8));data=next;}
    synchronized void load()throws Exception{
        if(data!=null)return;byte[] bytes=file.read();
        if(bytes==null){JSONObject old=new JSONObject(ide.prefs.getString("addons","{}"));if(!old.has("schemaVersion"))old=new JSONObject().put("schemaVersion",1).put("requested",new JSONArray()).put("safeMode",false).put("activating",false);profile(old);write(new JSONObject().put("schemaVersion",1).put("revision",0).put("packages",new JSONArray()).put("profile",old));}
        else{data=new JSONObject(new String(bytes,StandardCharsets.UTF_8));if(data.has("pending")){JSONObject previous=copy(data.getJSONObject("pending").getJSONObject("before"));previous.put("revision",data.getLong("revision")+1);write(previous);transactionRecovered=true;}}
    }
    synchronized JSONObject state()throws Exception{load();JSONObject result=copy(data);result.remove("pending");result.put("pending",data.has("pending"));result.put("recovered",transactionRecovered||file.recovered);return result;}
    synchronized JSONObject stateProfile()throws Exception{load();return copy(data.getJSONObject("profile"));}
    synchronized boolean enabled(String id)throws Exception{load();JSONObject p=data.getJSONObject("profile");if(p.optInt("modulesVersion")<1)return true;JSONArray resolved=p.optJSONArray("resolved");if(resolved!=null)for(int i=0;i<resolved.length();i++)if(id.equals(resolved.optString(i)))return true;return false;}
    void require(String id)throws Exception{if(!enabled(id))throw new IOException("Enable addon: "+id);}
    synchronized Object saveProfile(JSONObject p)throws Exception{load();profile(p);JSONObject next=copy(data);next.put("profile",copy(p)).put("revision",data.getLong("revision")+1);write(next);return true;}
    synchronized JSONArray catalog()throws Exception{try(InputStream in=ide.app.getAssets().open("ui/addons/catalog.json")){return new JSONArray(IdeEngine.slurp(in,1024*1024));}}
    static String hash(JSONObject p)throws Exception{byte[] bytes=MessageDigest.getInstance("SHA-256").digest(p.toString().getBytes(StandardCharsets.UTF_8));StringBuilder result=new StringBuilder();for(byte b:bytes)result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();}
    synchronized JSONObject begin(JSONObject request)throws Exception{
        load();if(data.has("pending"))throw new IOException("Another addon transaction is pending");if(request.getLong("revision")!=data.getLong("revision"))throw new IOException("Addon library changed; retry the operation");
        JSONObject next=copy(data),p=request.getJSONObject("profile");profile(p);next.put("profile",copy(p));JSONArray entries=next.getJSONArray("packages"),installs=request.optJSONArray("install");
        Map<String,JSONObject> official=new HashMap<>();JSONArray offered=catalog();for(int i=0;i<offered.length();i++){JSONObject pkg=offered.getJSONObject(i);official.put(key(pkg),pkg);}
        if(installs!=null)for(int i=0;i<installs.length();i++){
            JSONObject item=installs.getJSONObject(i),pkg;String source;
            if(item.has("official")){pkg=official.get(item.getString("official"));if(pkg==null)throw new IOException("Official addon not found");source="bundled-catalog";}
            else{if(!request.optBoolean("accepted"))throw new IOException("Review and accept the addon installation notice first");pkg=item.getJSONObject("package");if(pkg.getJSONObject("manifest").getString("id").startsWith("studio."))throw new IOException("The studio namespace is reserved");source="local";}
            pack(pkg);String identity=key(pkg);JSONObject existing=null;for(int j=0;j<entries.length();j++)if(key(entries.getJSONObject(j).getJSONObject("package")).equals(identity))existing=entries.getJSONObject(j);
            if(existing!=null){if(!hash(existing.getJSONObject("package")).equals(hash(pkg)))throw new IOException("Addon version already exists with different content");continue;}
            JSONObject entry=new JSONObject().put("package",copy(pkg)).put("source",source).put("sha256",hash(pkg)).put("installedAt",System.currentTimeMillis());if(source.equals("local")){String origin=request.optString("origin","local-file");if(origin.length()>2048)throw new IOException("Addon origin too long");entry.put("consent",new JSONObject().put("noticeVersion",1).put("acceptedAt",System.currentTimeMillis())).put("origin",origin);}entries.put(entry);
        }
        String remove=request.optString("remove","");if(!remove.isEmpty()){JSONArray kept=new JSONArray();boolean found=false;for(int i=0;i<entries.length();i++){JSONObject entry=entries.getJSONObject(i);if(key(entry.getJSONObject("package")).equals(remove))found=true;else kept.put(entry);}if(!found)throw new IOException("Installed addon not found");next.put("packages",kept);}
        next.put("revision",data.getLong("revision")+1);String token=UUID.randomUUID().toString();next.put("pending",new JSONObject().put("token",token).put("before",copy(data)));write(next);return new JSONObject().put("token",token).put("library",state());
    }
    synchronized JSONObject finish(String token,boolean commit)throws Exception{
        load();JSONObject pending=data.optJSONObject("pending");if(pending==null||!pending.getString("token").equals(token))throw new IOException("Stale addon transaction");JSONObject next=commit?copy(data):copy(pending.getJSONObject("before"));next.remove("pending");next.put("revision",data.getLong("revision")+1);write(next);return state();
    }
}
