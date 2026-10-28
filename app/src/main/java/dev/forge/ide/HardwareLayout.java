package dev.forge.ide;

/** App-local EN/RU layout override. Android still owns its system layout shortcut. */
final class HardwareLayout {
    Boolean russian;
    boolean systemRussian,armed,used;
    // Android key codes in physical QWERTY order; independent of system layout.
    static final int[] CODES={45,51,33,46,48,53,49,37,43,44,71,72,29,47,32,34,35,36,38,39,40,74,75,54,52,31,50,30,42,41,55,56,76,68,7,8,9,10,11,12,13,14,15,16,69,70,73};
    static final String EN="qwertyuiop[]asdfghjkl;'zxcvbnm,./`0123456789-=\\";
    static final String EN_SHIFT="QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?~)!@#$%^&*(_+|";
    static final String RU="йцукенгшщзхъфывапролджэячсмитьбю.ё0123456789-=\\";
    static final String RU_SHIFT="ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,Ё)!\"№;%:?*(_+/";
    void observe(int unicode){if(unicode>='а'&&unicode<='я'||unicode>='А'&&unicode<='Я'||unicode=='ё'||unicode=='Ё')systemRussian=true;else if(unicode>='a'&&unicode<='z'||unicode>='A'&&unicode<='Z')systemRussian=false;}
    // Toggle on release, so Alt+Shift+F and other full chords do not switch language.
    boolean chord(boolean down,boolean modifier,boolean altShift,boolean prohibited){
        if(down){if(armed&&!modifier)used=true;if(modifier&&altShift&&!prohibited&&!armed){armed=true;used=false;}}
        else if(modifier&&armed){armed=false;if(!used&&!prohibited){russian=!(russian!=null?russian:systemRussian);return true;}}
        return false;
    }
    void resetChord(){armed=used=false;}
    void systemSwitch(){russian=null;resetChord();}
    String translate(int code,boolean shift,boolean caps){if(russian==null)return null;int index=-1;for(int i=0;i<CODES.length;i++)if(CODES[i]==code){index=i;break;}if(index<0)return null;char lower=(russian?RU:EN).charAt(index),upper=(russian?RU_SHIFT:EN_SHIFT).charAt(index);return String.valueOf(Character.isLetter(lower)?(shift^caps?Character.toUpperCase(lower):lower):(shift?upper:lower));}
}
