package dev.forge.ide;
import java.io.*;
public final class AddonDownloadTest {
 public static void main(String[] args)throws Exception {int count=0;for(String url:new String[]{"http://example.org/a","file:///tmp/a","https://user:pass@example.org/a","https://example.org/a#fragment"}){try{AddonDownload.address(url);throw new AssertionError(url);}catch(IOException expected){count++;}}AddonDownload.address("https://example.org/a.studio-addon");count++;if(AddonDownload.readBounded(new ByteArrayInputStream(new byte[AddonDownload.LIMIT])).length!=AddonDownload.LIMIT)throw new AssertionError();count++;try{AddonDownload.readBounded(new ByteArrayInputStream(new byte[AddonDownload.LIMIT+1]));throw new AssertionError();}catch(IOException expected){count++;}System.out.println(count+" addon download boundary checks passed");}
}
