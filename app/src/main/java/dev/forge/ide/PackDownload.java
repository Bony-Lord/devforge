package dev.forge.ide;

import java.io.*;
import java.net.*;
import java.nio.file.Files;
import java.security.*;
import java.util.regex.*;

/** Bounded, resumable downloads. Only a verified complete archive may be extracted. */
final class PackDownload {
    interface Progress { void update(long done,long total); }
    volatile boolean cancelled;
    volatile HttpURLConnection connection;
    void reset(){cancelled=false;}
    void cancel(){cancelled=true;HttpURLConnection active=connection;if(active!=null)active.disconnect();}
    void check()throws InterruptedIOException{if(cancelled)throw new InterruptedIOException("Download cancelled");}
    static String hash(File file)throws IOException{
        try{MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] bytes=new byte[131072];int n;while((n=in.read(bytes))!=-1)digest.update(bytes,0,n);}StringBuilder hex=new StringBuilder();for(byte b:digest.digest())hex.append(String.format("%02x",b&255));return hex.toString();}catch(NoSuchAlgorithmException impossible){throw new AssertionError(impossible);}
    }
    void fetch(URL url,File file,long expected,String sha,Progress progress)throws IOException{
        if(expected<=0||!sha.matches("[a-f0-9]{64}"))throw new IOException("Invalid component metadata");
        check();long offset=file.isFile()?file.length():0;
        if(offset==expected&&hash(file).equals(sha)){progress.update(expected,expected);return;}
        if(offset>=expected){Files.deleteIfExists(file.toPath());offset=0;}
        HttpURLConnection current=(HttpURLConnection)url.openConnection();connection=current;
        current.setConnectTimeout(20000);current.setReadTimeout(15000);current.setRequestProperty("User-Agent","CppStudio/0.3.7");current.setRequestProperty("Accept-Encoding","identity");
        if(offset>0)current.setRequestProperty("Range","bytes="+offset+"-");
        try{
            check();int code=current.getResponseCode();
            if(code==200)offset=0;
            else if(code==206){
                Matcher range=Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)").matcher(String.valueOf(current.getHeaderField("Content-Range")));
                if(!range.matches()||Long.parseLong(range.group(1))!=offset||Long.parseLong(range.group(3))!=expected||Long.parseLong(range.group(2))>=expected)throw new IOException("Invalid component download range");
            }else throw new IOException("Component download HTTP "+code);
            long done=offset,last=0;progress.update(done,expected);
            try(InputStream in=current.getInputStream();OutputStream out=new FileOutputStream(file,offset>0)){
                byte[] bytes=new byte[131072];int n;
                while((n=in.read(bytes))!=-1){check();if(n>expected-done)throw new IOException("Component size mismatch");out.write(bytes,0,n);done+=n;long now=System.nanoTime();if(now-last>150000000L){progress.update(done,expected);last=now;}}
            }
            check();if(done!=expected)throw new EOFException("Component download interrupted; retry to resume");
            if(!hash(file).equals(sha)){Files.deleteIfExists(file.toPath());throw new IOException("Component checksum mismatch");}
            progress.update(done,expected);
        }finally{current.disconnect();connection=null;}
    }
}
