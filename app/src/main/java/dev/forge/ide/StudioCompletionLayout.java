package dev.forge.ide;

import android.view.View;
import android.widget.ListView;
import io.github.rosemoe.sora.widget.component.DefaultCompletionLayout;

/** Reveals a completion directly; never waits on UI layout from a UI-thread loop. */
final class StudioCompletionLayout extends DefaultCompletionLayout {
    private int requestedPosition,increment;
    private boolean scheduled;
    int requests,reveals;
    final Runnable reveal=()->{
        scheduled=false;
        ListView list=getCompletionList();
        if(list.getAdapter()==null||list.getCount()==0)return;
        int position=Math.max(0,Math.min(requestedPosition,list.getCount()-1));
        if(position==0&&increment==0){list.setSelectionFromTop(0,0);reveals++;return;}
        int first=list.getFirstVisiblePosition(),last=list.getLastVisiblePosition();
        View row=list.getChildAt(position-first);
        if(position<first||position>last||row==null||row.getTop()<list.getPaddingTop()||row.getBottom()>list.getHeight()-list.getPaddingBottom()){
            int height=Math.max(1,row==null?Math.abs(increment):row.getHeight());
            list.setSelectionFromTop(position,Math.max(list.getPaddingTop(),(list.getHeight()-height)/2));reveals++;
        }
    };
    @Override public void ensureListPositionVisible(int position,int incrementPixels){
        requestedPosition=position;increment=incrementPixels;requests++;
        if(!scheduled){scheduled=true;getCompletionList().postOnAnimation(reveal);}
    }
}
