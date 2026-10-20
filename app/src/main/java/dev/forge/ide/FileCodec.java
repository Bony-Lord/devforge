package dev.forge.ide;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.*;
import java.util.Arrays;

/** Explicit, lossless source-file conversion. Invalid bytes/characters never become replacement marks. */
final class FileCodec {
    static final class Decoded {
        final String text,encoding;
        Decoded(String text,String encoding){this.text=text;this.encoding=encoding;}
    }
    static Decoded decode(byte[] bytes,String requested)throws IOException {
        String encoding=requested;int offset=0;
        if(encoding==null||encoding.equals("auto")){
            if(starts(bytes,0xef,0xbb,0xbf)){encoding="UTF-8-BOM";offset=3;}
            else if(starts(bytes,0xff,0xfe)){encoding="UTF-16LE";offset=2;}
            else if(starts(bytes,0xfe,0xff)){encoding="UTF-16BE";offset=2;}
            else encoding="UTF-8";
        }else if((encoding.equals("UTF-8-BOM")||encoding.equals("UTF-8"))&&starts(bytes,0xef,0xbb,0xbf)){offset=3;encoding="UTF-8-BOM";}
        else if(encoding.equals("UTF-16LE")&&starts(bytes,0xff,0xfe)||encoding.equals("UTF-16BE")&&starts(bytes,0xfe,0xff))offset=2;
        try{return new Decoded(charset(encoding).newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes,offset,bytes.length-offset)).toString(),encoding);}
        catch(CharacterCodingException|IllegalArgumentException error){throw new IOException("Cannot decode file as "+encoding+". Select the file encoding.",error);}
    }
    static byte[] encode(String text,String encoding)throws IOException {
        try{
            ByteBuffer body=charset(encoding).newEncoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).encode(CharBuffer.wrap(text));
            byte[] prefix=encoding.equals("UTF-8-BOM")?new byte[]{(byte)0xef,(byte)0xbb,(byte)0xbf}:encoding.equals("UTF-16LE")?new byte[]{(byte)0xff,(byte)0xfe}:encoding.equals("UTF-16BE")?new byte[]{(byte)0xfe,(byte)0xff}:new byte[0];
            byte[] out=Arrays.copyOf(prefix,prefix.length+body.remaining());body.get(out,prefix.length,body.remaining());return out;
        }catch(CharacterCodingException|IllegalArgumentException error){throw new IOException("Cannot encode all characters as "+encoding+". File was not changed.",error);}
    }
    static Charset charset(String encoding){return Charset.forName(encoding.equals("UTF-8-BOM")?"UTF-8":encoding);}
    static boolean starts(byte[] bytes,int... prefix){if(bytes.length<prefix.length)return false;for(int i=0;i<prefix.length;i++)if((bytes[i]&255)!=prefix[i])return false;return true;}
}
