// Better xCloud adapter for the shared restoration engine: rendering, frame timing, stream telemetry
// and the window.BxImageFilter API read by the panel (panel.js) and the in-game HUD (hud.js).
(() => {
 // v9 has measured defaults; a new key keeps v8.x saved values from overriding them.
 const key='BxImageFilter.v9';let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
 const settings=BxRestoration.normalize(saved);
 // Native image controls own sharpening; removed experimental color overrides stay neutral.
 settings.contrast=1;settings.saturation=1;settings.shadows=0;
 const status={mode:'waiting',frames:0,lastFrame:0,resolution:'',error:'',gpuP95:null,measurement:'cadence',adaptation:'',fps:null,
  // Display intervals (ms) of the last ~8 s at 30 FPS, oldest first: the HUD's pacing graph.
  intervals:[],net:null,warnings:[],adaptive:null,capture:{active:false,frames:0,reason:''}};
 let activeEngine=null,activePlayer=null;
 // Physical pixels the video occupies on screen. The canvas CSS box is fixed by Better
 // xCloud (object-fit contain), so this does not depend on the canvas backing size.
 // Without layout yet, fall back to the display/HDMI mode height.
 function displayHeight(player,w,h){
  const dpr=window.devicePixelRatio||1,rect=player?.$canvas?.getBoundingClientRect?.();
  if(rect&&rect.width>0&&rect.height>0&&w&&h)return Math.round(Math.min(rect.height,rect.width*h/w)*dpr);
  return Math.round((screen?.height||0)*dpr);
 }
 // Settings that do not change the processed image keep the GPU adaptation.
 const LIVE_KEYS=new Set(['mode','smoothing','hud','hudPosition']);
 const api=window.BxImageFilter={settings,status,diagnostic:false,panelOpen:false,presets:BxRestoration.presets,
  // Restores the treatment; the HUD choice is a display preference and stays.
  reset(){const {hud,hudPosition}=settings;Object.assign(settings,BxRestoration.defaults,{hud,hudPosition});persist();api.diagnostic=false;activeEngine?.resetBudget();if(activePlayer){activePlayer.bxReferenceFps=null;activePlayer.bxTimes=[];activePlayer.bxCadenceMark=performance.now();}},
  update(patch){Object.assign(settings,patch);if(Object.keys(patch).some(k=>!LIVE_KEYS.has(k)))activeEngine?.resetBudget();persist();},
  applyPreset(name){const p=BxRestoration.presets[name];if(p)api.update({...p.values});},
  preset:()=>BxRestoration.presetOf(settings),
  // Better xCloud keeps stream.*, server.* and userAgent.* as global prefs; video.* per stream/game.
  nativePref(k){try{if(/^(stream|server|userAgent)\./.test(k))return typeof getGlobalPref==='function'?getGlobalPref(k):undefined;return typeof getStreamPref==='function'?getStreamPref(k):undefined;}catch{return undefined;}},
  get active(){return !!status.lastFrame&&Date.now()-status.lastFrame<2500;},
  directSupported:()=>typeof MediaStreamTrackProcessor==='function'&&typeof VideoFrame==='function',
  async startMeasurement(){const engine=activeEngine,video=activePlayer?.$video;if(!engine)return false;
   const initial=await BxRestoration.captureVideoStats(video,peer());if(activeEngine!==engine)return false;
   engine.diagnostics.start({userAgent:navigator.userAgent,renderer:engine.gl.getParameter(engine.gl.RENDERER),timer:!!engine.ext,floatTargets:engine.floatTargets,initial});return true;},
  get measuring(){return !!activeEngine?.diagnostics.active;},
  async exportMeasurement(){const engine=activeEngine;if(!engine)return null;engine.poll();engine.diagnostics.stop();
   const report=engine.diagnostics.report();report.final=await BxRestoration.captureVideoStats(activePlayer?.$video,peer());report.net=status.net;BxRestoration.downloadReport(report);return report;},
  // Configuration summary to paste in a support conversation (no account data).
  configText(){const native={};for(const k of ['stream.video.resolution','stream.video.codecProfile','stream.video.maxBitrate','stream.video.preventResolutionDrops','server.region','server.bypassRestriction','userAgent.profile','video.player.type','video.processing','video.processing.mode','video.processing.sharpness','video.maxFps','video.player.powerPreference'])native[k]=api.nativePref(k)??null;
   const o=status.origin,round=v=>typeof v==='number'?Math.round(v*10)/10:v;
   return JSON.stringify({build:globalThis.BxBuild?.version,app:window.BxAndroid?.getAppInfo?.()??null,screen:`${screen.width}×${screen.height} @${window.devicePixelRatio}`,
    status:{resolution:status.resolution,fps:round(status.fps),gpuP95:status.gpuP95,adaptation:status.adaptation,smoothing:status.smoothing,fluidity:status.fluidity,capture:status.capture,adaptive:status.adaptive},
    pacing:status.pacing&&{meanMs:round(status.pacing.meanMs),deviationMs:round(status.pacing.deviationMs),p95Ms:round(status.pacing.p95Ms),hitches:status.pacing.hitches},
    origin:o&&{server:o.server&&[round(o.server.meanMs),round(o.server.deviationMs)],arrival:o.arrival&&[round(o.arrival.meanMs),round(o.arrival.deviationMs)],missed:o.missed,presented:o.presented},
    net:status.net&&Object.fromEntries(Object.entries(status.net).map(([k,v])=>[k,round(v)])),warnings:status.warnings.map(w=>w.text),
    preset:api.preset(),treatment:BxRestoration.normalize(settings),betterXcloud:native},null,1);},
 };
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
 // Stream telemetry for the panel, the HUD and the compression-adaptive treatment: one getStats per
 // second, only while one of them needs it.
 let telemetryBusy=false,lastRtp=null;
 async function pollTelemetry(){
  const pc=peer();
  if(!pc?.getStats||telemetryBusy||!(api.panelOpen||settings.hud!=='off'||settings.adaptive)){if(!pc){status.net=null;lastRtp=null;}updateWarnings();return;}
  telemetryBusy=true;
  try{let rtp=null,rtt=null;const stats=await pc.getStats();
   stats.forEach(item=>{if(item.type==='inbound-rtp'&&item.kind==='video')rtp=item;
    if(item.type==='candidate-pair'&&item.nominated&&item.state==='succeeded'&&Number.isFinite(item.currentRoundTripTime))rtt=item.currentRoundTripTime*1000;});
   if(lastRtp&&rtp&&lastRtp.id!==rtp.id)lastRtp=null;
   const info=rtp&&stats.get?.(rtp.codecId),profile=BxRestoration.h264Profile(info?.sdpFmtpLine);
   const codec=info?.mimeType?info.mimeType.replace('video/','')+(profile?' '+profile:''):null;
   const d=BxRestoration.decoderSummary(lastRtp,rtp?{...rtp,codec}:null),q=BxRestoration.streamSummary(lastRtp,rtp);lastRtp=rtp;
   status.net=d&&{codec:d.codec,profile,fpsReceived:d.fps,decoder:d.kind,implementation:d.implementation,decodeMs:d.dtMs,bufferMs:d.jitterMs,rttMs:rtt,...q};
   adaptToCompression(q?.qp??null);
  }catch{status.net=null;}finally{telemetryBusy=false;updateWarnings();}
 }
 // The quantizer level moves the treatment only after a sustained change: an exponential mean of
 // the per-second QP, and a new level only when it differs by 0.2 or more (no visible pumping).
 function adaptToCompression(qp){
  if(!Number.isFinite(qp))return;
  const a=status.adaptive,mean=a?.qpMean==null?qp:a.qpMean*.7+qp*.3,target=BxRestoration.compressionLevel(mean);
  const level=a?.level==null||Math.abs(target-a.level)>=.2?target:a.level;
  status.adaptive={qp,qpMean:mean,level,scales:BxRestoration.compressionScales(level)};
 }
 const MAX_BITRATE=15360000;
 function updateWarnings(){
  const w=[],pref=api.nativePref,net=status.net;
  if(pref('video.player.type')!==undefined&&pref('video.player.type')!=='webgl2')w.push({level:'error',key:'renderer',text:'Renderizador não é WebGL2: o tratamento está desligado.'});
  const bitrate=pref('stream.video.maxBitrate');if(bitrate>0&&bitrate<MAX_BITRATE)w.push({level:'warn',key:'bitrate',text:`Bitrate máximo limitado a ${(bitrate/1024000).toFixed(1)} Mb/s no Better xCloud: use Ilimitado.`});
  const resolution=pref('stream.video.resolution');if(resolution&&!/^1080p/.test(resolution)&&resolution!=='auto')w.push({level:'warn',key:'resolution',text:'Resolução alvo abaixo de 1080p.'});
  if(net?.height&&net.height<1000)w.push({level:'warn',key:'stream',text:`O servidor está enviando ${net.height}p.`});
  if(net?.decoder==='software')w.push({level:'warn',key:'decoder',text:'Decodificação por software (CPU).'});
  if(net?.lossPct>1)w.push({level:'warn',key:'loss',text:`Perda de pacotes de ${net.lossPct.toFixed(1)}%.`});
  // Explicit 2K/4K above the display (e.g. 1080p HDMI to a 4K TV) is scaled back down by the browser.
  if(settings.mode==='filtered'&&['1440','2160'].includes(settings.output)&&status.display&&Number(settings.output)>status.display*1.1)w.push({level:'info',key:'output',text:`Tela em ${status.display}p: saída maior só aumenta custo. Use Automática.`});
  if(status.mode==='error'&&status.error)w.push({level:'error',key:'engine',text:status.error});
  status.warnings=w;
 }
 function tick(){smoothingTick();pollTelemetry();}
 function startSmoothing(){if(smoothingTimer===null)smoothingTimer=window.setInterval(tick,1000);tick();}
 window.addEventListener('pagehide',()=>{window.clearInterval(smoothingTimer);smoothingTimer=null;releaseSmoothing();});
 window.addEventListener('pageshow',startSmoothing);
 startSmoothing();
 // Frame timing per player: capture time on the server (RTP), arrival (WebRTC receive time) and
 // display time, plus the optional pacer ("Fluidez") that shows processed frames on a steady clock.
 const keep=(list,value,now)=>{list.push([now,value]);while(list.length>1&&now-list[0][0]>2000)list.shift();};
 // Records a frame shown on screen: 2 s window for the panel's pacing line, longer ring for the HUD graph.
 function shownAt(t,now){keep(t.display,now,now);if(t.lastShown!=null){status.intervals.push(now-t.lastShown);if(status.intervals.length>240)status.intervals.shift();}t.lastShown=now;}
 const statsOf=list=>BxRestoration.frameStats(list.map(e=>e[1]));
 function startTiming(player){
  if(player.bxTiming)return;
  const t=player.bxTiming={server:[],arrival:[],display:[],presentedLog:[],clock:BxRestoration.createRtpClock(),pendingRtp:null,metaId:null,raf:null,pacer:null,shown:null};
  const video=player.$video;if(!video?.requestVideoFrameCallback)return;
  // Registered before Better xCloud's own draw callback, so a frame's metadata usually comes first;
  // attach() covers the opposite order.
  const onMeta=(now,meta)=>{
   if(player.isStopped)return;t.metaId=video.requestVideoFrameCallback(onMeta);
   const at=performance.now(),presented=meta?.presentedFrames;
   // Frames the browser presented between two callbacks never reached the treatment (nor the canvas).
   if(Number.isFinite(presented)){if(presented>t.presented)keep(t.presentedLog,presented-t.presented,at);t.presented=presented;}
   const rtp=meta&&Number.isFinite(meta.rtpTimestamp)?t.clock(meta.rtpTimestamp):null;
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
   if(f&&player.bxEngine&&player.gl&&!player.gl.isContextLost()&&player.bxEngine.present(f.slot)){t.shown=f.slot;shownAt(t,now);player.gl.useProgram(player.program);}
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
  // Compression-adaptive strengths (QP level from the telemetry; neutral until it is known).
  if(settings.adaptive&&settings.mode==='filtered'&&status.adaptive){const k=status.adaptive.scales;
   renderSettings.cleanup=Math.min(1,settings.cleanup*k.cleanup);renderSettings.deband=Math.min(1,settings.deband*k.deband);renderSettings.detail=Math.min(1,settings.detail*k.detail);}
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
    if(newFrame)shownAt(timing,performance.now());
   }
   this.bxLastFrame=token;this.bxLastSettings=controls;
   status.mode=api.diagnostic?'diagnostic':settings.mode;status.frames=this.bxEngine.frames;status.lastFrame=Date.now();status.resolution=`${w}×${h} → ${ow}×${oh}`;
   status.gpuP95=this.bxEngine.budget.p95;status.measurement=this.bxEngine.ext?'gpu':'cadence';status.adaptation=this.bxEngine.budget.reason;
   status.display=shown;
   const now=performance.now();if(newFrame)this.bxTimes.push(now);while(this.bxTimes.length>1&&now-this.bxTimes[0]>2000)this.bxTimes.shift();
   status.fps=this.bxTimes.length>1?(this.bxTimes.length-1)*1000/(this.bxTimes.at(-1)-this.bxTimes[0]):null;status.pacing=statsOf(timing.display)||BxRestoration.frameStats(this.bxTimes);status.origin={server:statsOf(timing.server),arrival:statsOf(timing.arrival),presented:timing.presentedLog.reduce((a,e)=>a+e[1],0),missed:timing.presentedLog.reduce((a,e)=>a+e[1]-1,0)};status.fluidity=timing.pacer?{mode:timing.pacer.mode,extraMs:timing.pacer.extraDelayMs,dropped:timing.pacer.dropped}:null;
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
 api.mountControls=parent=>api.panel?.mount(parent);
})();
