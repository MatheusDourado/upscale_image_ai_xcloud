"""Generate reproducible 1080p/60 samples: bright motion + dark gradient.
No third-party footage is downloaded. Rates are encoder targets, not xCloud settings.
"""
from pathlib import Path
import subprocess
out=Path('output/videos');out.mkdir(parents=True,exist_ok=True)
base=['ffmpeg','-hide_banner','-loglevel','error','-y']
reference=out/'reference.mp4'
subprocess.run(base+['-f','lavfi','-i','testsrc2=size=1920x540:rate=60:duration=6','-f','lavfi','-i','gradients=size=1920x540:rate=60:duration=6:c0=0x040810:c1=0x384050:x0=0:y0=0:x1=1920:y1=540:speed=0.08:seed=42','-filter_complex','[0:v][1:v]vstack,format=yuv420p[v]','-map','[v]','-c:v','libx264','-preset','fast','-crf','10','-movflags','+faststart',str(reference)],check=True)
for rate in [5,15,20]:
 subprocess.run(base+['-i',str(reference),'-an','-c:v','libx264','-preset','fast','-b:v',f'{rate}M','-maxrate',f'{rate}M','-bufsize',f'{rate*2}M','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'compressed-{rate}mbps.mp4')],check=True)
 print(f'Generated {rate} Mbps target',flush=True)
print('Generated reference and three compressed samples',flush=True)
