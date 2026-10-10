from pathlib import Path
import subprocess

root = Path('output/playwright')
root.mkdir(parents=True, exist_ok=True)
(root/'baseline-v71.bundle.js').write_bytes(subprocess.check_output(['git','show','efcd80b336244f5bd0916b86441e241fd5b9eab6:output/restoration.bundle.js']))
html = r'''<!doctype html><meta charset="utf-8"><pre id="result">Running</pre><script>
(async()=>{
 const params=new URLSearchParams(location.search),baseline=params.has('baseline'),duration=Math.max(1000,Math.min(600000,Number(params.get('ms'))||10000));
 const script=document.createElement('script');script.src=baseline?'baseline-v71.bundle.js':'../restoration.bundle.js';await new Promise((ok,no)=>{script.onload=ok;script.onerror=no;document.head.append(script);});
 const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const gl=canvas.getContext('webgl2',{antialias:false,alpha:false});
 const engine=new BxRestoration.Engine(gl,BxShaders),source=document.createElement('canvas');source.width=1920;source.height=1080;const ctx=source.getContext('2d');
 for(let x=0;x<1920;x++){const c=30+Math.floor(x/16)%100;ctx.fillStyle=`rgb(${c},${c},${c})`;ctx.fillRect(x,0,1,1080);}ctx.fillStyle='#ccc';ctx.font='42px sans-serif';ctx.fillText('1080p v8 GPU benchmark',180,300);
 const results=[];
 for(const config of baseline?[{name:'v7.1'}]:[{name:'v8 selective'},{name:'v8 legacy',spatialMode:'legacy'},{name:'v8 RCAS',sharpening:'rcas'}]){
  const settings={...config,gpuBudget:0,temporal:0};engine.resetBudget();
  for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);engine.render(source,1920,1080,settings,i/60);}
  for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);engine.poll();}
  const samples=[],old=engine.budget.sample.bind(engine.budget);engine.budget.sample=(ms,mode)=>{samples.push(ms);old(ms,mode);};
  const start=performance.now();let frames=0;while(performance.now()-start<duration){await new Promise(requestAnimationFrame);engine.render(source,1920,1080,settings,2+frames/60);frames++;}
  const elapsed=performance.now()-start;for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);engine.poll();}
  const sorted=[...samples].sort((a,b)=>a-b),p=q=>sorted.length?sorted[Math.ceil(sorted.length*q)-1]:null;
  results.push({config,frames,elapsedMs:elapsed,drawFps:frames*1000/elapsed,samples:samples.length,gpuP50:p(.5),gpuP95:p(.95),gpuP99:p(.99),samplesMs:samples});
 }
 const debug=gl.getExtension('WEBGL_debug_renderer_info');const report={baseline,duration,userAgent:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timer:!!engine.ext,source:'static canvas; no video decode; not input latency',results};
 document.querySelector('#result').textContent=JSON.stringify(report);const button=document.createElement('button');button.textContent='Exportar JSON';button.onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download='cost-v8.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};document.body.append(button);engine.destroy();
})().catch(e=>document.querySelector('#result').textContent=JSON.stringify({error:e.message}));
</script>'''
(root/'cost-v8.html').write_text(html)
