#!/usr/bin/env python3
"""Convert the selected official Lucide SVG geometry to Android vector drawables."""
from pathlib import Path
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent
names={'play':'play','pause':'pause','share':'share-2','settings':'settings-2','shield':'shield-check','disconnect':'unlink-2','link':'link-2','phone':'smartphone','clock':'clock-3','unlock':'lock-keyhole-open'}
for name,source in names.items():
 svg=ET.fromstring((root/'node_modules/lucide-static/icons'/f'{source}.svg').read_text());paths=[]
 for el in svg:
  tag=el.tag.split('}')[-1];a=el.attrib;d=None
  if tag=='path':d=a['d']
  elif tag=='line':d=f'M{a["x1"]},{a["y1"]} L{a["x2"]},{a["y2"]}'
  elif tag in ('polyline','polygon'):d='M'+a['points'].strip().replace(' ', ' L')+(' Z' if tag=='polygon' else '')
  elif tag=='circle':
   x,y,r=map(float,(a['cx'],a['cy'],a['r']));d=f'M{x-r},{y} a{r},{r} 0,1 0,{2*r},0 a{r},{r} 0,1 0,{-2*r},0'
  elif tag=='rect':
   x,y,w,h=map(float,(a.get('x',0),a.get('y',0),a['width'],a['height']));r=float(a.get('rx',0));d=f'M{x+r},{y} H{x+w-r} Q{x+w},{y} {x+w},{y+r} V{y+h-r} Q{x+w},{y+h} {x+w-r},{y+h} H{x+r} Q{x},{y+h} {x},{y+h-r} V{y+r} Q{x},{y} {x+r},{y} Z'
  else:raise ValueError(f'Unsupported Lucide element: {tag}')
  paths.append(f'<path android:fillColor="@android:color/transparent" android:strokeColor="#ffffff" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="{d}"/>')
 (root/'android/res/drawable'/f'lucide_{name}.xml').write_text('<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="20dp" android:height="20dp" android:viewportWidth="24" android:viewportHeight="24">'+''.join(paths)+'</vector>')
(root/'android/res/raw').mkdir(exist_ok=True)
(root/'android/res/raw/lucide_license.txt').write_bytes((root/'node_modules/lucide-static/LICENSE').read_bytes())
print('Synced',len(names),'Lucide Android vectors')
