package dev.forge.ide;
import java.io.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
public final class SnapshotFileTest {
    static byte[] bytes(String s){return s.getBytes(StandardCharsets.UTF_8);}
    static void check(boolean value){if(!value)throw new AssertionError();}
    public static void main(String[] args)throws Exception{
        Path dir=Files.createTempDirectory("studio-snapshot-test-");File target=dir.resolve("library.json").toFile();SnapshotFile.Validator validate=data->{if(!new String(data,StandardCharsets.UTF_8).startsWith("valid:"))throw new IOException("invalid");};SnapshotFile store=new SnapshotFile(target,1024,validate);
        check(store.read()==null);store.write(bytes("valid:one"));store.write(bytes("valid:two"));check(new String(store.read(),StandardCharsets.UTF_8).equals("valid:two"));
        try{store.write(bytes("bad"));throw new AssertionError();}catch(IOException expected){}check(new String(store.read(),StandardCharsets.UTF_8).equals("valid:two"));
        for(String phase:new String[]{"backup","staged"}){SnapshotFile failing=new SnapshotFile(target,1024,validate,p->{if(p.equals(phase))throw new IOException("disk failure");});try{failing.write(bytes("valid:three"));throw new AssertionError();}catch(IOException expected){}check(new String(store.read(),StandardCharsets.UTF_8).equals("valid:two"));}
        Files.write(target.toPath(),bytes("truncated"));check(new String(store.read(),StandardCharsets.UTF_8).equals("valid:two"));check(store.recovered);
        try{store.write(new byte[1025]);throw new AssertionError();}catch(IOException expected){}check(new String(store.read(),StandardCharsets.UTF_8).equals("valid:two"));
        File[] leftovers=dir.toFile().listFiles((d,name)->name.endsWith(".new"));check(leftovers!=null&&leftovers.length==0);
        Files.write(target.toPath(),bytes("bad"));Files.write(store.backup.toPath(),bytes("bad"));try{store.read();throw new AssertionError();}catch(IOException expected){}
        try(var paths=Files.walk(dir)){for(Path p:paths.sorted(java.util.Comparator.reverseOrder()).toList())Files.delete(p);}System.out.println("SnapshotFile: atomic replacement, interrupted writes, limits and recovery passed");
    }
}
