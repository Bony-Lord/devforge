"""Rasterize DevForge's original geometric vector mark for desktop packaging."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
def image(size):
 scale=4;canvas=Image.new('RGBA',(size*scale,size*scale));draw=ImageDraw.Draw(canvas);k=size*scale/108
 def points(values):return [(round(x*k),round(y*k))for x,y in values]
 draw.rounded_rectangle((0,0,size*scale-1,size*scale-1),radius=22*k,fill='#1d222b')
 draw.polygon(points([(22,27),(39,27),(52,40),(52,68),(39,81),(22,81)]),fill='#62d8bc')
 draw.polygon(points([(33,39),(33,69),(35,69),(41,63),(41,45),(35,39)]),fill='#1d222b')
 draw.polygon(points([(62,27),(89,27),(89,38),(73,38),(73,50),(87,50),(87,61),(73,61),(73,81),(62,81)]),fill='#78a5ff')
 draw.rectangle((59*k,13*k,68*k,22*k),fill='#f0af71')
 return canvas.resize((size,size),Image.Resampling.LANCZOS)
if __name__=='__main__':
 mark=image(512);mark.save(ROOT/'desktop/icon.png');mark.save(ROOT/'desktop/icon.ico',sizes=[(n,n)for n in [16,24,32,48,64,128,256]])
 print('DevForge PNG/ICO generated from original geometric mark')
