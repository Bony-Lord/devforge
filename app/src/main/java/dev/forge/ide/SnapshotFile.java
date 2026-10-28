package dev.forge.ide;

import java.io.*;
import java.nio.file.*;

/** One bounded snapshot, atomically replaced, with a validated previous snapshot. */
final class SnapshotFile {
    interface Validator {void validate(byte[] bytes)throws Exception;}
    interface Probe {void phase(String phase)throws IOException;}
    final File file,backup;final int limit;final Validator validator;final Probe probe;
    boolean recovered;
    SnapshotFile(File file,int limit,Validator validator){this(file,limit,validator,phase->{});}
    SnapshotFile(File file,int limit,Validator validator,Probe probe){this.file=file;backup=new File(file+".backup");this.limit=limit;this.validator=validator;this.probe=probe;}
    byte[] checked(File path)throws Exception{if(path.length()>limit)throw new IOException("Addon storage exceeds size limit");byte[] data=Files.readAllBytes(path.toPath());if(data.length>limit)throw new IOException("Addon storage exceeds size limit");validator.validate(data);return data;}
    synchronized byte[] read()throws Exception{
        if(!file.exists()&&!backup.exists())return null;
        try{return checked(file);}catch(Exception invalid){if(!backup.exists())throw new IOException("Addon storage is damaged",invalid);byte[] previous=checked(backup);replace(file,previous);recovered=true;return previous;}
    }
    synchronized void write(byte[] data)throws Exception{
        if(data.length>limit)throw new IOException("Addon storage exceeds size limit");validator.validate(data);byte[] previous=read();
        if(previous!=null)replace(backup,previous);probe.phase("backup");replace(file,data);
    }
    void replace(File target,byte[] data)throws IOException{
        File parent=target.getParentFile();if(!parent.isDirectory()&&!parent.mkdirs())throw new IOException("Cannot create addon storage");
        File temp=File.createTempFile("snapshot-",".new",parent);
        try{try(FileOutputStream out=new FileOutputStream(temp)){out.write(data);out.getFD().sync();}if(target.equals(file))probe.phase("staged");Files.move(temp.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
        finally{Files.deleteIfExists(temp.toPath());}
    }
}
