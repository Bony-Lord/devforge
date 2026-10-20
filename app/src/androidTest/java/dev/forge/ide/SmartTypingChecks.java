package dev.forge.ide;

import android.os.*;
import android.view.KeyEvent;
import android.view.inputmethod.*;
import org.json.*;

/** Calls the actual Android IME, key, clipboard and undo paths, not the JS model API. */
final class SmartTypingChecks {
    final NativeInputInstrumentation host;final NativeEditorHost.StudioCodeEditor editor;
    SmartTypingChecks(NativeInputInstrumentation host){this.host=host;editor=(NativeEditorHost.StudioCodeEditor)host.editor;}
    void reset(String marked)throws Exception{int at=marked.indexOf('|');String value=marked.replace("|","");host.ui(()->{var t=editor.getText();t.replace(0,0,t.getLineCount()-1,t.getColumnCount(t.getLineCount()-1),value);var p=t.getIndexer().getCharPosition(at);editor.setSelection(p.line,p.column);editor.requestFocus();editor.onCreateInputConnection(new EditorInfo());editor.notifyIMEExternalCursorChange();return null;});}
    void input(String text)throws Exception{String before=marked();host.ui(()->{editor.currentInput.commitText(text,1);return null;});if(text.equals("\n"))for(int n=0;n<100&&marked().equals(before);n++)SystemClock.sleep(10);host.waitForIdleSync();}
    String marked()throws Exception{return host.ui(()->{String s=editor.getText().toString();int at=editor.getCursor().getRight();return s.substring(0,at)+"|"+s.substring(at);});}
    void expect(String name,String value)throws Exception{String actual=marked();host.check(name,actual.equals(value),actual);}
    void run()throws Exception{host.ui(()->{editor.setLineSeparator(io.github.rosemoe.sora.text.LineSeparator.LF);return null;});
        host.ui(()->{editor.typing.options.indent=4;editor.typing.options.tab=4;editor.typing.options.continuation=4;editor.typing.options.tabs=false;return null;});
        reset("|");input("{");input("\n");expect("IME Enter keeps the paired closing brace at its base indent","{\n    |\n}");
        reset("    if (ok) |");input("{");input("\n");expect("Nested IME Enter indents the body and restores the closing brace","    if (ok) {\n        |\n    }");
        reset("call|");input("(");input("(");input("x");input(")");input(")");expect("Continuous IME typing skips both existing nested closers","call((x))|");
        reset("call(value|)");host.ui(()->{editor.setSelection(0,0);editor.setSelection(0,10);editor.notifyIMEExternalCursorChange();return null;});input(")");expect("A valid closer can be skipped after caret navigation","call(value)|");
        reset("bad|)");input(")");expect("An orphan closer receives the typed character instead of a skip","bad)|)");
        reset("// |");input("{");expect("A brace in a line comment is inserted literally","// {|");
        reset("\"hello|\"");input("(");expect("A bracket inside a string is inserted literally","\"hello(|\"");
        reset("1|000");input("'");expect("C++ digit separators are not paired quotes","1'|000");
        reset("|");input("(");host.ui(()->{editor.currentInput.deleteSurroundingText(1,0);return null;});expect("IME Backspace removes an empty generated pair","|");
        reset("|");input("(");host.ui(()->{editor.undo();return null;});expect("One native undo removes a generated pair","|");
        reset("|");host.ui(()->{editor.pasteText("{");return null;});expect("Single-character native paste does not synthesize a mate","{|");
        reset("|");host.ui(()->{editor.pasteText("{\n    raw();\n}");return null;});expect("Multiline paste preserves its exact whitespace","{\n    raw();\n}|");
        reset("      |value");host.ui(()->{editor.currentInput.deleteSurroundingText(1,0);return null;});expect("IME Backspace removes indentation to the previous indent stop","    |value");
        reset("a\nb|\n");host.ui(()->{editor.typing.options.indent=2;editor.setSelectionRegion(0,0,1,1);editor.indentSelection();return null;});host.check("Selected lines indent by the profile width",host.ui(()->editor.getText().toString().equals("  a\n  b\n")),host.ui(()->editor.getText().toString()));
        host.ui(()->{editor.unindentSelection();return null;});host.check("Shift-Tab removes the profile indentation",host.ui(()->editor.getText().toString().equals("a\nb\n")),host.ui(()->editor.getText().toString()));
        reset("  {|}");input("\n");expect("Custom two-space indentation is respected by IME Enter","  {\n    |\n  }");
        reset("{|}");host.sendKeyDownUpSync(KeyEvent.KEYCODE_ENTER);expect("Hardware Enter uses the same smart newline logic","{\n  |\n}");
        reset("{|}");host.ui(()->{editor.setLineSeparator(io.github.rosemoe.sora.text.LineSeparator.CRLF);return null;});input("\n");expect("IME Enter preserves the Windows CRLF separator","{\r\n  |\r\n}");host.ui(()->{editor.setLineSeparator(io.github.rosemoe.sora.text.LineSeparator.LF);return null;});
        reset("    /**| */");input("\n");expect("IME Enter continues documentation comments","    /**\n     * |\n     */");
        if(Build.VERSION.SDK_INT>=33){reset("{|}");host.ui(()->{editor.currentInput.commitText("\n",1,null);return null;});expect("Modern IME commitText overload uses smart Enter","{\n  |\n}");}
        reset("|");host.ui(()->{editor.setLineSeparator(io.github.rosemoe.sora.text.LineSeparator.CRLF);editor.pasteText("one\ntwo\rthree\r\nfour");return null;});expect("Native paste normalizes mixed line breaks to the document format","one\r\ntwo\r\nthree\r\nfour|");host.ui(()->{editor.setLineSeparator(io.github.rosemoe.sora.text.LineSeparator.LF);return null;});
        reset("int |");host.ui(()->{editor.currentInput.setComposingText("value",1);return null;});input("\n");expect("Enter commits composing text without moving or duplicating it","int value\n|");
        reset("kept|");boolean stale=host.ui(()->{var old=editor.currentInput;editor.onCreateInputConnection(new EditorInfo());return old.commitText("\n",1);});host.check("A stale IME connection cannot insert into the new session",!stale&&marked().equals("kept|"),marked());
        host.ui(()->{editor.typing.options.indent=4;editor.typing.options.tab=4;editor.typing.options.continuation=4;host.activity.nativeEditors.pause();return null;});SystemClock.sleep(800);
    }
}
