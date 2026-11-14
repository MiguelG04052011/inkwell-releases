# Cut true-scale Lineup figures out of a dark s-lineup still (2x, 2720x1760) into transparent PNGs:
# python3 stock/figs.py footage/<date>/stills/s-lineup.jpg footage/<date>/stills  -> fig-hk.png … fig-re.png
# Soft anti-aliased alpha, grid remnants eroded, colour un-premultiplied, upscaled 2x (all figures share one px-per-cm).
# Column centres are for the 0.1.10 example comic sorted tallest first; adjust `cent` if the lineup changes.
import sys,numpy as np
from PIL import Image, ImageFilter
src,outdir=sys.argv[1],sys.argv[2]
img=Image.open(src).convert('RGB')
im=np.asarray(img).astype(float)
bg=np.array([13,13,18.])
cent={'hk':566,'br':785,'ct':986,'am':1181,'bc':1370,'so':1554,'ve':1736,'re':1915}
for k,c in cent.items():
    cx=int(c*1.36); x0=cx-150; x1=min(cx+150,im.shape[1])
    y0=int(140*1.36); y1=int(712*1.36)
    reg=im[y0:y1,x0:x1]
    d=np.abs(reg-bg).sum(2)
    soft=np.clip((d-25)/55,0,1)
    hard=Image.fromarray(((d>60)*255).astype(np.uint8)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
    a=np.minimum(soft,np.asarray(hard)/255.)
    ys,xs=np.nonzero(a>0.5)
    bx0,bx1,by0,by1=xs.min()-2,xs.max()+3,ys.min()-2,ys.max()+3
    # un-premultiply against bg to avoid dark fringe
    col=reg.copy()
    al=np.clip(a,1e-3,1)[...,None]
    col=np.clip((reg-bg*(1-al))/al,0,255)
    rgba=np.dstack([col,a*255]).astype(np.uint8)[by0:by1,bx0:bx1]
    I=Image.fromarray(rgba,'RGBA')
    I=I.resize((I.width*2,I.height*2),Image.LANCZOS)
    I.save(f'{outdir}/fig-{k}.png')
