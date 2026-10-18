from pathlib import Path
# Real WebGL2 checks, without executing xCloud network/authentication code.
probe=r'''
(async()=>{
 const checks=[];function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;document.body.append(canvas);
 const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});
 const engine=new BxRestoration.Engine(gl,BxShaders);
 const input=document.createElement('canvas');input.width=128;input.height=96;const ctx=input.getContext('2d');
 const pixels=()=>{const b=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
 function pattern(){for(let x=0;x<128;x++){const v=x<64?50:62;ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,0,1,96);}ctx.fillStyle='white';ctx.fillRect(8,8,20,20);}
 pattern();const s=BxRestoration.normalize({cleanup:1,deband:0,temporal:0,mode:'original'});
 engine.render(input,128,96,s,0);const original=pixels();check(gl.getError()===gl.NO_ERROR,'Original source renders');
 s.mode='cas';engine.render(input,128,96,s,.016);const cas=pixels();check(cas.some((v,i)=>v!==original[i]),'CAS changes source');
 s.mode='filtered';engine.render(input,128,96,s,.032);const filtered=pixels();const jump=b=>Math.abs(b[(40*128+64)*4]-b[(40*128+63)*4]);
 check(jump(filtered)<jump(cas),'Compression reduces synthetic boundary discontinuity');check(filtered.some((v,i)=>v!==cas[i]),'Compression stage changes pixels');
 check(gl.getError()===gl.NO_ERROR,'Spatial and CAS shaders compile/render');
 s.cleanup=0;s.deband=0;s.detail=0;s.chroma=0;engine.render(input,128,96,s,.048);const neutral=pixels();
 check(Array.from({length:30},(_,x)=>neutral[(40*128+x+50)*4]).every(v=>v>=46&&v<=66),'Halo limiter keeps step inside neighborhood bounds');
 s.detail=BxRestoration.defaults.detail;s.chroma=BxRestoration.defaults.chroma;engine.render(input,128,96,s,.050);const stacked=pixels();
 check(Array.from({length:30},(_,x)=>stacked[(40*128+x+50)*4]).every(v=>v>=45&&v<=67),'Default detail plus CAS adds at most one level beyond the CAS bound');
 s.deband=1;for(let x=0;x<128;x++){const v=30+Math.floor(x/16)*5;ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,0,1,96);}
 s.mode='cas';engine.render(input,128,96,s,.064);const bands=pixels();s.mode='filtered';engine.render(input,128,96,s,.080);const debanded=pixels();
 check(debanded.some((v,i)=>v!==bands[i]),'Debanding changes stepped gradient');
 s.temporal=1;engine.render(input,128,96,s,.096);engine.render(input,128,96,s,.112);
 check(engine.previous!==null&&gl.getError()===gl.NO_ERROR,'Temporal block search and history run');
 ctx.fillStyle='white';ctx.fillRect(0,0,128,96);engine.render(input,128,96,s,.128);const cut=pixels();check(cut.every((v,i)=>i%4===3||v>=254),'Cut rejects old dark history');
 ctx.fillStyle='black';ctx.fillRect(0,0,128,96);engine.render(input,128,96,s,.144);const black=pixels();check(black.every((v,i)=>i%4===3||v<=1),'Black remains black without NaN');
 canvas.width=256;canvas.height=192;engine.render(input,256,192,s,.160);check(gl.getError()===gl.NO_ERROR,'FSR EASU compiles and upscales');
 check(pixels().every((v,i)=>i%4===3||v<=1),'FSR preserves flat black');
 engine.render(input,256,192,s,.176,true);check(pixels().some((v,i)=>i%4===0&&v>100),'Diagnostic tint is visible');
 s.mode='cas';engine.render(input,256,192,s,.192);check(pixels().every((v,i)=>i%4===3||v<=1),'CAS comparison removes diagnostic');
 engine.resetHistory();check(engine.previous===null,'Pause/seek clears history');
 engine.budget.temporalAllowed=false;engine.budget.debandScale=0;engine.resetBudget();check(engine.budget.temporalAllowed&&engine.budget.debandScale===1,'Reset restores performance budget');
 const adapterInput=document.createElement('canvas');adapterInput.width=128;adapterInput.height=96;adapterInput.currentTime=0;
 const player=new WebGL2Player(adapterInput);await player.setupShaders();player.updateFrame();
 check(player.gl.getParameter(player.gl.CURRENT_PROGRAM)===player.program,'Adapter restores Better xCloud GL program');
 player.refreshPlayer();check(player.gl.getError()===player.gl.NO_ERROR,'Better xCloud settings refresh remains valid');
 const count=player.bxEngine.frames;player.updateFrame();check(player.bxEngine.frames===count,'Duplicate source frame skipped');
 BxImageFilter.settings.mode='cas';player.updateFrame();check(player.bxEngine.frames===count+1,'Control change redraws paused frame');
 {const before=player.bxEngine.frames;player.bxTiming.presented=(player.bxTiming.presented||0)+1;player.updateFrame();
  check(player.bxEngine.frames===before+1,'A newly presented frame renders even when the decoded-frame counter did not advance');
  player.updateFrame();check(player.bxEngine.frames===before+1,'The same presented frame is not processed twice');}
 player.bxEngine.budget.temporalAllowed=false;BxImageFilter.reset();check(player.bxEngine.budget.temporalAllowed,'Panel reset clears adaptation');
 
 const prevCount=player.bxEngine.frames;
 BxImageFilter.settings.mode='filtered';player.updateFrame();
 const readPlayer=()=>{const b=new Uint8Array(player.$canvas.width*player.$canvas.height*4);player.gl.readPixels(0,0,player.$canvas.width,player.$canvas.height,player.gl.RGBA,player.gl.UNSIGNED_BYTE,b);return b;};
 adapterInput.getContext('2d').fillStyle='#555';adapterInput.getContext('2d').fillRect(0,0,64,96);adapterInput.getContext('2d').fillStyle='#999';adapterInput.getContext('2d').fillRect(64,0,64,96);
 BxImageFilter.settings.sharpness=0;player.updateFrame();const noSharp=readPlayer();const beforeSharpCount=player.bxEngine.frames;
 const pacingCount=player.bxTimes.length;
 BxImageFilter.settings.sharpness=5;player.updateFrame();const withSharp=readPlayer();
 check(player.bxTimes.length===pacingCount,'Redrawing the same frame after a setting change does not count as a new video frame');
 check(withSharp.some((v,i)=>v!==noSharp[i]),'Panel sharpness changes actual filtered pixels');check(player.bxEngine.frames===beforeSharpCount+1,'Panel sharpness redraws unchanged video frame');
 prefs['video.processing.sharpness']=9;player.updateFrame();check(player.bxEngine.frames===beforeSharpCount+1,'Native sharpness slider does not override the panel');
 BxImageFilter.settings.mode='cas';player.updateFrame();const refFive=readPlayer();BxImageFilter.settings.sharpness=1;player.updateFrame();
 check(readPlayer().some((v,i)=>v!==refFive[i]),'CAS-only reference follows panel sharpness');BxImageFilter.settings.mode='filtered';BxImageFilter.settings.sharpness=5;player.updateFrame();
 prefs['video.processing.mode']='quality';player.updateFrame();check(player.gl.getError()===player.gl.NO_ERROR,'Native quality mode remains valid');
 const qualityPixels=readPlayer();check(Math.abs(qualityPixels[(40*128+20)*4]-85)<=1,'Quality halo limiter preserves uniform region luminance');
 const menu=document.createElement('section');document.body.append(menu);BxImageFilter.mountControls(menu);
 check(menu.querySelector('[data-bx-restoration="v9.6.1"]')&&!document.getElementById('bx-image-filter-panel'),'Controls mount inside supplied Better xCloud menu');
 check(menu.querySelectorAll("input[type=range]").length===8,"Sharpness, neural, compression, gradient, chroma, detail, temporal and AA sliders added");check(menu.querySelector("input[aria-label=Nitidez]")?.step==="0.5","Panel sharpness slider uses half steps");
 const sharpening=menu.querySelector('[aria-label="Nitidez final"]');sharpening.value='rcas';sharpening.dispatchEvent(new Event('change'));player.updateFrame();
 check(BxImageFilter.settings.sharpening==='rcas'&&player.gl.getError()===player.gl.NO_ERROR,'RCAS selector renders through native adapter');
 const measure=[...menu.querySelectorAll('button')].find(b=>b.textContent==='Iniciar medição');await measure.onclick();
 adapterInput.currentTime+=.016;player.updateFrame();
 check(player.bxEngine.diagnostics.report().segments.length===1,'Menu starts opt-in diagnostic capture');
 let exported=null;const download=BxRestoration.downloadReport;BxRestoration.downloadReport=r=>exported=r;
 await [...menu.querySelectorAll('button')].find(b=>b.textContent==='Encerrar e exportar medição').onclick();BxRestoration.downloadReport=download;
 check(exported?.segments.length===1&&!exported.recording&&exported.final,'Menu exports a stopped diagnostic report');
 sharpening.value='native';sharpening.dispatchEvent(new Event('change'));
 const slider=menu.querySelector('input[aria-label=Compressão]');slider.value='71';slider.dispatchEvent(new Event('input'));check(BxImageFilter.settings.cleanup===.71,'Native menu controls persist settings');
 const menu2=document.createElement('section');document.body.append(menu2);BxImageFilter.mountControls(menu2);check(menu2.querySelector('input[aria-label=Compressão]').value==='71'&&!menu.querySelector('[data-bx-restoration]'),'Rebuilt menu retains controls and settings');
 // Live decoder line from a simulated WebRTC connection (two snapshots 2 s apart: 60 frames, 0.6 s decode).
 {let n=0;window.STATES={currentStream:{peerConnection:{getStats:async()=>{n++;return new Map([['v',{type:'inbound-rtp',kind:'video',framesDecoded:100+60*n,totalDecodeTime:.6*n,jitterBufferDelay:.9*n,jitterBufferEmittedCount:60*n,framesPerSecond:30,codecId:'c',powerEfficientDecoder:true,decoderImplementation:'MediaCodec'}],['c',{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=640c1f'}],['p',{type:'candidate-pair',nominated:true,state:'succeeded',currentRoundTripTime:.042}]]);}}}};
  const re=/Codec H264 High • 30 FPS recebidos • Decodificação: hardware \(MediaCodec\)\nLatência: rede \(RTT\) 42\.0 ms • buffer 15\.0 ms • decodificação \(DT\) 10\.0 ms/,status=()=>menu2.querySelector('[role=status]').textContent;
  for(let t=0;t<16&&!re.test(status());t++)await new Promise(r=>setTimeout(r,500));
  check(re.test(status()),'Panel shows codec profile, FPS, decoder and latency breakdown from WebRTC stats');
  // Smoothing reaches the video receiver of the live connection while playing.
  const receiver={track:{kind:'video'},jitterBufferTarget:null};window.STATES.currentStream.peerConnection.getReceivers=()=>[receiver];
  const smoothing=menu2.querySelector('[aria-label="Suavidade (buffer de vídeo)"]'),budgetBefore=player.bxEngine.budget;
  smoothing.value='33';smoothing.dispatchEvent(new Event('change'));
  check(receiver.jitterBufferTarget===33&&player.bxEngine.budget===budgetBefore,'Smoothing applies immediately without rendering or resetting the GPU budget');
  await new Promise(r=>setTimeout(r,1100));
  check(/alvo solicitado 33 ms/.test(status()),'Panel distinguishes the requested buffering target from measured delay');
  window.STATES.currentStream.peerConnection.getReceivers=()=>[{track:{kind:'video'}}];
  await new Promise(r=>setTimeout(r,2100));check(/não suportado pelo navegador/.test(status()),'Panel reports unsupported smoothing');
  window.STATES.currentStream.peerConnection.getReceivers=()=>[receiver];
  BxImageFilter.settings.smoothing=0;await new Promise(r=>setTimeout(r,1100));adapterInput.currentTime+=.04;player.updateFrame();check(receiver.jitterBufferTarget===null,'Smoothing off restores the default buffer');
  // Frame pacing line from the frames the adapter rendered.
  for(let k=0;k<6;k++){adapterInput.currentTime+=.033;player.updateFrame();await new Promise(r=>setTimeout(r,34));}
  await new Promise(r=>setTimeout(r,1100));check(/Ritmo na tela: [0-9.]+ ms ± [0-9.]+ • p95 [0-9.]+ ms • \d+ travadas? em 2 s\nOrigem: servidor [^•]+ • chegada /.test(status()),'Panel shows frame pacing and its origin');
  // Fluidez: frames go to persistent textures and reach the canvas on the pacer's clock.
  BxImageFilter.settings.fluidity='balanced';
  for(let k=0;k<8;k++){adapterInput.getContext('2d').fillStyle=k%2?'#222':'#ddd';adapterInput.getContext('2d').fillRect(0,0,128,96);adapterInput.currentTime+=.033;player.updateFrame();await new Promise(r=>setTimeout(r,34));}
  await new Promise(r=>setTimeout(r,1100));
  const pacedTargets=Object.keys(player.bxEngine.targets).filter(n=>n.startsWith('paced'));
  check(pacedTargets.length>=2&&player.bxTiming.pacer&&player.bxTiming.display.length>=4,'Fluidez renders into persistent textures and presents on its clock '+pacedTargets.join(','));
  check(/Fluidez equilibrada: \+[0-9.]+ ms de espera/.test(status()),'Panel shows the pacer delay');
  // The canvas buffer is cleared after compositing; check the texture that was presented instead.
  {const g=player.gl,t=player.bxEngine.targets[player.bxTiming.shown],px=new Uint8Array(4);g.bindFramebuffer(g.FRAMEBUFFER,t.fbo);g.readPixels(10,10,1,1,g.RGBA,g.UNSIGNED_BYTE,px);g.bindFramebuffer(g.FRAMEBUFFER,null);
   check(t&&t.w===player.$canvas.width&&px[0]>10,'Presented frame holds the processed image at canvas size');}
  BxImageFilter.settings.fluidity='off';adapterInput.currentTime+=.033;player.updateFrame();
  check(!player.bxTiming.pacer&&!Object.keys(player.bxEngine.targets).some(n=>n.startsWith('paced')),'Turning Fluidez off releases its textures and loop');
  const copyButton=[...menu2.querySelectorAll('button')].find(b=>b.textContent==='Copiar configuração');copyButton.click();await new Promise(r=>setTimeout(r,200));
  const exported=JSON.parse(menu2.querySelector('textarea').value);
  check(exported.treatment&&'smoothing' in exported.treatment&&'stream.video.resolution' in exported.betterXcloud&&exported.build==='6.7.12-imagefilter.9.6.1','Copy configuration exports treatment and Better xCloud settings');
  check(!menu2.querySelector('select[aria-label="Codec (teste)"]')&&!menu2.querySelector('select[aria-label="Taxa da tela (app)"]'),'No codec test; refresh-rate control only inside the Android app');
  delete window.STATES;}
 // Exercise the browser's actual receiver setter, without media permissions or a remote service.
 {const pc=new RTCPeerConnection();const receiver=pc.addTransceiver('video').receiver;
  const result=BxRestoration.applySmoothing(pc,33);
  check(result.state==='requested'||result.state==='unsupported','Native WebRTC receiver reports buffering capability');
  if('jitterBufferTarget' in receiver){check(receiver.jitterBufferTarget===33,'Native receiver accepts the millisecond target');BxRestoration.applySmoothing(pc,0);check(receiver.jitterBufferTarget===null,'Native receiver restores the default target');}
  pc.close();}
 // Android app bridge: the refresh-rate selector appears once the bridge exists and calls the app.
 {let set=null;window.BxAndroid={getRefreshRates:()=>'[60,90,120]',getRefreshRate:()=>0,setRefreshRate:v=>{set=v;}};
  let sel=null;for(let t=0;t<10&&!(sel=menu2.querySelector('select[aria-label="Taxa da tela (app)"]'));t++)await new Promise(r=>setTimeout(r,300));
  check(sel&&[...sel.options].map(o=>o.value).join()==='0,60,90,120','Android app shows fixed refresh-rate options');
  sel.value='120';sel.dispatchEvent(new Event('change'));check(set===120,'Selecting a refresh rate calls the app bridge');delete window.BxAndroid;}
 // A GPU failure while Fluidez is on must also end its display loop, not only the engine.
 BxImageFilter.settings.fluidity='balanced';adapterInput.currentTime+=.033;player.updateFrame();
 player.bxEngine.render=()=>{throw new Error('simulated GPU failure');};adapterInput.currentTime+=.033;player.updateFrame();
 check(!player.bxEngine&&!player.bxTiming.pacer&&BxImageFilter.status.mode==='error','Render failure stops the Fluidez loop and falls back to the original renderer');
 BxImageFilter.settings.fluidity='off';
 player.destroy();
 const nextPlayer=new WebGL2Player(adapterInput);await nextPlayer.setupShaders();nextPlayer.updateFrame();BxImageFilter.diagnostic=true;nextPlayer.updateFrame();
 const tint=new Uint8Array(128*96*4);nextPlayer.gl.readPixels(0,0,128,96,nextPlayer.gl.RGBA,nextPlayer.gl.UNSIGNED_BYTE,tint);
 check(nextPlayer.bxEngine.frames===2&&tint.some((v,i)=>i%4===0&&v>100),'Next player applies persisted settings and diagnostic without reload');
 nextPlayer.destroy();
 const stoppedPlayer=new WebGL2Player(adapterInput);const pending=stoppedPlayer.setupShaders();stoppedPlayer.destroy();await pending;check(!stoppedPlayer.bxEngine,'Destroy during asynchronous setup does not resurrect engine');


 // requestVideoFrameCallback metadata: presented-frame gaps are counted and a newly presented frame is drawn.
 {const rvfcInput=document.createElement('canvas');rvfcInput.width=128;rvfcInput.height=96;rvfcInput.currentTime=5;let onMeta=null;
  rvfcInput.requestVideoFrameCallback=cb=>{onMeta=cb;return 1;};rvfcInput.cancelVideoFrameCallback=()=>{};
  const rvfcPlayer=new WebGL2Player(rvfcInput);await rvfcPlayer.setupShaders();
  onMeta(0,{presentedFrames:10});rvfcPlayer.updateFrame();const drawn=rvfcPlayer.bxEngine.frames;
  onMeta(0,{presentedFrames:13});rvfcPlayer.updateFrame();
  check(rvfcPlayer.bxEngine.frames===drawn+1&&BxImageFilter.status.origin.presented===3&&BxImageFilter.status.origin.missed===2,'Presented frames that skipped the treatment are counted; the new one is drawn');
  rvfcPlayer.destroy();}
 // Reference sharpening keeps one source texel between taps when the output is larger than the video.
 {const overshoot=scale=>{const c=document.createElement('canvas');c.width=64*scale;c.height=32*scale;
   const g=c.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false}),e=new BxRestoration.Engine(g,BxShaders);
   const src=document.createElement('canvas');src.width=64;src.height=32;const x=src.getContext('2d');x.fillStyle='rgb(80,80,80)';x.fillRect(0,0,32,32);x.fillStyle='rgb(160,160,160)';x.fillRect(32,0,32,32);
   e.render(src,c.width,c.height,BxRestoration.normalize({mode:'cas',sharpening:'usm',sharpness:5,gpuBudget:0}),0);
   const row=new Uint8Array(c.width*4);g.readPixels(0,16*scale,c.width,1,g.RGBA,g.UNSIGNED_BYTE,row);e.destroy();
   let hi=0;for(let i=0;i<row.length;i+=4)hi=Math.max(hi,row[i]);return hi-160;};
  const native=overshoot(1),doubled=overshoot(2);
  check(native>10&&doubled>=native*.6,`Reference sharpening keeps its strength at 2x output (${native} vs ${doubled})`);}
 // Isolate AA at native resolution and with sharpening disabled.
 canvas.width=128;canvas.height=96;
 for(let y=0;y<96;y++)for(let x=0;x<128;x++){ctx.fillStyle=x>y*.5+30?'white':'black';ctx.fillRect(x,y,1,1);}
 const aaSettings=BxRestoration.normalize({cleanup:0,deband:0,temporal:0,sharpness:0,antialias:0});
 engine.render(input,128,96,aaSettings,1);const jagged=pixels();aaSettings.antialias=1;engine.render(input,128,96,aaSettings,1.016);const smooth=pixels();
 const intermediates=b=>b.filter((v,i)=>i%4===0&&v>0&&v<255).length;
 check(intermediates(smooth)>intermediates(jagged),'AA blends staircase edge coverage');
 check(smooth[(10*128+100)*4]===255&&smooth[(80*128+10)*4]===0,'AA preserves uniform black and white');
 ctx.fillStyle='black';ctx.fillRect(0,0,64,96);ctx.fillStyle='white';ctx.fillRect(64,0,64,96);engine.render(input,128,96,aaSettings,1.032);
 check(intermediates(pixels())===0,'AA preserves axis-aligned edge');
 // Auto output follows the on-screen size of the canvas CSS box, not the backing size.
 {const autoInput=document.createElement('canvas');autoInput.width=192;autoInput.height=108;autoInput.currentTime=0;
  const autoPlayer=new WebGL2Player(autoInput);await autoPlayer.setupShaders();BxImageFilter.settings.output='auto';BxImageFilter.settings.gpuBudget=0;
  autoPlayer.$canvas.style.cssText='width:'+Math.round(400/devicePixelRatio)+'px;height:'+Math.round(400/devicePixelRatio)+'px;object-fit:contain';autoPlayer.updateFrame();
  check(autoPlayer.$canvas.height===224&&autoPlayer.$canvas.width===398,'Auto output renders at the displayed video height (contain box)');
  autoPlayer.$canvas.style.cssText='width:'+Math.round(96/devicePixelRatio)+'px;height:'+Math.round(54/devicePixelRatio)+'px';autoInput.currentTime+=.016;autoPlayer.updateFrame();
  check(autoPlayer.$canvas.height===108,'Auto output stays native when the video is shown smaller than the source');autoPlayer.destroy();}
 const forcedPlayer=new WebGL2Player(adapterInput);adapterInput.width=192;adapterInput.height=108;await forcedPlayer.setupShaders();
 BxImageFilter.settings.output='2160';BxImageFilter.settings.gpuBudget=0;forcedPlayer.updateFrame();
 check(forcedPlayer.$canvas.width===3840&&forcedPlayer.$canvas.height===2160,'4K output ignores smaller display dimensions');
 check(forcedPlayer.bxEngine.budget.limitMs===0,'Manual GPU policy is applied');
 BxImageFilter.settings.output='1440';forcedPlayer.updateFrame();check(forcedPlayer.$canvas.width===2560&&forcedPlayer.$canvas.height===1440,'2K output renders at 1440p');
 BxImageFilter.settings.output='native';forcedPlayer.updateFrame();check(forcedPlayer.$canvas.width===192&&forcedPlayer.$canvas.height===108,'Native output matches decoded source');
 check(forcedPlayer.gl.getError()===forcedPlayer.gl.NO_ERROR,'Forced output targets render without GL errors');
 check(!forcedPlayer.bxEngine.targets.scaled,'Returning to native output releases the upscale texture');
 // Exercise automatic resolution adaptation through the actual adapter, even on a paused frame.
 BxImageFilter.settings.gpuBudget=3;BxImageFilter.settings.output='2160';BxImageFilter.settings.temporal=0;forcedPlayer.updateFrame();
 for(let i=0;i<90;i++)forcedPlayer.bxEngine.budget.sample(20);
 forcedPlayer.updateFrame();check(forcedPlayer.$canvas.height===1440,'Overload redraws a paused frame at 1440p');
 for(let i=0;i<90;i++)forcedPlayer.bxEngine.budget.sample(20);
 forcedPlayer.updateFrame();check(forcedPlayer.$canvas.height===108,'Persistent overload returns to native source size');
 check(BxImageFilter.settings.output==='2160','Adaptation preserves the selected output preference');
 forcedPlayer.destroy();
 engine.diagnostics.start();engine.render(input,128,96,{gpuBudget:0,mode:'original'},3,false);engine.render(input,128,96,{gpuBudget:0,mode:'original'},3.016,true);
 const segments=engine.diagnostics.report().segments;
 check(segments.length===2&&segments[1].config.diagnostic,'Diagnostic tint starts a separate measurement segment');
 check(segments[0].config.effective.cleanup===0&&segments[0].config.effective.deband===0&&!segments[0].config.effective.temporal&&segments[0].config.effective.antialias===0,'Original report marks skipped treatments inactive');
 const textures=Object.values(engine.targets).map(t=>t.texture);engine.destroy();check(textures.every(t=>!gl.isTexture(t)),'GPU resources released');
 document.getElementById('result').textContent=JSON.stringify({passed:checks});
})().catch(e=>{document.getElementById('result').textContent=JSON.stringify({error:e.message});console.error(e);});
'''
original=Path('script.js').read_text();a=original.index('class WebGL2Player');b=original.index('class VideoPlayer',a)
base="\nconst prefs={'video.processing.sharpness':2,'video.processing':'cas','video.processing.mode':'performance'};function getStreamPref(key){return prefs[key]??'default';}\nclass BaseCanvasPlayer {\n constructor(type,video){this.$video=video;this.$canvas=document.createElement('canvas');this.$canvas.width=128;this.$canvas.height=96;document.body.append(this.$canvas);this.options={processing:'cas',processingMode:'performance',sharpness:2,brightness:100,contrast:100,saturation:100};}\n toFilterId(){return 2;}destroy(){}\n}\n"
Path('output/playwright').mkdir(parents=True,exist_ok=True)
Path('output/playwright/filter-harness.html').write_text('<!doctype html><meta charset="utf-8"><pre id="result">Running</pre><script src="../restoration.bundle.js"></script><script>'+base+original[a:b]+Path('src/image-filter.js').read_text()+probe+'</script>')
