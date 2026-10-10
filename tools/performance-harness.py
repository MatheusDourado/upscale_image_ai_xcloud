from pathlib import Path
import subprocess

# Compare the current engine with the committed v7, on the same browser/GPU.
# Canvas upload is intentional: this isolates the filter, not video decoding.
root=Path('output/playwright')
root.mkdir(parents=True, exist_ok=True)
(root/'baseline-v7.bundle.js').write_bytes(subprocess.check_output(
    ['git', 'show', '1b33753:output/restoration.bundle.js']))
html=r'''<!doctype html><pre id="result">Running</pre><script>
(async()=>{
const baseline=new URLSearchParams(location.search).has('baseline');const script=document.createElement('script');script.src=baseline?'baseline-v7.bundle.js':'../restoration.bundle.js';await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;document.head.append(script);});
const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const gl=canvas.getContext('webgl2',{antialias:false,alpha:false});const engine=new BxRestoration.Engine(gl,BxShaders);
const source=document.createElement('canvas');source.width=1920;source.height=1080;const ctx=source.getContext('2d');for(let x=0;x<1920;x++){ctx.fillStyle=`rgb(${30+Math.floor(x/16)%100},${30+Math.floor(x/16)%100},${30+Math.floor(x/16)%100})`;ctx.fillRect(x,0,1,1080);}ctx.fillStyle='#ccc';ctx.font='42px sans-serif';ctx.fillText('1080p GPU benchmark',180,300);
const results=[];for(const temporal of [0,.3]){engine.resetBudget();for(let i=0;i<150;i++){await new Promise(requestAnimationFrame);engine.render(source,1920,1080,{gpuBudget:0,temporal},i/60);}for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);engine.poll();}results.push({temporal,gpuP95:engine.budget.p95,samples:engine.budget.values.length});}
const debug=gl.getExtension('WEBGL_debug_renderer_info');document.getElementById('result').textContent=JSON.stringify({baseline,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),results});engine.destroy();
})().catch(error=>{document.getElementById('result').textContent=JSON.stringify({error:String(error)});});
</script>'''
(root/'cost-v7.html').write_text(html)
