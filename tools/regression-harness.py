from pathlib import Path

# Pixel regressions run against the shipped engine, not a shader reimplementation.
html = r'''<!doctype html><meta charset="utf-8"><pre id="result">Running</pre>
<script src="../restoration.bundle.js"></script><script>
(()=>{
 const checks=[],failures=[];
 function check(ok,name,details){(ok?checks:failures).push({name,details});}
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;
 const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});
 const engine=new BxRestoration.Engine(gl,BxShaders);
 const input=document.createElement('canvas');input.width=128;input.height=96;const ctx=input.getContext('2d');
 function pixels(){const p=new Uint8Array(128*96*4);gl.readPixels(0,0,128,96,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
 function render(s,time=1){engine.render(input,128,96,{gpuBudget:0,cleanup:0,deband:0,chroma:0,detail:0,output:'native',sharpness:0,...s},time);return pixels();}
 function step(a,b){ctx.fillStyle=`rgb(${a},${a},${a})`;ctx.fillRect(0,0,64,96);ctx.fillStyle=`rgb(${b},${b},${b})`;ctx.fillRect(64,0,64,96);}
 step(100,120);
 for(const processing of ['cas','usm','rcas'])for(const processingMode of ['performance','quality']){
  // Halo margin scales with strength: +-4 levels at 2 (previous fixed bound), +-12 at 10.
  for(const [sharpness,margin] of [[2,4],[10,12]]){
   const p=render({processing,sharpening:processing==='rcas'?'rcas':'native',processingMode,sharpness});const edge=[];
   for(let x=60;x<68;x++)edge.push(p[(40*128+x)*4]);
   check(Math.min(...edge)>=100-margin&&Math.max(...edge)<=120+margin,'Halo bound '+processing+' '+processingMode+' '+sharpness,edge);
  }
 }
 // An averaged compression boundary has a fractional code value before presentation.
 step(50,62);const p=render({cleanup:1,deband:.3});
 const column=Array.from({length:80},(_,y)=>p[((y+8)*128+64)*4]);
 check(new Set(column).size>1,'Dither survives the complete native-resolution pipeline',{levels:[...new Set(column)]});
 const qualityPixels=render({cleanup:1,deband:.3,processingMode:'quality'});
 const qualityLevels=new Set(Array.from({length:80},(_,y)=>qualityPixels[((y+8)*128+64)*4]));
 check(qualityLevels.size>1,'Quality pipeline dithers fractional levels at presentation',[...qualityLevels]);
 // A subtle, isolated texture extremum must not be classified as a smooth gradient.
 ctx.fillStyle='rgb(100,100,100)';ctx.fillRect(0,0,128,96);
 ctx.fillStyle='rgb(104,104,104)';ctx.fillRect(64,0,1,96);
 const texture=render({deband:1});
 check(Math.abs(texture[(40*128+64)*4]-104)<=1,'Debanding preserves low-contrast thin texture',texture[(40*128+64)*4]);
 // Isoluminant colored fine text can evade a luma-only extremum detector.
 ctx.fillStyle='rgb(100,100,100)';ctx.fillRect(0,0,128,96);
 ctx.fillStyle='rgb(108,98,100)';ctx.fillRect(64,0,1,96);
 const legacy=render({deband:1,spatialMode:'legacy'}),selective=render({deband:1});
 check(Math.abs(selective[(40*128+64)*4]-108)<Math.abs(legacy[(40*128+64)*4]-108),'Selective cleanup protects isoluminant color detail',{legacy:legacy[(40*128+64)*4],selective:selective[(40*128+64)*4]});
 // Constant ramp must not be interpreted as a block discontinuity.
 for(let x=0;x<128;x++){ctx.fillStyle=`rgb(${50+x},${50+x},${50+x})`;ctx.fillRect(x,0,1,96);}
 const ramp=render({cleanup:1});
 check(Array.from({length:100},(_,x)=>ramp[(40*128+x+14)*4]===64+x).every(Boolean),'Cleanup preserves continuous ramp');
 for(const level of [0,100,255]){
  ctx.fillStyle=`rgb(${level},${level},${level})`;ctx.fillRect(0,0,128,96);
  const uniform=render({sharpening:'rcas',sharpness:10});
  check(uniform.every((v,i)=>i%4===3||Math.abs(v-level)<=1),'RCAS uniform '+level);
 }
 step(100,120);const bypass=render({sharpening:'rcas',sharpness:0});
 check(bypass[(40*128+63)*4]===100&&bypass[(40*128+64)*4]===120,'RCAS zero strength bypass');
 // v8.5: 4:2:0-like color edge. Luma steps at x=64; chroma ramps over 4 columns.
 const toRgb=(Y,cb,cr)=>{const B=cb+Y,R=cr+Y,G=(Y-.2126*R-.0722*B)/.7152;return [R,G,B].map(v=>Math.round(Math.min(255,Math.max(0,v))));};
 for(let x=0;x<128;x++){const t=Math.min(1,Math.max(0,(x-62.5)/2)),Y=x<64?70:130;const [r,g,b]=toRgb(Y,-10+t*-30,-5+t*70);ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillRect(x,0,1,96);}
 const chromaErr=px=>{let e=0;for(let x=60;x<68;x++){const i=(40*128+x)*4,Y=.2126*px[i]+.7152*px[i+1]+.0722*px[i+2],ideal=x<64?[-10,-5]:[-40,65];e+=Math.abs(px[i+2]-Y-ideal[0])+Math.abs(px[i]-Y-ideal[1]);}return e;};
 const blurred=render({}),guided=render({chroma:1});
 check(chromaErr(guided)<chromaErr(blurred)*.7,'Chroma from luma sharpens blurred 4:2:0 color edge',{before:chromaErr(blurred),after:chromaErr(guided)});
 // Isoluminant color detail has no luma guide and must keep decoded color.
 ctx.fillStyle='rgb(100,100,100)';ctx.fillRect(0,0,128,96);ctx.fillStyle='rgb(108,98,100)';ctx.fillRect(64,0,1,96);
 const iso=render({chroma:1});check(Math.abs(iso[(40*128+64)*4]-108)<=1,'Chroma reconstruction preserves isoluminant color line',iso[(40*128+64)*4]);
 // Low-contrast texture gains amplitude with detail; flat noise and edge ringing do not.
 for(let x=0;x<128;x++){const v=100+(x%6<3?6:-6);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,0,1,96);}
 const amp=px=>{let lo=255,hi=0;for(let x=20;x<100;x++){const v=px[(40*128+x)*4];lo=Math.min(lo,v);hi=Math.max(hi,v);}return hi-lo;};
 const flatTex=render({}),detailTex=render({detail:1});check(amp(detailTex)>amp(flatTex),'Detail raises low-contrast texture amplitude',{before:amp(flatTex),after:amp(detailTex)});
 let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(let y=0;y<96;y++)for(let x=0;x<128;x++){const v=100+Math.round(rnd()*2-1);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,y,1,1);}
 const sd=px=>{let a=[];for(let y=20;y<76;y++)for(let x=20;x<108;x++)a.push(px[(y*128+x)*4]);const m=a.reduce((s,v)=>s+v,0)/a.length;return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length);};
 const noise0=render({}),noise1=render({detail:1});check(sd(noise1)<=sd(noise0)*1.1,'Detail coring does not amplify faint noise',{before:sd(noise0),after:sd(noise1)});
 ctx.fillStyle='rgb(50,50,50)';ctx.fillRect(0,0,64,96);ctx.fillStyle='rgb(200,200,200)';ctx.fillRect(64,0,64,96);
 ctx.fillStyle='rgb(53,53,53)';ctx.fillRect(61,0,1,96);ctx.fillStyle='rgb(47,47,47)';ctx.fillRect(62,0,1,96);
 const ring0=render({}),ring1=render({detail:1});const ringAmp=px=>Math.max(...[59,60,61,62].map(x=>Math.abs(px[(40*128+x)*4]-50)));
 check(ringAmp(ring1)<=ringAmp(ring0)+1,'Detail does not amplify ringing beside a strong edge',{before:ringAmp(ring0),after:ringAmp(ring1)});
 step(100,120);const stepDetail=render({detail:1});check(Array.from({length:8},(_,i)=>stepDetail[(40*128+60+i)*4]).every(v=>v>=96&&v<=124),'Detail overshoot stays within CAS halo bound at a step',Array.from({length:8},(_,i)=>stepDetail[(40*128+60+i)*4]));
 // Count real draw submissions to protect the low-cost default and bypass paths.
 const draw=engine.draw.bind(engine);let passes=[];engine.draw=(name,...args)=>{passes.push(name);return draw(name,...args);};
 render({cleanup:.35,deband:.3,chroma:.5,detail:.35,sharpness:2});
 check(passes.length<=2,'Default native pipeline uses at most two passes',passes);
 passes=[];render({sharpening:'rcas',sharpness:2,cleanup:.35,deband:.3});check(passes.length===2,'RCAS retains two passes',passes);
 passes=[];render({cleanup:.35,deband:1,chroma:.5,detail:.35,antialias:1,sharpness:2});check(passes.length===2&&!passes.includes('antialias'),'AA is fused into the spatial pass without temporal',passes);
 passes=[];render({antialias:1,temporal:.3},2);check(passes.includes('antialias'),'Temporal keeps AA as a separate pass after history',passes);
 passes=[];render({});check(passes.length===1,'Disabled treatments bypass intermediate passes',passes);
 check(Object.keys(engine.targets).length===0,'Disabled treatments release unused intermediate textures',Object.keys(engine.targets));
 {let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  for(let y=0;y<96;y+=2)for(let x=0;x<128;x+=2){const v=Math.round(110+(rnd()*2-1)*8);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,y,2,2);}
  const hp=(b,i)=>4*b[i]-b[i-4]-b[i+4]-b[i-512]-b[i+512];const src=render({mode:'original'});
  const gain=b=>{let s=0,r=0;for(let y=4;y<92;y++)for(let x=4;x<124;x++){const i=(y*128+x)*4;s+=hp(b,i)*hp(src,i);r+=hp(src,i)**2;}return s/r;};
  const ref=gain(render({mode:'cas',sharpness:2})),two=gain(render({sharpness:2})),six=gain(render({sharpness:6}));
  check(two>=ref*.7&&six>ref,'Filtered sharpness reaches beyond the CAS-only reference at the same scale',{ref,two,six});}
 // Luma-only sharpening: a colored edge gains contrast without changing its chroma.
 ctx.fillStyle='rgb(150,60,60)';ctx.fillRect(0,0,64,96);ctx.fillStyle='rgb(60,60,150)';ctx.fillRect(64,0,64,96);
 {const chroma=(b,x)=>{const i=(40*128+x)*4,y=.2126*b[i]+.7152*b[i+1]+.0722*b[i+2];return [b[i]-y,b[i+2]-y];};
  const flat=render({mode:'original'}),luma=render({sharpening:'usm',lumaSharpen:true,sharpness:6}),rgb=render({sharpening:'usm',lumaSharpen:false,sharpness:6});
  const drift=b=>Math.max(...[62,63,64,65].map(x=>{const [r,u]=chroma(b,x),[r0,u0]=chroma(flat,x);return Math.max(Math.abs(r-r0),Math.abs(u-u0));}));
  check(drift(luma)<=2&&drift(rgb)>drift(luma),'Luma-only sharpening keeps edge chroma',{luma:drift(luma),rgb:drift(rgb)});}
 // Force the optional float-target capability off; this still uses real WebGL rendering.
 const getExtension=gl.getExtension.bind(gl);gl.getExtension=name=>name==='EXT_color_buffer_float'?null:getExtension(name);
 const fallback=new BxRestoration.Engine(gl,BxShaders);gl.getExtension=getExtension;
 step(50,62);fallback.render(input,128,96,{gpuBudget:0,cleanup:1,deband:.3,sharpness:0,processingMode:'quality'},1);
 const fp=pixels(),levels=new Set(Array.from({length:80},(_,y)=>fp[((y+8)*128+64)*4]));
 check(levels.size>1,'RGBA8 fallback retains dithered gradient levels',[...levels]);
 check(gl.getError()===gl.NO_ERROR,'No GL errors');
 engine.destroy();fallback.destroy();
 document.getElementById('result').textContent=JSON.stringify({passed:checks,failures});
})()
</script>'''
Path('output/playwright').mkdir(parents=True, exist_ok=True)
Path('output/playwright/regressions-v7.html').write_text(html)
