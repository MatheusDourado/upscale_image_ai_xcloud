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
 function render(s,time=1){engine.render(input,128,96,{gpuBudget:0,cleanup:0,deband:0,sharpness:0,...s},time);return pixels();}
 function step(a,b){ctx.fillStyle=`rgb(${a},${a},${a})`;ctx.fillRect(0,0,64,96);ctx.fillStyle=`rgb(${b},${b},${b})`;ctx.fillRect(64,0,64,96);}
 step(100,120);
 for(const processing of ['cas','usm'])for(const processingMode of ['performance','quality']){
  const p=render({processing,processingMode,sharpness:10});const edge=[];
  for(let x=60;x<68;x++)edge.push(p[(40*128+x)*4]);
  check(Math.min(...edge)>=96&&Math.max(...edge)<=124,'Halo bound '+processing+' '+processingMode,edge);
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
 // Count real draw submissions to protect the low-cost default and bypass paths.
 const draw=engine.draw.bind(engine);let passes=[];engine.draw=(name,...args)=>{passes.push(name);return draw(name,...args);};
 render({cleanup:.35,deband:.3,sharpness:2});
 check(passes.length<=2,'Default native pipeline uses at most two passes',passes);
 passes=[];render({});check(passes.length===1,'Disabled treatments bypass intermediate passes',passes);
 check(Object.keys(engine.targets).length===0,'Disabled treatments release unused intermediate textures',Object.keys(engine.targets));
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
