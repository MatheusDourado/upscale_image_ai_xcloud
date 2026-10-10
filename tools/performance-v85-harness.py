from pathlib import Path
import subprocess

# Paired cost sampling: exact v8 bundle against the current build, native 1080p and forced 4K.
root = Path('output/playwright')
root.mkdir(parents=True, exist_ok=True)
(root/'baseline-v8.bundle.js').write_bytes(subprocess.check_output(['git','show','52c5fac6638367f41843c1896d90a1098ccc7d6d:output/restoration.bundle.js']))
html = r'''<!doctype html><meta charset="utf-8"><pre id="result">Running</pre><script>
(async()=>{
 const params=new URLSearchParams(location.search),baseline=params.has('baseline'),duration=Math.max(1000,Math.min(600000,Number(params.get('ms'))||5000));
 const script=document.createElement('script');script.src=baseline?'baseline-v8.bundle.js':'../restoration.bundle.js';await new Promise((ok,no)=>{script.onload=ok;script.onerror=no;document.head.append(script);});
 const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2',{antialias:false,alpha:false});
 const engine=new BxRestoration.Engine(gl,BxShaders),source=document.createElement('canvas');source.width=1920;source.height=1080;const ctx=source.getContext('2d');
 for(let x=0;x<1920;x++){const c=30+Math.floor(x/16)%100;ctx.fillStyle=`rgb(${c},${c/2},${200-c})`;ctx.fillRect(x,0,1,1080);}ctx.fillStyle='#ccc';ctx.font='42px sans-serif';ctx.fillText('1080p v8.5 GPU benchmark',180,300);
 const name=baseline?'v8':'v8.5',base={output:'native',gpuBudget:0,temporal:0};
 const configs=[{name:name+' default 1080p',w:1920,h:1080},{name:name+' default 4K',w:3840,h:2160}];
 if(!baseline)configs.splice(1,0,{name:'v8.5 without chroma/detail 1080p',w:1920,h:1080,chroma:0,detail:0});
 const results=[];
 for(const {w,h,...config} of configs){
  canvas.width=w;canvas.height=h;const settings={...base,...config};engine.resetBudget();
  for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);engine.render(source,w,h,settings,i/60);}
  for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);engine.poll();}
  const samples=[],old=engine.budget.sample.bind(engine.budget);engine.budget.sample=(ms,mode)=>{samples.push(ms);old(ms,mode);};
  const start=performance.now();let frames=0;while(performance.now()-start<duration){await new Promise(requestAnimationFrame);engine.render(source,w,h,settings,2+frames/60);frames++;}
  const elapsed=performance.now()-start;for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);engine.poll();}
  engine.budget.sample=old;
  const sorted=[...samples].sort((a,b)=>a-b),p=q=>sorted.length?sorted[Math.ceil(sorted.length*q)-1]:null;
  results.push({config:{...config,w,h},frames,drawFps:frames*1000/elapsed,samples:samples.length,gpuP50:p(.5),gpuP95:p(.95),gpuP99:p(.99)});
 }
 const debug=gl.getExtension('WEBGL_debug_renderer_info');const report={baseline,duration,userAgent:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timer:!!engine.ext,source:'static canvas; no video decode; not input latency',results};
 document.querySelector('#result').textContent=JSON.stringify(report);engine.destroy();
})().catch(e=>document.querySelector('#result').textContent=JSON.stringify({error:e.message}));
</script>'''
(root/'cost-v85.html').write_text(html)
