(() => {
 const video=document.querySelector('#video'),canvas=document.querySelector('#canvas'),status=document.querySelector('#status');
 const settings=BxRestoration.normalize(),gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:false});
 let engine,url,diagnostic=false,callback=null,lastFrameTime=null,lastRevision=-1,sourceConditions='',drawCount=0,start=0,cadence=[],cadenceMark=0,referenceFps=null;
 function invalidateCadence(){referenceFps=null;cadence=[];cadenceMark=performance.now();}
 try{if(!gl)throw new Error('WebGL2 indisponível');engine=new BxRestoration.Engine(gl,BxShaders);}catch(e){status.textContent=e.message;return;}
 const inputs=[];
 for(const [key,label,min,max]of [['antialias','Antialiasing',0,100],['cleanup','Compressão',0,100],['deband','Degradês',0,100],['chroma','Cor nas bordas',0,100],['detail','Detalhe',0,100],['temporal','Temporal',0,100],['contrast','Contraste',80,120],['saturation','Saturação',0,130],['shadows','Sombras',0,100]]){
  const row=document.createElement('label'),text=document.createElement('span'),input=document.createElement('input');input.type='range';input.min=min;input.max=max;
  const sync=()=>{input.value=Math.round(settings[key]*100);text.textContent=label+' '+input.value+'%';};inputs.push(sync);sync();input.oninput=()=>{settings[key]=Number(input.value)/100;engine.resetBudget();sync();draw(true);};row.append(text,input);document.querySelector('#controls').append(row);
 }
 function draw(force=false){if(video.readyState<2)return;
  const current={...settings,output:BxRestoration.resolveOutput(settings.output,Math.round(Math.min(canvas.getBoundingClientRect().height||Infinity,(canvas.getBoundingClientRect().width||0)*video.videoHeight/video.videoWidth)*(devicePixelRatio||1))||Math.round(screen.height*(devicePixelRatio||1)),video.videoHeight)};
  const size=engine.outputSize(video.videoWidth,video.videoHeight,current),w=size.width,h=size.height;
  if(!force&&lastFrameTime===video.currentTime&&lastRevision===engine.budget.revision)return;
  const conditions=`${video.videoWidth}:${video.videoHeight}:${settings.output}`;
  if(conditions!==sourceConditions){sourceConditions=conditions;invalidateCadence();}
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;engine.resetHistory();}
  try{engine.render(video,w,h,current,video.currentTime,diagnostic);lastFrameTime=video.currentTime;lastRevision=engine.budget.revision;drawCount++;
   if(!force){const now=performance.now();cadence.push(now);while(cadence.length>1&&now-cadence[0]>2000)cadence.shift();
    if(now-cadenceMark>2000&&cadence.length>2){const fps=(cadence.length-1)*1000/(now-cadence[0]);if(settings.mode!=='filtered')referenceFps=fps;else if(!engine.ext)engine.budget.cadence(referenceFps,fps);cadenceMark=now;}}
   if(!start)start=performance.now();
   status.textContent=`${settings.mode} • ${video.videoWidth}×${video.videoHeight} → ${w}×${h}\n${engine.ext?'GPU total p95: '+(engine.budget.p95?.toFixed(2)||'—')+' ms':'Sem medição GPU; somente cadência'}\n${engine.budget.reason}`;
  }catch(e){status.textContent='Erro: '+e.message;video.pause();}
 }
 function loop(){draw();callback=video.requestVideoFrameCallback?video.requestVideoFrameCallback(loop):requestAnimationFrame(loop);}
 video.addEventListener('loadeddata',()=>{engine.resetHistory();lastFrameTime=null;draw(true);if(callback===null)loop();});
 for(const event of ['seeking','pause','emptied'])video.addEventListener(event,()=>{engine.resetHistory();lastFrameTime=null;invalidateCadence();});
 document.querySelector('#file').onchange=e=>{if(url)URL.revokeObjectURL(url);const file=e.target.files[0];if(file){engine.diagnostics.stop('source-changed');url=URL.createObjectURL(file);video.src=url;start=0;drawCount=0;invalidateCadence();}};
 document.querySelector('#play').onclick=()=>video.paused?video.play().catch(e=>status.textContent=e.message):video.pause();
 document.querySelector('#mode').onchange=e=>{settings.mode=e.target.value;cadence=[];cadenceMark=performance.now();engine.resetHistory();draw(true);};
 document.querySelector('#scale').onchange=e=>{settings.output=e.target.value;engine.resetBudget();draw(true);};
 document.querySelector('#gpuBudget').onchange=e=>{settings.gpuBudget=Number(e.target.value);engine.resetBudget();draw(true);};
 for(const key of ['spatialMode','sharpening','sharpness'])document.querySelector('#'+key).onchange=e=>{settings[key]=key==='sharpness'?Number(e.target.value):e.target.value;engine.resetBudget();draw(true);};
 document.querySelector('#measure').onclick=async()=>{engine.diagnostics.start({userAgent:navigator.userAgent,renderer:gl.getParameter(gl.RENDERER),timer:!!engine.ext,floatTargets:engine.floatTargets,initial:await BxRestoration.captureVideoStats(video)});};
 document.querySelector('#report').onclick=async()=>{engine.poll();engine.diagnostics.stop();const report=engine.diagnostics.report();report.final=report.stopReason==='source-changed'?null:await BxRestoration.captureVideoStats(video);BxRestoration.downloadReport(report);};
 document.querySelector('#reset').onclick=()=>{Object.assign(settings,BxRestoration.defaults);diagnostic=false;for(const sync of inputs)sync();for(const key of ['spatialMode','sharpening','sharpness'])document.querySelector('#'+key).value=settings[key];document.querySelector('#mode').value=settings.mode;document.querySelector('#scale').value=settings.output;document.querySelector('#gpuBudget').value=String(settings.gpuBudget);engine.resetBudget();invalidateCadence();draw(true);};
 document.querySelector('#diagnostic').onclick=()=>{diagnostic=!diagnostic;draw(true);};
 document.querySelector('#export').onclick=()=>{
  draw(true);if(video.readyState<2)return;
  // Export is explicitly user initiated; only this action reads GPU pixels.
  const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d'),data=ctx.createImageData(copy.width,copy.height),stride=copy.width*4;
  for(let y=0;y<copy.height;y++)data.data.set(pixels.subarray((copy.height-y-1)*stride,(copy.height-y)*stride),y*stride);ctx.putImageData(data,0,0);
  copy.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),link=URL.createObjectURL(blob);a.href=link;a.download=`${settings.mode}-${video.currentTime.toFixed(3)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(link),1000);});
 };
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();video.pause();status.textContent='Contexto GPU perdido.';});
 canvas.addEventListener('webglcontextrestored',()=>{engine.destroy();engine=new BxRestoration.Engine(gl,BxShaders);lastFrameTime=null;draw(true);});
 window.addEventListener('pagehide',()=>{if(callback!==null){if(video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(callback);else cancelAnimationFrame(callback);}engine.destroy();if(url)URL.revokeObjectURL(url);});
})();
