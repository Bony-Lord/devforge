package dev.forge.ide;

import java.util.Arrays;
import java.io.IOException;

public final class FileCodecTest {
    static int checks;
    static void check(boolean valid,String label){checks++;if(!valid)throw new AssertionError(label);}
    static void roundTrip(String encoding,String text)throws Exception{byte[] bytes=FileCodec.encode(text,encoding);var decoded=FileCodec.decode(bytes,encoding);check(decoded.text.equals(text),encoding+" text");check(Arrays.equals(bytes,FileCodec.encode(decoded.text,decoded.encoding)),encoding+" byte preservation");}
    public static void main(String[] args)throws Exception{
        for(String encoding:new String[]{"UTF-8","UTF-8-BOM","UTF-16LE","UTF-16BE"}){
            roundTrip(encoding,"// Привет 🙂\r\nint main() { return 0; }\r\n");
            var decoded=FileCodec.decode(FileCodec.encode("Привет 🙂",encoding),"auto");check(decoded.encoding.equals(encoding)&&decoded.text.equals("Привет 🙂"),encoding+" BOM detection");
        }
        roundTrip("windows-1251","// Привет, мир!\r\n");roundTrip("KOI8-R","Привет, мир!");roundTrip("ISO-8859-1","café");roundTrip("Shift_JIS","日本語");roundTrip("US-ASCII","int x = 1;\n");
        check(FileCodec.decode(new byte[0],"auto").text.isEmpty(),"Empty file");
        try{FileCodec.decode(new byte[]{(byte)0xd0},"UTF-8");throw new AssertionError("Truncated UTF-8 accepted");}catch(IOException expected){checks++;}
        try{FileCodec.encode("Привет 🙂","windows-1251");throw new AssertionError("Unrepresentable text accepted");}catch(IOException expected){checks++;}
        try{FileCodec.encode("bad\ud800","UTF-8");throw new AssertionError("Unpaired surrogate accepted");}catch(IOException expected){checks++;}
        check(!FileCodec.decode(FileCodec.encode("Привет","windows-1251"),"windows-1251").text.contains("\ufffd"),"No replacement characters");
        System.out.println(checks+" file encoding checks passed");
    }
}
