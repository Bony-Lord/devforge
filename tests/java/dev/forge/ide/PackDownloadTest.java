package dev.forge.ide;

import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

public final class PackDownloadTest {
    static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);System.out.println("PASS "+message);}
    public static void main(String[] args)throws Exception{
        byte[] payload=new byte[524288];new Random(17).nextBytes(payload);Path directory=Files.createTempDirectory("studio-pack-download-");File reference=directory.resolve("reference").toFile();Files.write(reference.toPath(),payload);String sha=PackDownload.hash(reference);
        AtomicReference<String> range=new AtomicReference<>();HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{
            try{String mode=exchange.getRequestURI().getPath(),header=exchange.getRequestHeaders().getFirst("Range");range.set(header);int start=header==null||mode.equals("/ignore")?0:Integer.parseInt(header.substring(6,header.length()-1));
                if(header!=null&&!mode.equals("/ignore")){exchange.getResponseHeaders().set("Content-Range","bytes "+(mode.equals("/wrong")?start+1:start)+"-"+(payload.length-1)+"/"+payload.length);exchange.sendResponseHeaders(206,payload.length-start);}else exchange.sendResponseHeaders(200,payload.length);
                byte[] bytes=payload.clone();if(mode.equals("/corrupt"))bytes[bytes.length-1]^=1;exchange.getResponseBody().write(bytes,start,mode.equals("/short")?32768:bytes.length-start);
            }catch(IOException ignored){}finally{exchange.close();}
        });server.start();PackDownload client=new PackDownload();File target=directory.resolve("download").toFile();String address="http://127.0.0.1:"+server.getAddress().getPort();
        try{
            client.fetch(new URL(address+"/ok"),target,payload.length,sha,(done,total)->{});check(Arrays.equals(payload,Files.readAllBytes(target.toPath())),"Complete download verifies exact bytes and SHA256");
            range.set("not-requested");client.fetch(new URL(address+"/ok"),target,payload.length,sha,(done,total)->{});check("not-requested".equals(range.get()),"Complete verified cache avoids a second request");
            Files.write(target.toPath(),Arrays.copyOf(payload,12345));client.fetch(new URL(address+"/ok"),target,payload.length,sha,(done,total)->{});check("bytes=12345-".equals(range.get())&&sha.equals(PackDownload.hash(target)),"Partial download resumes using validated Content-Range");
            Files.write(target.toPath(),Arrays.copyOf(payload,23456));client.fetch(new URL(address+"/ignore"),target,payload.length,sha,(done,total)->{});check(sha.equals(PackDownload.hash(target)),"Server ignoring Range restarts without duplicating the prefix");
            Files.delete(target.toPath());try{client.fetch(new URL(address+"/short"),target,payload.length,sha,(done,total)->{});throw new AssertionError("Expected interrupted body");}catch(IOException expected){}check(target.length()>0&&target.length()<payload.length,"Interrupted response preserves resumable partial bytes");
            client.fetch(new URL(address+"/ok"),target,payload.length,sha,(done,total)->{});check(sha.equals(PackDownload.hash(target)),"Retry after interrupted body completes the archive");
            Files.write(target.toPath(),Arrays.copyOf(payload,111));try{client.fetch(new URL(address+"/wrong"),target,payload.length,sha,(done,total)->{});throw new AssertionError("Expected invalid range");}catch(IOException expected){}check(target.length()==111,"Mismatching range cannot overwrite the saved prefix");
            Files.delete(target.toPath());try{client.fetch(new URL(address+"/corrupt"),target,payload.length,sha,(done,total)->{});throw new AssertionError("Expected invalid checksum");}catch(IOException expected){}check(!target.exists(),"Checksum mismatch deletes the unusable archive");
            try{client.fetch(new URL(address+"/ok"),target,payload.length,sha,(done,total)->{if(done>0)client.cancel();});throw new AssertionError("Expected cancellation");}catch(IOException expected){}check(client.cancelled&&target.length()>0&&target.length()<payload.length,"Cancellation retains a bounded partial archive");
            client.reset();client.fetch(new URL(address+"/ok"),target,payload.length,sha,(done,total)->{});check(sha.equals(PackDownload.hash(target)),"Cancelled download resumes successfully");
            Files.write(target.toPath(),new byte[payload.length]);client.fetch(new URL(address+"/ok"),target,payload.length,sha,(done,total)->{});check(range.get()==null&&sha.equals(PackDownload.hash(target)),"Same-size corrupt cache is replaced with a verified download");
        }finally{server.stop(0);Files.deleteIfExists(target.toPath());Files.deleteIfExists(reference.toPath());Files.delete(directory);}
    }
}
