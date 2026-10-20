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
    void input(String text)throws Exception{host.ui(()->{editor.currentInput.commitText(text,1);return null;});}
    String marked()throws Exception{return host.ui(()->{String s=editor.getText().toString();int at=editor.getCursor().getRight();return s.substring(0,at)+"|"+s.substring(at);});}
    void expect(String name,String value)throws Exception{String actual=marked();host.check(name,actual.equals(value),actual);}
    void run()throws Exception{
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
        host.ui(()->{editor.typing.options.indent=4;editor.typing.options.tab=4;editor.typing.options.continuation=4;host.activity.nativeEditors.pause();return null;});SystemClock.sleep(800);
    }
}
