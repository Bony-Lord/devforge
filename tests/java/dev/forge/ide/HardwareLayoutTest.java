package dev.forge.ide;
public final class HardwareLayoutTest {
    static void check(boolean value){if(!value)throw new AssertionError();}
    public static void main(String[] args){
        check(HardwareLayout.CODES.length==HardwareLayout.EN.length());check(HardwareLayout.EN.length()==HardwareLayout.RU.length());check(HardwareLayout.EN_SHIFT.length()==HardwareLayout.RU_SHIFT.length());check(HardwareLayout.EN_SHIFT.length()==HardwareLayout.EN.length());
        HardwareLayout h=new HardwareLayout();check(h.translate(45,false,false)==null);h.observe('q');check(!h.chord(true,true,true,false));check(h.chord(false,true,false,false));check(h.translate(45,false,false).equals("й"));check(h.translate(45,true,false).equals("Й"));check(h.translate(45,true,true).equals("й"));check(h.translate(9,true,false).equals("\""));check(h.translate(66,false,false)==null);
        h.chord(true,true,true,false);h.chord(true,false,true,false);check(!h.chord(false,true,false,false));check(h.russian);h.chord(true,true,true,true);check(!h.chord(false,true,false,true));
        h.chord(true,true,true,false);check(h.chord(false,true,false,false));check(h.translate(45,false,false).equals("q"));h.systemSwitch();check(h.translate(45,false,false)==null);h.observe('й');h.chord(true,true,true,false);h.chord(false,true,false,false);check(!h.russian);h.resetChord();System.out.println("HardwareLayout: all checks passed");
    }
}
