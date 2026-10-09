from pathlib import Path
html=r'''<!doctype html><meta charset="utf-8"><pre id="result">Loading real footage</pre><script src="../restoration.bundle.js"></script><script>
(async()=>{
 async function load(url){const video=document.createElement('video');video.muted=true;video.preload='auto';video.src=url;video.style.width='320px';video.controls=true;document.body.append(video);await new Promise((resolve,reject)=>{video.addEventListener('loadeddata',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('Cannot load '+url)),{once:true});});return video;}
 const clean=await load('../videos/hellblade-1080-reference.mp4'),degraded=await load('../videos/hellblade-1080-degraded.mp4');
 const w=1920,h=1080;
 function host(){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});return {gl,engine:new BxRestoration.Engine(gl,BxShaders)};}
 const reference=host(),modes=[{name:'CAS 2',settings:{mode:'cas'}},{name:'Spatial',settings:{mode:'filtered',temporal:0}},{name:'Temporal 30%',settings:{mode:'filtered',temporal:.3}}].map(x=>({...x,...host(),mse:0,edgeMse:0,samples:0}));
 async function seek(v,time){if(Math.abs(v.currentTime-time)<.0001)return;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Seek timeout')),5000);v.addEventListener('seeked',()=>{clearTimeout(timeout);resolve();},{once:true});v.currentTime=time;});}
 function pixels(host){const data=new Uint8Array(w*h*4);host.gl.readPixels(0,0,w,h,host.gl.RGBA,host.gl.UNSIGNED_BYTE,data);return data;}
 function lum(data,i){return .2126*data[i]+.7152*data[i+1]+.0722*data[i+2];}
 function measure(candidate,target){let mse=0,edges=0,count=0;for(let y=8;y<h-8;y+=4)for(let x=8;x<w-8;x+=4){const i=(y*w+x)*4,l=lum(target,i);if(l<5)continue;const c=lum(candidate,i);mse+=(c-l)**2;edges+=((lum(candidate,i+4)-c)-(lum(target,i+4)-l))**2;count++;}if(!count)return null;return {mse:mse/count,edges:edges/count};}
 for(let frame=0;frame<30;frame++){
  const time=5+frame/30;await Promise.all([seek(clean,time),seek(degraded,time)]);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));reference.engine.render(clean,w,h,{mode:'original'},time);const target=pixels(reference);if(reference.gl.getError()!==reference.gl.NO_ERROR)throw new Error('Reference GL error');
  for(const mode of modes){mode.engine.render(degraded,w,h,mode.settings,time);if(frame>=5){const r=measure(pixels(mode),target);if(r){mode.mse+=r.mse;mode.edgeMse+=r.edges;mode.samples++;}}}
  document.querySelector('#result').textContent='Frame '+frame+'/29';
 }
 if(modes.some(m=>m.samples<8))throw new Error('Insufficient non-black gameplay frames');
 const results=modes.map(m=>({name:m.name,frames:m.samples,lumaMSE:m.mse/m.samples,edgeMSE:m.edgeMse/m.samples,gpuTotalP95:m.engine.budget.p95}));
 for(const mode of [reference,...modes])mode.engine.destroy();
 document.querySelector('#result').textContent=JSON.stringify({source:'Official Xbox trailer, original seconds 35-45, downsampled 1080p reference, H.264 CRF32 capped at 5Mbps',results});
})().catch(error=>{document.querySelector('#result').textContent=JSON.stringify({error:error.message});console.error(error);});
</script>'''
Path('output/playwright/gameplay-quality.html').write_text(html)
