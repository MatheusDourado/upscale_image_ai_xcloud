// Better xCloud adapter and controls for the shared restoration engine.
(() => {
 const key='BxImageFilter.v3';let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
 const settings=BxRestoration.normalize(saved);
 // Native image controls own sharpening; removed experimental color overrides stay neutral.
 settings.contrast=1;settings.saturation=1;settings.shadows=0;
 const status={mode:'waiting',frames:0,lastFrame:0,resolution:'',error:'',gpuP95:null,measurement:'cadence',adaptation:'',fps:null};
 let activeEngine=null,activePlayer=null;
 const api=window.BxImageFilter={settings,status,diagnostic:false,reset(){Object.assign(settings,BxRestoration.defaults);persist();api.diagnostic=false;activeEngine?.resetBudget();if(activePlayer){activePlayer.bxReferenceFps=null;activePlayer.bxTimes=[];activePlayer.bxCadenceMark=performance.now();}}};
 function persist(){try{localStorage.setItem(key,JSON.stringify(BxRestoration.normalize(settings)));}catch{}}
 const proto=WebGL2Player.prototype,setup=proto.setupShaders,frame=proto.updateFrame,destroy=proto.destroy;
 function fallback(player){const gl=player.gl;if(gl&&!gl.isContextLost()){gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,player.bxOriginalTexture);gl.useProgram(player.program);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,player.$canvas.width,player.$canvas.height);player.updateCanvas();frame.call(player);}}
 proto.setupShaders=async function(){
  await setup.call(this);if(this.isStopped||!this.gl)return;
  this.bxEngine?.destroy();this.bxOriginalTexture=this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
  try{this.bxEngine=new BxRestoration.Engine(this.gl,BxShaders);activeEngine=this.bxEngine;activePlayer=this;status.mode='ready';status.error='';}
  catch(error){status.mode='error';status.error=String(error.message||error);console.warn('[Bx Restoration]',error);}
  finally{this.gl.bindVertexArray(null);this.gl.activeTexture(this.gl.TEXTURE0);this.gl.bindTexture(this.gl.TEXTURE_2D,this.bxOriginalTexture);this.gl.useProgram(this.program);}
  this.bxLastFrame=null;this.bxLastSettings='';this.bxTimes=[];
  if(!this.bxListeners){
   const reset=()=>{this.bxEngine?.resetHistory();this.bxLastFrame=null;this.bxReferenceFps=null;this.bxTimes=[];this.bxCadenceMark=performance.now();};
   const lost=e=>{e.preventDefault();reset();status.mode='error';status.error='Contexto GPU perdido; aguardando restauração';};
   const restored=()=>{this.bxEngine?.destroy();this.bxEngine=null;this.setupShaders().catch(e=>{status.error=String(e.message);});};
   this.bxListeners={reset,lost,restored};
   for(const name of ['seeking','pause','emptied'])this.$video.addEventListener(name,reset);
   this.$canvas.addEventListener('webglcontextlost',lost);this.$canvas.addEventListener('webglcontextrestored',restored);
  }
 };
 proto.updateFrame=function(){
  if(!this.bxEngine){fallback(this);return;}
  if(this.isStopped)return;
  const renderSettings={...settings};
  if(typeof getStreamPref==='function'){
   const sharpness=getStreamPref('video.processing.sharpness');
   if(Number.isFinite(sharpness))renderSettings.sharpness=sharpness;
   const processing=getStreamPref('video.processing'),mode=getStreamPref('video.processing.mode');
   if(['cas','usm'].includes(processing))renderSettings.processing=processing;
   if(['quality','performance'].includes(mode))renderSettings.processingMode=mode;
  }
  const video=this.$video,w=video.videoWidth||video.width,h=video.videoHeight||video.height;
  if(!w||!h)return;
  const time=Number.isFinite(video.currentTime)?video.currentTime:performance.now()/1000;
  const count=video.getVideoPlaybackQuality?.().totalVideoFrames;
  const token=count>0?`${count}:${w}:${h}`:`${time}:${w}:${h}`;
  const size=this.bxEngine.outputSize(w,h,renderSettings),ow=size.width,oh=size.height;
  const controls=JSON.stringify(renderSettings)+api.diagnostic+':'+this.bxEngine.budget.revision;
  if(this.bxMode!==settings.mode){this.bxTimes=[];this.bxCadenceMark=performance.now();this.bxMode=settings.mode;}
  if(this.bxLastFrame===token&&this.bxLastSettings===controls){this.bxEngine.poll();return;}
  // Keep the reference cadence when the budget reduces output automatically.
  // Only user-selected output/source/FPS changes invalidate the comparison.
  const conditions=`${w}:${h}:${settings.output}:${this.targetFps}`;
  if(this.bxConditions!==conditions){this.bxReferenceFps=null;this.bxTimes=[];this.bxCadenceMark=performance.now();this.bxConditions=conditions;}
  if(this.$canvas.width!==ow||this.$canvas.height!==oh){this.$canvas.width=ow;this.$canvas.height=oh;this.bxEngine.resetHistory();}
  try{
   if(!this.bxEngine.render(video,ow,oh,renderSettings,time,api.diagnostic))return;
   this.bxLastFrame=token;this.bxLastSettings=controls;
   status.mode=api.diagnostic?'diagnostic':settings.mode;status.frames=this.bxEngine.frames;status.lastFrame=Date.now();status.resolution=`${w}×${h} → ${ow}×${oh}`;
   status.gpuP95=this.bxEngine.budget.p95;status.measurement=this.bxEngine.ext?'gpu':'cadence';status.adaptation=this.bxEngine.budget.reason;
   const now=performance.now();this.bxTimes.push(now);while(this.bxTimes.length>1&&now-this.bxTimes[0]>2000)this.bxTimes.shift();
   status.fps=this.bxTimes.length>1?(this.bxTimes.length-1)*1000/(now-this.bxTimes[0]):null;
   if(now-(this.bxCadenceMark||0)>2000){
    if(settings.mode!=='filtered')this.bxReferenceFps=status.fps;
    else if(!this.bxEngine.ext)this.bxEngine.budget.cadence(this.bxReferenceFps,status.fps);
    this.bxCadenceMark=now;
   }
  }catch(error){status.mode='error';status.error=String(error.message||error);this.bxEngine.destroy();this.bxEngine=null;activeEngine=null;fallback(this);}
  finally{if(this.gl&&!this.gl.isContextLost())this.gl.useProgram(this.program);}
 };
 proto.destroy=function(){
  if(activePlayer===this)activePlayer=null;if(activeEngine===this.bxEngine)activeEngine=null;this.bxEngine?.destroy();this.bxEngine=null;
  if(this.bxListeners){const {reset,lost,restored}=this.bxListeners;for(const name of ['seeking','pause','emptied'])this.$video.removeEventListener(name,reset);this.$canvas.removeEventListener('webglcontextlost',lost);this.$canvas.removeEventListener('webglcontextrestored',restored);this.bxListeners=null;}
  status.mode='waiting';status.lastFrame=0;api.diagnostic=false;destroy.call(this);
 };
 let controlsPanel=null;
 function mountControls(parent){
  if(controlsPanel){parent.append(controlsPanel);return;}
  if(parent.querySelector('[data-bx-restoration]'))return;
  const panel=controlsPanel=document.createElement('div');panel.dataset.bxRestoration='v8';
  const title=document.createElement('p');title.textContent='Tratamento de imagem • v8';panel.append(title);
  function row(label,control){
   const wrapper=document.createElement('label');wrapper.className='bx-settings-row';
   const text=document.createElement('span');text.className='bx-settings-label';text.textContent=label;
   wrapper.append(text,control);panel.append(wrapper);return text;
  }
  const choose=document.createElement('select');choose.className='bx-focusable';choose.setAttribute('aria-label','Comparação');
  for(const [value,label]of [['original','Vídeo original'],['cas','Referência: CAS em 2'],['filtered','Novo tratamento']]){const option=document.createElement('option');option.value=value;option.textContent=label;choose.append(option);}
  choose.value=settings.mode;choose.onchange=()=>{settings.mode=choose.value;persist();};row('Comparação',choose);
  const inputs=[];
  for(const [name,label]of [['cleanup','Compressão'],['deband','Degradês'],['temporal','Estabilidade em movimento'],['antialias','Antialiasing']]){
   const input=document.createElement('input');input.type='range';input.min=0;input.max=100;input.step=1;input.className='bx-focusable';input.setAttribute('aria-label',label);
   const text=row(label,input);
   const sync=()=>{input.value=Math.round(settings[name]*100);text.textContent=`${label}: ${input.value}%`;};sync();inputs.push(sync);
   input.oninput=()=>{settings[name]=Number(input.value)/100;activeEngine?.resetBudget();sync();persist();};
  }
  function selection(label,name,options){
   const select=document.createElement('select');select.className='bx-focusable';select.setAttribute('aria-label',label);
   for(const [value,text]of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
   const sync=()=>select.value=String(settings[name]);sync();inputs.push(sync);
   select.onchange=()=>{settings[name]=name==='gpuBudget'?Number(select.value):select.value;activeEngine?.resetBudget();persist();};row(label,select);
  }
  selection('Limpeza espacial','spatialMode',[['selective','Seletiva v8'],['legacy','Referência v7.1']]);
  selection('Nitidez final','sharpening',[['native','CAS / USM nativo'],['rcas','RCAS experimental']]);
  selection('Resolução de saída','output',[['native','1080p / nativa com tratamento'],['1440','2K — 2560 × 1440'],['2160','4K — 3840 × 2160']]);
  selection('Tratamento na GPU','gpuBudget',[['3','Adaptar acima de 3 ms'],['6','Adaptar acima de 6 ms'],['10','Adaptar acima de 10 ms'],['0','Manter todos os filtros ativos']]);
  const diagnostic=document.createElement('button');diagnostic.className='bx-focusable';
  const syncDiagnostic=()=>diagnostic.textContent=api.diagnostic?'Encerrar diagnóstico':'Diagnóstico: colorir imagem';syncDiagnostic();
  diagnostic.onclick=()=>{api.diagnostic=!api.diagnostic;syncDiagnostic();};panel.append(diagnostic);
  const measure=document.createElement('button');measure.className='bx-focusable';measure.textContent='Iniciar medição';
  const exportReport=document.createElement('button');exportReport.className='bx-focusable';exportReport.textContent='Encerrar e exportar medição';
  const peer=()=>typeof STATES==='undefined'?null:STATES.currentStream?.peerConnection;
  measure.onclick=async()=>{const engine=activeEngine,video=activePlayer?.$video;if(!engine)return;measure.disabled=true;
   try{const initial=await BxRestoration.captureVideoStats(video,peer());if(activeEngine===engine){engine.diagnostics.start({userAgent:navigator.userAgent,renderer:engine.gl.getParameter(engine.gl.RENDERER),timer:!!engine.ext,floatTargets:engine.floatTargets,initial});measure.textContent='Reiniciar medição';}}
   finally{measure.disabled=false;}};
  exportReport.onclick=async()=>{const engine=activeEngine;if(!engine)return;exportReport.disabled=true;
   try{engine.poll();engine.diagnostics.stop();const report=engine.diagnostics.report();report.final=await BxRestoration.captureVideoStats(activePlayer?.$video,peer());BxRestoration.downloadReport(report);}
   finally{exportReport.disabled=false;}};
  panel.append(measure,exportReport);
  const reset=document.createElement('button');reset.className='bx-focusable';reset.textContent='Restaurar tratamento';reset.onclick=()=>{api.reset();for(const sync of inputs)sync();choose.value=settings.mode;syncDiagnostic();};panel.append(reset);
  const report=document.createElement('p');report.setAttribute('role','status');panel.append(report);
  const note=document.createElement('p');note.textContent='A intensidade usa Nitidez acima; RCAS tem escala própria e substitui CAS/USM. Comece em saída nativa, CAS 2 e 3 ms. A medição exporta tempos GPU e contadores disponíveis; não mede latência do controle. Tratamento salvo para todos os jogos.';panel.append(note);
  let interval=null;
  const refresh=()=>{
   syncDiagnostic();
   if(status.mode==='error')report.textContent='Erro: '+status.error;
   else if(!status.lastFrame||Date.now()-status.lastFrame>2500)report.textContent='Sem quadros recentes. Selecione WebGL2 durante o jogo.';
   else report.textContent=`${status.mode} • ${status.resolution} • ${status.frames} quadros • ${status.fps?.toFixed(1)||'—'} FPS\n${status.measurement==='gpu'?`GPU total p95: ${status.gpuP95?.toFixed(2)||'—'} ms`:'Sem medição GPU; apenas cadência'} ${status.adaptation}`;
  };
  // Rebuilt menu instances must not retain timers after removal.
  const observer=new MutationObserver(()=>{
   if(panel.isConnected&&!interval){refresh();interval=window.setInterval(refresh,1000);}
   else if(!panel.isConnected&&interval){window.clearInterval(interval);interval=null;}
  });observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pagehide',()=>{if(interval)window.clearInterval(interval);observer.disconnect();},{once:true});
  parent.append(panel);refresh();
 }
 api.mountControls=mountControls;
})();
