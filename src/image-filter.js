// Better xCloud adapter and controls for the shared restoration engine.
(() => {
 // v9 has measured defaults; a new key keeps v8.x saved values from overriding them.
 const key='BxImageFilter.v9';let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
 const settings=BxRestoration.normalize(saved);
 // Native image controls own sharpening; removed experimental color overrides stay neutral.
 settings.contrast=1;settings.saturation=1;settings.shadows=0;
 const status={mode:'waiting',frames:0,lastFrame:0,resolution:'',error:'',gpuP95:null,measurement:'cadence',adaptation:'',fps:null};
 let activeEngine=null,activePlayer=null;
 // Physical pixels the video occupies on screen. The canvas CSS box is fixed by Better
 // xCloud (object-fit contain), so this does not depend on the canvas backing size.
 // Without layout yet, fall back to the display/HDMI mode height.
 function displayHeight(player,w,h){
  const dpr=window.devicePixelRatio||1,rect=player?.$canvas?.getBoundingClientRect?.();
  if(rect&&rect.width>0&&rect.height>0&&w&&h)return Math.round(Math.min(rect.height,rect.width*h/w)*dpr);
  return Math.round((screen?.height||0)*dpr);
 }
 const api=window.BxImageFilter={settings,status,diagnostic:false,reset(){Object.assign(settings,BxRestoration.defaults);persist();api.diagnostic=false;activeEngine?.resetBudget();if(activePlayer){activePlayer.bxReferenceFps=null;activePlayer.bxTimes=[];activePlayer.bxCadenceMark=performance.now();}}};
 function persist(){try{localStorage.setItem(key,JSON.stringify(BxRestoration.normalize(settings)));}catch{}smoothingTick();}
 // Follow the connection independently of the renderer and whether the menu is open.
 const peer=()=>typeof STATES==='undefined'?null:STATES.currentStream?.peerConnection;
 let smoothingPeer=null,smoothingTimer=null;
 function releaseSmoothing(){try{BxRestoration.applySmoothing(smoothingPeer,0);}catch{}smoothingPeer=null;}
 function smoothingTick(){
  const current=peer();if(current!==smoothingPeer){releaseSmoothing();smoothingPeer=current;}
  try{status.smoothing=BxRestoration.applySmoothing(current,settings.smoothing);}
  catch{status.smoothing={state:'error',requestedMs:settings.smoothing};}
 }
 function startSmoothing(){if(smoothingTimer===null)smoothingTimer=window.setInterval(smoothingTick,1000);smoothingTick();}
 window.addEventListener('pagehide',()=>{window.clearInterval(smoothingTimer);smoothingTimer=null;releaseSmoothing();});
 window.addEventListener('pageshow',startSmoothing);
 startSmoothing();
 // Frame timing per player: capture time on the server (RTP), arrival (WebRTC receive time) and
 // display time, plus the optional pacer ("Fluidez") that shows processed frames on a steady clock.
 const keep=(list,value,now)=>{list.push([now,value]);while(list.length>1&&now-list[0][0]>2000)list.shift();};
 const statsOf=list=>BxRestoration.frameStats(list.map(e=>e[1]));
 function startTiming(player){
  if(player.bxTiming)return;
  const t=player.bxTiming={server:[],arrival:[],display:[],clock:BxRestoration.createRtpClock(),pendingRtp:null,metaId:null,raf:null,pacer:null,shown:null};
  const video=player.$video;if(!video?.requestVideoFrameCallback)return;
  // Registered before Better xCloud's own draw callback, so a frame's metadata usually comes first;
  // attach() covers the opposite order.
  const onMeta=(now,meta)=>{
   if(player.isStopped)return;t.metaId=video.requestVideoFrameCallback(onMeta);
   if(Number.isFinite(meta?.presentedFrames))t.presented=meta.presentedFrames;
   const rtp=meta&&Number.isFinite(meta.rtpTimestamp)?t.clock(meta.rtpTimestamp):null,at=performance.now();
   if(rtp!==null)keep(t.server,rtp,at);
   keep(t.arrival,Number.isFinite(meta?.receiveTime)?meta.receiveTime:at,at);
   if(rtp!==null&&!(t.pacer&&t.pacer.attach(rtp)))t.pendingRtp=rtp;
  };
  t.metaId=video.requestVideoFrameCallback(onMeta);
 }
 function stopPacer(player){const t=player.bxTiming;if(!t?.pacer)return;if(t.raf!==null)cancelAnimationFrame(t.raf);t.raf=null;t.pacer=null;t.shown=null;player.bxEngine?.releasePaced();}
 function stopTiming(player){const t=player.bxTiming;if(!t)return;stopPacer(player);if(t.metaId!==null)player.$video?.cancelVideoFrameCallback?.(t.metaId);player.bxTiming=null;}
 function ensurePacer(player,mode){
  const t=player.bxTiming;if(t.pacer?.mode===mode)return t.pacer;
  stopPacer(player);t.pacer=BxRestoration.createPacer(mode);
  const tick=()=>{
   if(!t.pacer||player.isStopped){t.raf=null;return;}
   t.raf=requestAnimationFrame(tick);
   const now=performance.now(),f=t.pacer.tick(now);
   if(f&&player.bxEngine&&player.gl&&!player.gl.isContextLost()&&player.bxEngine.present(f.slot)){t.shown=f.slot;keep(t.display,now,now);player.gl.useProgram(player.program);}
  };
  t.raf=requestAnimationFrame(tick);return t.pacer;
 }
 // Five persistent output textures: the one on screen, up to three queued, one being written.
 function freeSlot(t){const used=new Set([t.shown,...t.pacer.pending.map(f=>f.slot)]);for(let i=0;i<5;i++){const name='paced'+i;if(!used.has(name))return name;}return t.pacer.pending[0]?.slot||'paced0';}
 const proto=WebGL2Player.prototype,setup=proto.setupShaders,frame=proto.updateFrame,destroy=proto.destroy;
 function fallback(player){const gl=player.gl;if(gl&&!gl.isContextLost()){gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,player.bxOriginalTexture);gl.useProgram(player.program);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,player.$canvas.width,player.$canvas.height);player.updateCanvas();frame.call(player);}}
 proto.setupShaders=async function(){
  await setup.call(this);if(this.isStopped||!this.gl)return;
  this.bxEngine?.destroy();this.bxOriginalTexture=this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
  try{this.bxEngine=new BxRestoration.Engine(this.gl,BxShaders);activeEngine=this.bxEngine;activePlayer=this;status.mode='ready';status.error='';}
  catch(error){status.mode='error';status.error=String(error.message||error);console.warn('[Bx Restoration]',error);}
  finally{this.gl.bindVertexArray(null);this.gl.activeTexture(this.gl.TEXTURE0);this.gl.bindTexture(this.gl.TEXTURE_2D,this.bxOriginalTexture);this.gl.useProgram(this.program);}
  this.bxLastFrame=null;this.bxLastSettings='';this.bxTimes=[];startTiming(this);
  if(!this.bxListeners){
   const reset=()=>{this.bxEngine?.resetHistory();this.bxLastFrame=null;this.bxReferenceFps=null;this.bxTimes=[];this.bxCadenceMark=performance.now();};
   const lost=e=>{e.preventDefault();reset();status.mode='error';status.error='Contexto GPU perdido; aguardando restauração';};
   const restored=()=>{stopPacer(this);this.bxEngine?.destroy();this.bxEngine=null;this.setupShaders().catch(e=>{status.error=String(e.message);});};
   this.bxListeners={reset,lost,restored};
   for(const name of ['seeking','pause','emptied'])this.$video.addEventListener(name,reset);
   this.$canvas.addEventListener('webglcontextlost',lost);this.$canvas.addEventListener('webglcontextrestored',restored);
  }
 };
 proto.updateFrame=function(){
  if(!this.bxEngine){fallback(this);return;}
  if(this.isStopped)return;
  const renderSettings={...settings};
  // Sharpness comes from this panel (0–10, steps of 0.5), shared by the treatment and the CAS-only reference.
  if(typeof getStreamPref==='function'){
   const processing=getStreamPref('video.processing'),mode=getStreamPref('video.processing.mode');
   if(['cas','usm'].includes(processing))renderSettings.processing=processing;
   if(['quality','performance'].includes(mode))renderSettings.processingMode=mode;
  }
  const video=this.$video,w=video.videoWidth||video.width,h=video.videoHeight||video.height;
  if(!w||!h)return;
  const shown=displayHeight(this,w,h);renderSettings.output=BxRestoration.resolveOutput(settings.output,shown,h);
  const time=Number.isFinite(video.currentTime)?video.currentTime:performance.now()/1000;
  const count=video.getVideoPlaybackQuality?.().totalVideoFrames;
  // WebRTC counts totalVideoFrames on arrival, so a frame that arrived before the previous
  // callback can be presented later with the same count. The presented-frame counter from
  // requestVideoFrameCallback marks every new frame on screen.
  const presented=this.bxTiming?.presented,id=Number.isFinite(presented)?presented+'/':'';
  const token=count>0?`${id}${count}:${w}:${h}`:`${id}${time}:${w}:${h}`;
  const newFrame=this.bxLastFrame!==token;
  const size=this.bxEngine.outputSize(w,h,renderSettings),ow=size.width,oh=size.height;
  const controls=JSON.stringify(renderSettings)+api.diagnostic+':'+this.bxEngine.budget.revision;
  if(this.bxMode!==settings.mode){this.bxTimes=[];this.bxCadenceMark=performance.now();this.bxMode=settings.mode;}
  if(this.bxLastFrame===token&&this.bxLastSettings===controls){this.bxEngine.poll();return;}
  // Keep the reference cadence when the budget reduces output automatically.
  // Only user-selected output/source/FPS changes invalidate the comparison.
  const conditions=`${w}:${h}:${settings.output}:${this.targetFps}`;
  if(this.bxConditions!==conditions){this.bxReferenceFps=null;this.bxTimes=[];this.bxCadenceMark=performance.now();this.bxConditions=conditions;}
  if(this.$canvas.width!==ow||this.$canvas.height!==oh){this.$canvas.width=ow;this.$canvas.height=oh;this.bxEngine.resetHistory();stopPacer(this);}
  try{
   const timing=this.bxTiming||(startTiming(this),this.bxTiming);
   if(settings.fluidity!=='off'){
    // Process now, show on the pacer's clock. A settings change on the same frame redraws it at once.
    const pacer=ensurePacer(this,settings.fluidity),slot=newFrame||!timing.shown?freeSlot(timing):timing.shown;
    if(!this.bxEngine.render(video,ow,oh,renderSettings,time,api.diagnostic,slot))return;
    timing.lastSlot=slot;
    if(newFrame||!timing.shown){const rtp=timing.pendingRtp;timing.pendingRtp=null;pacer.add({slot,arrival:performance.now(),rtp});}
    else if(this.bxEngine.present(slot))this.gl.useProgram(this.program);
   }else{
    if(timing.pacer)stopPacer(this);
    if(!this.bxEngine.render(video,ow,oh,renderSettings,time,api.diagnostic))return;
    if(newFrame)keep(timing.display,performance.now(),performance.now());
   }
   this.bxLastFrame=token;this.bxLastSettings=controls;
   status.mode=api.diagnostic?'diagnostic':settings.mode;status.frames=this.bxEngine.frames;status.lastFrame=Date.now();status.resolution=`${w}×${h} → ${ow}×${oh}`;
   status.gpuP95=this.bxEngine.budget.p95;status.measurement=this.bxEngine.ext?'gpu':'cadence';status.adaptation=this.bxEngine.budget.reason;
   status.display=shown;
   const now=performance.now();if(newFrame)this.bxTimes.push(now);while(this.bxTimes.length>1&&now-this.bxTimes[0]>2000)this.bxTimes.shift();
   status.fps=this.bxTimes.length>1?(this.bxTimes.length-1)*1000/(this.bxTimes.at(-1)-this.bxTimes[0]):null;status.pacing=statsOf(timing.display)||BxRestoration.frameStats(this.bxTimes);status.origin={server:statsOf(timing.server),arrival:statsOf(timing.arrival)};status.fluidity=timing.pacer?{mode:timing.pacer.mode,extraMs:timing.pacer.extraDelayMs,dropped:timing.pacer.dropped}:null;
   if(newFrame&&now-(this.bxCadenceMark||0)>2000){
    if(settings.mode!=='filtered')this.bxReferenceFps=status.fps;
    else if(!this.bxEngine.ext)this.bxEngine.budget.cadence(this.bxReferenceFps,status.fps);
    this.bxCadenceMark=now;
   }
  }catch(error){status.mode='error';status.error=String(error.message||error);stopPacer(this);this.bxEngine.destroy();this.bxEngine=null;activeEngine=null;fallback(this);}
  finally{if(this.gl&&!this.gl.isContextLost())this.gl.useProgram(this.program);}
 };
 proto.destroy=function(){
  stopTiming(this);
  if(activePlayer===this)activePlayer=null;if(activeEngine===this.bxEngine)activeEngine=null;this.bxEngine?.destroy();this.bxEngine=null;
  if(this.bxListeners){const {reset,lost,restored}=this.bxListeners;for(const name of ['seeking','pause','emptied'])this.$video.removeEventListener(name,reset);this.$canvas.removeEventListener('webglcontextlost',lost);this.$canvas.removeEventListener('webglcontextrestored',restored);this.bxListeners=null;}
  status.mode='waiting';status.lastFrame=0;api.diagnostic=false;destroy.call(this);
 };
 let controlsPanel=null;
 function mountControls(parent){
  if(controlsPanel){parent.append(controlsPanel);return;}
  if(parent.querySelector('[data-bx-restoration]'))return;
  const panel=controlsPanel=document.createElement('div');panel.dataset.bxRestoration='v9.6';
  const title=document.createElement('p');title.textContent='Tratamento de imagem • v9.6';panel.append(title);
  function row(label,control){
   const wrapper=document.createElement('label');wrapper.className='bx-settings-row';
   const text=document.createElement('span');text.className='bx-settings-label';text.textContent=label;
   wrapper.append(text,control);panel.append(wrapper);return text;
  }
  const choose=document.createElement('select');choose.className='bx-focusable';choose.setAttribute('aria-label','Comparação');
  for(const [value,label]of [['original','Vídeo original'],['cas','Referência: só nitidez (sem tratamento)'],['filtered','Novo tratamento']]){const option=document.createElement('option');option.value=value;option.textContent=label;choose.append(option);}
  choose.value=settings.mode;choose.onchange=()=>{settings.mode=choose.value;persist();};row('Comparação',choose);
  const inputs=[];
  {
   const input=document.createElement('input');input.type='range';input.min=0;input.max=10;input.step=.5;input.className='bx-focusable';input.setAttribute('aria-label','Nitidez');
   const text=row('Nitidez',input);
   const sync=()=>{input.value=settings.sharpness;text.textContent=`Nitidez: ${settings.sharpness===0?'desligada':settings.sharpness.toFixed(1)}`;};sync();inputs.push(sync);
   input.oninput=()=>{settings.sharpness=Number(input.value);activeEngine?.resetBudget();sync();persist();};
  }
  for(const [name,label]of [['neural','Reconstrução neural (exp.)'],['cleanup','Compressão'],['deband','Degradês'],['chroma','Cor nas bordas'],['detail','Detalhe'],['temporal','Estabilidade em movimento'],['antialias','Antialiasing']]){
   const input=document.createElement('input');input.type='range';input.min=0;input.max=100;input.step=1;input.className='bx-focusable';input.setAttribute('aria-label',label);
   const text=row(label,input);
   const sync=()=>{input.value=Math.round(settings[name]*100);text.textContent=`${label}: ${input.value}%`;};sync();inputs.push(sync);
   input.oninput=()=>{settings[name]=Number(input.value)/100;activeEngine?.resetBudget();sync();persist();};
  }
  function selection(label,name,options){
   const select=document.createElement('select');select.className='bx-focusable';select.setAttribute('aria-label',label);
   for(const [value,text]of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
   const sync=()=>select.value=String(settings[name]);sync();inputs.push(sync);
   select.onchange=()=>{settings[name]=['gpuBudget','smoothing'].includes(name)?Number(select.value):select.value;if(name!=='smoothing')activeEngine?.resetBudget();persist();};row(label,select);
  }
  selection('Limpeza espacial','spatialMode',[['selective','Seletiva v8'],['legacy','Referência v7.1']]);
  selection('Nitidez final','sharpening',[['usm','USM (recomendado)'],['cas','AMD CAS'],['rcas','AMD RCAS'],['native','Seguir menu nativo (CAS/USM)']]);
  selection('Resolução de saída','output',[['auto','Automática — resolução da tela'],['native','1080p / nativa com tratamento'],['1440','2K — 2560 × 1440'],['2160','4K — 3840 × 2160']]);
  selection('Fluidez (ritmo de exibição)','fluidity',[['off','Desligada — exibe ao chegar'],['balanced','Equilibrada — segue o ritmo do servidor'],['max','Máxima — ritmo fixo 30/60']]);
  selection('Suavidade (buffer de vídeo)','smoothing',[['0','Automático — navegador decide'],['17','Alvo de 17 ms'],['33','Alvo de 33 ms'],['50','Alvo de 50 ms']]);
  selection('Tratamento na GPU','gpuBudget',[['3','Adaptar acima de 3 ms'],['6','Adaptar acima de 6 ms'],['10','Adaptar acima de 10 ms'],['0','Manter todos os filtros ativos']]);
  const diagnostic=document.createElement('button');diagnostic.className='bx-focusable';
  const syncDiagnostic=()=>diagnostic.textContent=api.diagnostic?'Encerrar diagnóstico':'Diagnóstico: colorir imagem';syncDiagnostic();
  diagnostic.onclick=()=>{api.diagnostic=!api.diagnostic;syncDiagnostic();};panel.append(diagnostic);
  const measure=document.createElement('button');measure.className='bx-focusable';measure.textContent='Iniciar medição';
  const exportReport=document.createElement('button');exportReport.className='bx-focusable';exportReport.textContent='Encerrar e exportar medição';
  measure.onclick=async()=>{const engine=activeEngine,video=activePlayer?.$video;if(!engine)return;measure.disabled=true;
   try{const initial=await BxRestoration.captureVideoStats(video,peer());if(activeEngine===engine){engine.diagnostics.start({userAgent:navigator.userAgent,renderer:engine.gl.getParameter(engine.gl.RENDERER),timer:!!engine.ext,floatTargets:engine.floatTargets,initial});measure.textContent='Reiniciar medição';}}
   finally{measure.disabled=false;}};
  exportReport.onclick=async()=>{const engine=activeEngine;if(!engine)return;exportReport.disabled=true;
   try{engine.poll();engine.diagnostics.stop();const report=engine.diagnostics.report();report.final=await BxRestoration.captureVideoStats(activePlayer?.$video,peer());BxRestoration.downloadReport(report);}
   finally{exportReport.disabled=false;}};
  panel.append(measure,exportReport);
  const reset=document.createElement('button');reset.className='bx-focusable';reset.textContent='Restaurar tratamento';reset.onclick=()=>{api.reset();for(const sync of inputs)sync();choose.value=settings.mode;syncDiagnostic();};panel.append(reset);
  const report=document.createElement('p');report.setAttribute('role','status');panel.append(report);
  const note=document.createElement('p');note.textContent='v9: padrões medidos em streams H.264 tipo xCloud (docs/analysis-v9.md). Nitidez e método valem para o tratamento e para a referência só nitidez. Saída Automática renderiza na altura real do vídeo na tela: em celulares (ex.: 1220–1280 px) usa FSR e aplica a nitidez já no tamanho final; com HDMI 1080p fica nativa. Fluidez: processa cada quadro ao chegar e o exibe num relógio constante (Equilibrada segue o ritmo do servidor; Máxima impõe 30/60 fixo), com alguns ms de espera mostrados no painel. Suavidade: solicita um alvo de buffer ao navegador, que pode ajustá-lo conforme a rede. Pode melhorar a regularidade com mais latência; não garante um atraso máximo. Compare o alvo solicitado com o buffer medido na linha de latência. Reconstrução neural (experimental, desligada por padrão): rede treinada em streams H.264 limpa blocos e ruído antes da nitidez; custa ~30% mais GPU e pede Nitidez ~2,5. Degradês altos e Antialiasing suavizam textura. A medição exporta tempos GPU; não mede latência do controle. Tratamento salvo para todos os jogos.';panel.append(note);
  // Explicit 2K/4K above the display (e.g. 1080p HDMI to a 4K TV) is scaled back down by the browser.
  const outputWarning=()=>settings.mode==='filtered'&&['1440','2160'].includes(settings.output)&&status.display&&Number(settings.output)>status.display*1.1?`Tela/HDMI em ${status.display}p: saída maior só aumenta custo. Use Automática.\n`:'';
  // Live decoder line: inbound-rtp video every 2 s while the panel is open.
  let decoderText='',lastRtp=null,decoderBusy=false,decoderMark=0;
  const decoderLabels={hardware:'hardware',software:'software (CPU)',unknown:'não informado pelo navegador'};
  async function updateDecoder(){
   const pc=peer();if(!pc?.getStats||decoderBusy||Date.now()-decoderMark<2000)return;decoderBusy=true;decoderMark=Date.now();
   try{let rtp=null,rtt=null;const stats=await pc.getStats();
    stats.forEach(item=>{if(item.type==='inbound-rtp'&&item.kind==='video')rtp=item;
     if(item.type==='candidate-pair'&&item.nominated&&item.state==='succeeded'&&Number.isFinite(item.currentRoundTripTime))rtt=item.currentRoundTripTime*1000;});
    const info=rtp&&stats.get?.(rtp.codecId),profile=BxRestoration.h264Profile(info?.sdpFmtpLine);
    const codec=info?.mimeType?info.mimeType.replace('video/','')+(profile?' '+profile:''):null;
    const d=BxRestoration.decoderSummary(lastRtp,rtp?{...rtp,codec}:null);lastRtp=rtp;
    const ms=v=>v===null||v===undefined?'—':v.toFixed(1)+' ms',gpu=status.measurement==='gpu'&&status.gpuP95!==null?status.gpuP95:null;
    // One line per stage: the network round trip, then what the client adds per frame.
    decoderText=d?`Codec ${d.codec||'—'} • ${d.fps?Math.round(d.fps)+' FPS recebidos':'FPS —'} • Decodificação: ${decoderLabels[d.kind]}${d.implementation?' ('+d.implementation+')':''}\n`
     +`Latência: rede (RTT) ${ms(rtt)} • buffer ${ms(d.jitterMs)} • decodificação (DT) ${ms(d.dtMs)} • tratamento ${ms(gpu)}\n`:'';}
   catch{decoderText='';}finally{decoderBusy=false;}
  }
  // Frame pacing of the last 2 s: steady 30 FPS shows ~33.3 ms, small deviation and 0 hitches.
  const pacingText=()=>{const p=status.pacing;if(!p)return '';
   const o=status.origin||{},fmt=x=>x?`${x.meanMs.toFixed(1)} ± ${x.deviationMs.toFixed(1)}`:'—',f=status.fluidity;
   return `Ritmo na tela: ${p.meanMs.toFixed(1)} ms ± ${p.deviationMs.toFixed(1)} • p95 ${p.p95Ms.toFixed(1)} ms • ${p.hitches} travada${p.hitches===1?'':'s'} em 2 s\n`
    +`Origem: servidor ${fmt(o.server)} • chegada ${fmt(o.arrival)}\n`
    +(f?`Fluidez ${f.mode==='max'?'máxima':'equilibrada'}: +${(f.extraMs??0).toFixed(1)} ms de espera • ${f.dropped} descartado${f.dropped===1?'':'s'}\n`:'');};
  const smoothingText=()=>{
   const s=status.smoothing;if(!s)return '';
   const target=s.requestedMs?`alvo solicitado ${s.requestedMs} ms`:'automático';
   const state={waiting:'aguardando vídeo',unsupported:'não suportado pelo navegador',requested:'solicitação aceita',partial:'aplicação parcial',error:'não foi possível aplicar'}[s.state];
   return `Suavidade: ${target} • ${state}. O buffer medido aparece na linha de latência.\n`;
  };
  // Configuration summary to paste in a support conversation (no account data).
  const copy=document.createElement('button');copy.className='bx-focusable';copy.textContent='Copiar configuração';
  const copyBox=document.createElement('textarea');copyBox.readOnly=true;copyBox.rows=8;copyBox.style.cssText='display:none;width:100%;font-size:11px';
  copy.onclick=async()=>{
   // Better xCloud keeps stream.*, server.* and userAgent.* as global prefs; video.* per stream/game.
   const pref=k=>{try{if(/^(stream|server|userAgent)\./.test(k))return typeof getGlobalPref==='function'?getGlobalPref(k):undefined;return typeof getStreamPref==='function'?getStreamPref(k):undefined;}catch{return undefined;}};
   const native={};for(const k of ['stream.video.resolution','stream.video.codecProfile','stream.video.maxBitrate','stream.video.preventResolutionDrops','server.region','server.bypassRestriction','userAgent.profile','video.player.type','video.processing','video.processing.mode','video.processing.sharpness','video.maxFps','video.player.powerPreference'])native[k]=pref(k)??null;
   const text=JSON.stringify({build:globalThis.BxBuild?.version,app:window.BxAndroid?.getAppInfo?.()??null,screen:`${screen.width}×${screen.height} @${window.devicePixelRatio}`,
    status:{resolution:status.resolution,fps:status.fps&&Math.round(status.fps),gpuP95:status.gpuP95,adaptation:status.adaptation,smoothing:status.smoothing,fluidity:status.fluidity},latency:decoderText.trim()||null,pacing:pacingText().trim()||null,
    treatment:BxRestoration.normalize(settings),betterXcloud:native},null,1);
   copyBox.value=text;copyBox.style.display='block';copyBox.select();
   try{await navigator.clipboard.writeText(text);copy.textContent='Configuração copiada';}catch{copy.textContent='Copie o texto abaixo';}
  };
  panel.append(copy,copyBox);
  let interval=null;
  // Android app only (window.BxAndroid bridge): fixed display refresh rate, stored natively and
  // applied at once and on app start. Added on the first refresh that sees the bridge.
  let refreshRow=null;
  function ensureRefreshRow(){
   if(refreshRow||!window.BxAndroid?.getRefreshRates)return;
   const rates=(()=>{try{return JSON.parse(window.BxAndroid.getRefreshRates());}catch{return [];}})();
   const select=document.createElement('select');select.className='bx-focusable';select.setAttribute('aria-label','Taxa da tela (app)');
   for(const [value,text]of [['0','Sistema decide'],...rates.map(r=>[String(r),`Fixar em ${r} Hz`])]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}
   select.value=String(window.BxAndroid.getRefreshRate?.()??0);
   select.onchange=()=>{window.BxAndroid.setRefreshRate(Number(select.value));};
   refreshRow=row('Taxa da tela (app)',select);panel.insertBefore(refreshRow.parentElement,report);
  }
  const refresh=()=>{
   ensureRefreshRow();
   updateDecoder();
   syncDiagnostic();
   if(status.mode==='error')report.textContent=smoothingText()+'Erro: '+status.error;
   else if(!status.lastFrame||Date.now()-status.lastFrame>2500)report.textContent=smoothingText()+decoderText+'Sem quadros recentes do tratamento. Selecione WebGL2 durante o jogo para filtrar a imagem.';
   else report.textContent=`${outputWarning()}${smoothingText()}${decoderText}${pacingText()}${status.mode} • ${status.resolution} • ${status.frames} quadros • ${status.fps?.toFixed(1)||'—'} FPS\n${status.measurement==='gpu'?`GPU total p95: ${status.gpuP95?.toFixed(2)||'—'} ms`:'Sem medição GPU; apenas cadência'} ${status.adaptation}`;
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
