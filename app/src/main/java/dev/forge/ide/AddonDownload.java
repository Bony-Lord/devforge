package dev.forge.ide;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/** Download bounded data without executing or installing it. Redirects remain HTTPS. */
final class AddonDownload {
    static final int LIMIT=262144;
    static URL address(String input)throws IOException {
        URL url=new URL(input);
        if(!url.getProtocol().equals("https")||url.getHost().isEmpty()||url.getUserInfo()!=null||url.getRef()!=null)throw new IOException("Use an HTTPS package URL without credentials or a fragment");
        return url;
    }
    static final class Result {final String text,sha256,url;Result(String t,String h,String u){text=t;sha256=h;url=u;}}
    static byte[] readBounded(InputStream stream)throws IOException{return readBounded(stream,Long.MAX_VALUE);}
    static byte[] readBounded(InputStream stream,long deadline)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];for(int n;(n=stream.read(buffer))!=-1;){if(System.nanoTime()>deadline)throw new IOException("Package download timed out");if(out.size()+n>LIMIT)throw new IOException("Addon package exceeds 256 KiB");out.write(buffer,0,n);}return out.toByteArray();}
    static Result fetch(String input,String expected)throws Exception {
        if(!expected.isEmpty()&&!expected.matches("[a-fA-F0-9]{64}"))throw new IOException("Invalid expected SHA-256");
        URL url=address(input);long deadline=System.nanoTime()+30_000_000_000L;
        for(int redirects=0;redirects<6;redirects++){
            int remaining=(int)Math.min(12000,(deadline-System.nanoTime())/1_000_000);if(remaining<=0)throw new IOException("Package download timed out");HttpURLConnection connection=(HttpURLConnection)url.openConnection();connection.setConnectTimeout(remaining);connection.setReadTimeout(remaining);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Accept","application/json, application/octet-stream");
            try{
                int code=connection.getResponseCode();
                if(code==301||code==302||code==303||code==307||code==308){String location=connection.getHeaderField("Location");if(location==null)throw new IOException("Missing package redirect");url=address(new URL(url,location).toString());continue;}
                if(code!=200)throw new IOException("Package download HTTP "+code);
                if(connection.getContentLengthLong()>LIMIT)throw new IOException("Addon package exceeds 256 KiB");
                byte[] bytes;try(InputStream stream=connection.getInputStream()){bytes=readBounded(stream,deadline);}StringBuilder digest=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))digest.append(String.format(Locale.ROOT,"%02x",b&255));String hash=digest.toString();if(!expected.isEmpty()&&!hash.equalsIgnoreCase(expected))throw new IOException("Addon SHA-256 mismatch");
                return new Result(new String(bytes,StandardCharsets.UTF_8),hash,url.toExternalForm());
            }finally{connection.disconnect();}
        }
        throw new IOException("Too many package redirects");
    }
}
