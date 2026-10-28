package dev.forge.ide;

import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import android.provider.DocumentsProvider;
import android.util.Base64;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** Project browsing through Android Files. No runtime, preferences or other private files are exposed. */
public final class ProjectDocumentsProvider extends DocumentsProvider {
    static final String AUTHORITY="com.forgex.projects";
    static final String[] ROOT_COLUMNS={DocumentsContract.Root.COLUMN_ROOT_ID,DocumentsContract.Root.COLUMN_DOCUMENT_ID,DocumentsContract.Root.COLUMN_TITLE,DocumentsContract.Root.COLUMN_FLAGS,DocumentsContract.Root.COLUMN_ICON};
    static final String[] DOCUMENT_COLUMNS={DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_FLAGS,DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_LAST_MODIFIED};
    @Override public boolean onCreate(){return true;}
    static String encode(String value){return Base64.encodeToString(value.getBytes(StandardCharsets.UTF_8),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);}
    static String decode(String value){return new String(Base64.decode(value,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING),StandardCharsets.UTF_8);}
    Map<String,File> projects()throws FileNotFoundException {try{Map<String,File> result=new LinkedHashMap<>();File home=new File(getContext().getFilesDir(),"projects");File[] dirs=home.listFiles();if(dirs!=null)for(File dir:dirs)if(dir.isDirectory()&&dir.getCanonicalFile().getParentFile().equals(home.getCanonicalFile()))result.put(dir.getName(),dir.getCanonicalFile());JSONObject linked=new JSONObject(getContext().getSharedPreferences("forge",0).getString("externalProjects","{}"));for(Iterator<String> it=linked.keys();it.hasNext();){String key=it.next();File dir=new File(linked.getJSONObject(key).getString("path")).getCanonicalFile();if(dir.isDirectory())result.put(key,dir);}return result;}catch(Exception e){throw new FileNotFoundException("Cannot read project registry");}}
    File resolve(String id)throws FileNotFoundException {try{String[] parts=id.split(":",2);File root=projects().get(decode(parts[0]));if(root==null)throw new IOException();File file=parts.length==1?root:new File(root,decode(parts[1])).getCanonicalFile();if(!file.equals(root)&&!file.getPath().startsWith(root.getPath()+"/"))throw new IOException();if(!file.exists())throw new IOException();return file;}catch(Exception e){throw new FileNotFoundException("Unknown project document");}}
    static String documentId(String project,File root,File file){return encode(project)+":"+encode(root.toPath().relativize(file.toPath()).toString());}
    static Uri directoryUri(String project,File root,File directory){return DocumentsContract.buildDocumentUri(AUTHORITY,documentId(project,root,directory));}
    @Override public Cursor queryRoots(String[] projection)throws FileNotFoundException {MatrixCursor cursor=new MatrixCursor(projection==null?ROOT_COLUMNS:projection);for(var entry:projects().entrySet()){var row=cursor.newRow();row.add(DocumentsContract.Root.COLUMN_ROOT_ID,encode(entry.getKey()));row.add(DocumentsContract.Root.COLUMN_DOCUMENT_ID,documentId(entry.getKey(),entry.getValue(),entry.getValue()));row.add(DocumentsContract.Root.COLUMN_TITLE,"DevForge · "+entry.getValue().getName());row.add(DocumentsContract.Root.COLUMN_FLAGS,DocumentsContract.Root.FLAG_LOCAL_ONLY);row.add(DocumentsContract.Root.COLUMN_ICON,com.forgex.R.drawable.icon);}return cursor;}
    String mime(File file){if(file.isDirectory())return DocumentsContract.Document.MIME_TYPE_DIR;String name=file.getName().toLowerCase(Locale.ROOT);if(name.matches(".*\\.(c|cpp|cc|cxx|h|hpp|hxx|cmake|txt|md|json|yaml|yml|sh)$")||name.startsWith("."))return "text/plain";String type=android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(android.webkit.MimeTypeMap.getFileExtensionFromUrl(name));return type==null?"application/octet-stream":type;}
    void include(MatrixCursor cursor,String id,File file){var row=cursor.newRow();row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID,id);row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME,file.getName());row.add(DocumentsContract.Document.COLUMN_MIME_TYPE,mime(file));row.add(DocumentsContract.Document.COLUMN_FLAGS,0);row.add(DocumentsContract.Document.COLUMN_SIZE,file.isDirectory()?null:file.length());row.add(DocumentsContract.Document.COLUMN_LAST_MODIFIED,file.lastModified());}
    @Override public Cursor queryDocument(String id,String[] projection)throws FileNotFoundException {MatrixCursor cursor=new MatrixCursor(projection==null?DOCUMENT_COLUMNS:projection);include(cursor,id,resolve(id));return cursor;}
    @Override public Cursor queryChildDocuments(String parent,String[] projection,String sort)throws FileNotFoundException {File directory=resolve(parent);String project=decode(parent.split(":",2)[0]);File root=projects().get(project);MatrixCursor cursor=new MatrixCursor(projection==null?DOCUMENT_COLUMNS:projection);File[] files=directory.listFiles();if(files==null)throw new FileNotFoundException("Folder is not readable");Arrays.sort(files,Comparator.comparing((File f)->!f.isDirectory()).thenComparing(File::getName,String.CASE_INSENSITIVE_ORDER));for(File file:files){String id=documentId(project,root,file);try{resolve(id);include(cursor,id,file);}catch(FileNotFoundException ignored){}}return cursor;}
    @Override public ParcelFileDescriptor openDocument(String id,String mode,CancellationSignal signal)throws FileNotFoundException {if(!mode.equals("r"))throw new FileNotFoundException("Project browser is read-only; edit files in DevForge");File file=resolve(id);if(file.isDirectory())throw new FileNotFoundException("Not a regular file");return ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY);}
    @Override public boolean isChildDocument(String parent,String child){try{File a=resolve(parent),b=resolve(child);return b.getPath().startsWith(a.getPath()+"/");}catch(FileNotFoundException e){return false;}}
    @Override public DocumentsContract.Path findDocumentPath(String parent,String child)throws FileNotFoundException {File file=resolve(child);String project=decode(child.split(":",2)[0]);File root=projects().get(project),stop=parent==null?root:resolve(parent);if(!file.equals(stop)&&!file.getPath().startsWith(stop.getPath()+"/"))throw new FileNotFoundException("Outside project");List<String> path=new ArrayList<>();while(file!=null){path.add(0,documentId(project,root,file));if(file.equals(stop))break;file=file.getParentFile();}return new DocumentsContract.Path(parent==null?encode(project):null,path);}
}
