/* Shared GPU video processing engine. GLSL assets are embedded by tools/build.py. */
(() => {
  // v9 defaults come from tools/eval (docs/analysis-v9.md): same sharpness as the clean
  // render with the highest fidelity on xCloud-like H.264 streams.
  const defaults = Object.freeze({mode:'filtered',neural:0,cleanup:.5,deband:.3,chroma:.75,detail:.2,temporal:0,upscale:true,output:'auto',antialias:0,gpuBudget:6,sharpness:3,processing:'cas',sharpening:'usm',spatialMode:'selective',lumaSharpen:true,noiseFloor:4,processingMode:'performance',contrast:1,saturation:1,shadows:0});
  function normalize(value={}) {
    if(!value || typeof value!=='object')value={};
    const result={...defaults};
    if(['auto','native','1440','2160'].includes(value.output)||/^\d{3,4}$/.test(value.output)&&value.output>=360&&value.output<=2160)result.output=String(value.output);
    if([0,3,6,10].includes(value.gpuBudget))result.gpuBudget=value.gpuBudget;
    if(['original','cas','filtered'].includes(value.mode))result.mode=value.mode;
    if(['usm','cas','rcas','native'].includes(value.sharpening))result.sharpening=value.sharpening;
    if(['selective','legacy'].includes(value.spatialMode))result.spatialMode=value.spatialMode;
    if(['cas','usm'].includes(value.processing))result.processing=value.processing;
    if(['performance','quality'].includes(value.processingMode))result.processingMode=value.processingMode;
    if(typeof value.upscale==='boolean')result.upscale=value.upscale;
    if(typeof value.lumaSharpen==='boolean')result.lumaSharpen=value.lumaSharpen;
    for(const [key,min,max] of [['neural',0,1],['antialias',0,1],['sharpness',0,10],['cleanup',0,1],['deband',0,1],['chroma',0,1],['detail',0,1],['temporal',0,1],['contrast',.8,1.2],['noiseFloor',0,8],['saturation',0,1.3],['shadows',0,1]])
      if(typeof value[key]==='number'&&Number.isFinite(value[key]))result[key]=Math.min(max,Math.max(min,value[key]));
    return result;
  }
  function historyValid(previous,time,w,h){return !!previous && previous.w===w && previous.h===h && time>previous.time && time-previous.time<.25;}
  // Auto renders at the height the video occupies on screen in physical pixels, so
  // FSR and sharpening happen at final size instead of the compositor's bilinear
  // stretch (e.g. 1080p stream on a 1220-1280 px phone panel). Never above 2160p or
  // the display (an HDMI 1080p signal stays native); steps of 8 px avoid churn.
  function resolveOutput(output,displayHeight,sourceHeight){
    if(output!=='auto')return output;
    const height=Math.min(2160,Math.floor(displayHeight/8)*8);
    return height>sourceHeight*1.04?String(height):'native';
  }
  function outputSize(w,h,output){const height=/^\d+$/.test(output)?Number(output):h;return {width:Math.round(w*height/h),height};}
  function createBudget(){return {limitMs:3,values:[],p95:null,cadenceOver:0,over:0,temporalAllowed:true,neuralAllowed:true,debandScale:1,debandTaps:4,antialiasAllowed:true,cleanupAllowed:true,enhanceAllowed:true,outputCap:Infinity,settings:defaults,sourceHeight:1080,revision:0,reason:'',
  configure(settings,height){this.settings=normalize(settings);this.sourceHeight=height;},
  outputFor(settings){
    if(settings.mode!=='filtered'||settings.gpuBudget===0||settings.output==='native'||this.outputCap===Infinity)return settings.output;
    const height=Math.min(Number(settings.output),this.outputCap);
    return height<=this.sourceHeight?'native':String(height);
  },degrade(){
    const s=this.settings;
    if(this.limitMs===0)return;
    if(s.temporal>0&&this.temporalAllowed){this.temporalAllowed=false;this.reason='Temporal desligado para preservar fluidez';}
    else if(s.output!=='native'&&Math.min(Number(s.output),this.outputCap)>this.sourceHeight){
      this.outputCap=Math.min(Number(s.output),this.outputCap)>1440&&this.sourceHeight<1440?1440:this.sourceHeight;
      this.reason='Saída reduzida para '+(this.outputCap===this.sourceHeight?'nativa':this.outputCap+'p')+' para preservar fluidez';
    }
    else if(s.antialias>0&&this.antialiasAllowed){this.antialiasAllowed=false;this.reason='Antialiasing desligado para preservar fluidez';}
    else if(s.neural>0&&this.neuralAllowed){this.neuralAllowed=false;this.reason='Reconstrução neural desligada para preservar fluidez';}
    else if(s.deband>0&&this.debandScale>0){this.debandScale=Math.max(0,this.debandScale-.5);this.debandTaps=this.debandScale>0?2:0;this.reason='Degradês reduzidos para preservar fluidez';}
    else if(s.cleanup>0&&this.cleanupAllowed){this.cleanupAllowed=false;this.reason='Limpeza desligada para preservar fluidez';}
    else if((s.detail>0||s.chroma>0)&&this.enhanceAllowed){this.enhanceAllowed=false;this.reason='Detalhe e cor desligados para preservar fluidez';}
    else return;
    // Do not let timings from a more expensive pipeline trigger the next reduction.
    this.values=[];this.over=0;this.cadenceOver=0;this.revision++;
  },cadence(reference,current){
    if(this.limitMs===0)return;
    if(!Number.isFinite(reference)||reference<=0||!Number.isFinite(current))return;
    this.cadenceOver=current<reference*.95?this.cadenceOver+1:0;
    if(this.cadenceOver>=3){this.degrade();this.cadenceOver=0;}
  },sample(ms,mode='filtered'){
    if(mode!=='filtered')return;
    if(!Number.isFinite(ms)||ms<0)return;
    this.values.push(ms);if(this.values.length>60)this.values.shift();
    const sorted=[...this.values].sort((a,b)=>a-b);this.p95=sorted[Math.ceil(sorted.length*.95)-1];
    if(this.values.length<60)return;
    this.over=this.limitMs>0&&this.p95>this.limitMs?this.over+1:0;
    if(this.over>=30){this.degrade();this.over=0;}
  }};}
  function createDiagnostics(){
    let recording=false,segments=[],current=null,count=0,disjoints=0,started=null,ended=null,stopReason=null,metadata={};
    const percentile=(a,p)=>a.length?a[Math.ceil(a.length*p)-1]:null;
    return {
      get active(){return recording;},
      start(meta={}){recording=true;segments=[];current=null;count=0;disjoints=0;started=Date.now();ended=null;stopReason=null;metadata=meta;},
      stop(reason=null){if(!recording)return;recording=false;ended=Date.now();stopReason=reason;},
      frame(config,time){if(!recording)return null;const key=JSON.stringify(config);
        if(current?.key!==key){if(segments.length>=256){this.stop();return null;}current={key,config,frames:0,first:time,last:time,gpu:[]};segments.push(current);}
        current.frames++;current.last=time;return current;
      },
      sample(segment,ms){if(!segment||!segments.includes(segment)||!Number.isFinite(ms)||ms<0)return;
        if(count>=120000)return;segment.gpu.push(ms);count++;
      },
      disjoint(){if(recording)disjoints++;},
      report(){return {schema:1,version:'9.2',build:globalThis.BxBuild??null,started,ended,stopReason,recording,metadata,disjoints,sampleLimit:120000,truncated:count>=120000||segments.length>=256,
        segments:segments.map(({config,frames,first,last,gpu})=>{const sorted=[...gpu].sort((a,b)=>a-b);return {config,frames,durationMs:last-first,drawFps:last>first?(frames-1)*1000/(last-first):null,gpu:{count:gpu.length,p50:percentile(sorted,.5),p95:percentile(sorted,.95),p99:percentile(sorted,.99),samplesMs:[...gpu]}};})};}
    };
  }
  async function captureVideoStats(video,peer){
    const quality=video?.getVideoPlaybackQuality?.();
    const result={time:Date.now(),video:video?{width:video.videoWidth,height:video.videoHeight,currentTime:video.currentTime,totalVideoFrames:quality?.totalVideoFrames??null,droppedVideoFrames:quality?.droppedVideoFrames??null}:null,rtc:[]};
    if(peer?.getStats)try{const stats=await peer.getStats();stats.forEach(item=>{
      if(item.type!=='inbound-rtp'||item.kind!=='video')return;
      const row={};for(const key of ['id','timestamp','ssrc','decoderImplementation','powerEfficientDecoder','framesDecoded','framesDropped','framesReceived','totalDecodeTime','jitterBufferDelay','jitterBufferEmittedCount','freezeCount','totalFreezesDuration','bytesReceived','packetsReceived','packetsLost','jitter'])row[key]=item[key]??null;
      const codec=stats.get(item.codecId);row.codec=codec?{mimeType:codec.mimeType,sdpFmtpLine:codec.sdpFmtpLine}:null;result.rtc.push(row);
    });}catch{result.rtcUnavailable=true;}return result;
  }
  // Decoder summary from two inbound-rtp video snapshots: DT as in Better xCloud's stats bar
  // (decode time per frame) plus hardware/software when the browser exposes it. Chrome may hide
  // decoderImplementation/powerEfficientDecoder for privacy; then the kind is 'unknown'.
  function decoderSummary(previous,current){
    if(!current)return null;
    const frames=previous?current.framesDecoded-previous.framesDecoded:0;
    const dt=frames>0?(current.totalDecodeTime-previous.totalDecodeTime)/frames*1000:null;
    const kind=current.powerEfficientDecoder===true?'hardware':current.powerEfficientDecoder===false?'software':'unknown';
    return {kind,implementation:current.decoderImplementation||null,dtMs:Number.isFinite(dt)?dt:null};
  }
  function downloadReport(report){const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='bx-v9.2-diagnostics-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const vertex='#version 300 es\nlayout(location=0) in vec2 position;void main(){gl_Position=vec4(position,0,1);}';
  class Engine {
    constructor(gl,shaders){
      this.gl=gl;this.programs={};this.targets={};this.queries=[];this.budget=createBudget();this.previous=null;this.frames=0;this.diagnostics=createDiagnostics();this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      this.floatTargets=!!gl.getExtension('EXT_color_buffer_float');
      try {
        this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
        for(const [name,code]of Object.entries(shaders))this.programs[name]=this.compile(code);
        this.input=gl.createTexture();this.configure(this.input);
      }catch(e){this.destroy();throw e;}finally{gl.bindVertexArray(null);}
    }
    compile(fragment){const gl=this.gl,p=gl.createProgram(),objects=[];try{
      for(const [kind,code]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(kind);objects.push(s);gl.shaderSource(s,code);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}
      gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
      return {program:p,locations:{}};
    }catch(e){gl.deleteProgram(p);throw e;}finally{for(const s of objects)gl.deleteShader(s);}}
    configure(texture){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,texture);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);}
    target(name,w,h,precise=false){const gl=this.gl,fp=precise&&this.floatTargets;this.usedTargets?.add(name);let t=this.targets[name];if(t&&t.w===w&&t.h===h&&t.fp===fp)return t;
      if(t){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}
      t={w,h,fp,texture:gl.createTexture(),fbo:gl.createFramebuffer()};this.targets[name]=t;this.configure(t.texture);
      gl.texImage2D(gl.TEXTURE_2D,0,fp?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,fp?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Framebuffer incompleto');return t;
    }
    // Two RGBA16F color attachments written by one pass (neural features).
    targetPair(name,w,h){const gl=this.gl;this.usedTargets?.add(name);let t=this.targets[name];if(t&&t.w===w&&t.h===h)return t;
      if(t){gl.deleteTexture(t.texture);gl.deleteTexture(t.second);gl.deleteFramebuffer(t.fbo);}
      t={w,h,fp:true,texture:gl.createTexture(),second:gl.createTexture(),fbo:gl.createFramebuffer()};this.targets[name]=t;
      gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);
      for(const [i,texture] of [t.texture,t.second].entries()){this.configure(texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,texture,0);}
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Framebuffer incompleto');return t;
    }
    draw(name,target,w,h,textures={},uniforms={}){
      const gl=this.gl,p=this.programs[name];gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.fbo:null);gl.viewport(0,0,w,h);gl.useProgram(p.program);
      const location=k=>p.locations[k]??(p.locations[k]=gl.getUniformLocation(p.program,k));
      let slot=0;for(const [key,texture]of Object.entries(textures)){gl.activeTexture(gl.TEXTURE0+slot);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(location(key),slot++);}
      for(const [key,value]of Object.entries({outputSize:[w,h],...uniforms})){
        if(typeof value==='boolean')gl.uniform1i(location(key),value?1:0);
        else if(Array.isArray(value))gl.uniform2f(location(key),...value);
        else gl.uniform1f(location(key),value);
      }
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    poll(){const gl=this.gl;if(!this.ext)return;
      if(gl.getParameter(this.ext.GPU_DISJOINT_EXT)){for(const item of this.queries)gl.deleteQuery(item.q);this.queries=[];this.diagnostics.disjoint();return;}
      while(this.queries.length&&gl.getQueryParameter(this.queries[0].q,gl.QUERY_RESULT_AVAILABLE)){
        const item=this.queries.shift();if(item.revision===this.budget.revision){const ms=gl.getQueryParameter(item.q,gl.QUERY_RESULT)/1e6;this.budget.sample(ms,item.mode);this.diagnostics.sample(item.segment,ms);}gl.deleteQuery(item.q);}
    }
    outputSize(w,h,settings){
      if(this.budget.limitMs!==settings.gpuBudget){this.resetBudget();this.budget.limitMs=settings.gpuBudget;}
      this.budget.configure(settings,h);this.poll();
      return outputSize(w,h,this.budget.outputFor(settings));
    }
    render(video,outW,outH,rawSettings,time,diagnostic=false){
      const gl=this.gl,s=normalize(rawSettings),w=video.videoWidth||video.width,h=video.videoHeight||video.height;
      if(!w||!h||gl.isContextLost())return false;
      if(this.budget.limitMs!==s.gpuBudget){this.resetBudget();this.budget.limitMs=s.gpuBudget;}
      this.budget.configure(s,h);
      this.poll();let q=null;
      const revision=this.budget.revision;
      const filtered=s.mode==='filtered';
      const segment=this.diagnostics.active?this.diagnostics.frame({settings:s,diagnostic,source:[w,h],output:[outW,outH],revision,effective:{neural:filtered&&this.floatTargets&&this.budget.neuralAllowed?s.neural:0,temporal:filtered&&s.temporal>0&&this.budget.temporalAllowed,cleanup:filtered&&this.budget.cleanupAllowed?s.cleanup:0,chroma:filtered&&this.budget.enhanceAllowed?s.chroma:0,detail:filtered&&this.budget.enhanceAllowed?s.detail:0,deband:filtered?s.deband*this.budget.debandScale:0,debandTaps:filtered&&s.deband>0?this.budget.debandTaps:0,antialias:filtered&&this.budget.antialiasAllowed?s.antialias:0}},performance.now()):null;
      this.usedTargets=new Set();
      if(this.ext&&this.queries.length<4){q=gl.createQuery();gl.beginQuery(this.ext.TIME_ELAPSED_EXT,q);}
      try{
        gl.activeTexture(gl.TEXTURE0);this.configure(this.input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
        let source=this.input;
        if(s.mode==='filtered'){
          // Neural restoration first: trained on decoded stream luma (tools/nn), needs float targets.
          if(s.neural>0&&this.floatTargets&&this.budget.neuralAllowed){
            const features=this.targetPair('nnFeatures',w,h),restored=this.target('neural',w,h,s.processingMode==='quality');
            this.draw('nnFeatures',features,w,h,{source});
            this.draw('nnApply',restored,w,h,{source,featA:features.texture,featB:features.second},{strength:s.neural});source=restored.texture;
          }
          const cleanup=this.budget.cleanupAllowed?s.cleanup:0,deband=s.deband*this.budget.debandScale;
          const chroma=this.budget.enhanceAllowed?s.chroma:0,detail=this.budget.enhanceAllowed?s.detail:0;
          const temporalEnabled=s.temporal>0&&this.budget.temporalAllowed;
          // Without temporal, AA runs inside the spatial pass (no extra full-frame pass).
          const antialias=s.antialias>0&&this.budget.antialiasAllowed?s.antialias:0,fusedAntialias=temporalEnabled?0:antialias;
          if(cleanup>0||deband>0||chroma>0||detail>0||fusedAntialias>0){
            const spatial=this.target('spatial',w,h,s.processingMode==='quality');
            this.draw('spatial',spatial,w,h,{source},{cleanup,deband,chroma,detail,antialias:fusedAntialias,debandTaps:this.budget.debandTaps,quantize:!spatial.fp,selective:s.spatialMode==='selective'});source=spatial.texture;
          }
          if(temporalEnabled){
            const qw=Math.max(1,Math.ceil(w/4)),qh=Math.max(1,Math.ceil(h/4));
            const index=(this.historyIndex||0)^1;
            const low=this.target('low'+index,qw,qh),prevLow=this.target('low'+(index^1),qw,qh),history=this.target('history'+(index^1),w,h,true);
            this.draw('copy',low,qw,qh,{source:this.input});
            const valid=historyValid(this.previous,time,w,h);
            const cut=this.target('cut',1,1);this.draw('cut',cut,1,1,{source:low.texture,previous:prevLow.texture});
            const motion=this.target('motion',Math.max(1,Math.ceil(w/16)),Math.max(1,Math.ceil(h/16)));
            gl.bindTexture(gl.TEXTURE_2D,motion.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
            this.draw('motion',motion,motion.w,motion.h,{source:low.texture,previous:prevLow.texture,cut:cut.texture,fullSource:this.input,fullPrevious:history.texture},{validHistory:valid});
            const temporal=this.target('history'+index,w,h,true);
            this.draw('temporal',temporal,w,h,{source,history:history.texture,motion:motion.texture},{temporal:valid?s.temporal:0});source=temporal.texture;
            this.historyIndex=index; // Ping-pong retains both histories without two extra copies.
          }
          this.previous=temporalEnabled?{time,w,h}:null;
          if(temporalEnabled&&antialias>0){const aa=this.target('aa',w,h,s.processingMode==='quality');this.draw('antialias',aa,w,h,{source},{amount:antialias});source=aa.texture;}
          if(s.upscale&&outW>w&&outH>h){const scaled=this.target('scaled',outW,outH,s.processingMode==='quality');this.draw('easu',scaled,outW,outH,{source});source=scaled.texture;}
        }else this.previous=null;
        // One sharpening stage. 'native' follows the Better xCloud menu (CAS/USM). The
        // reference applies the same method and strength with the unmodified upstream shader.
        const method=s.sharpening==='native'?s.processing:s.sharpening;
        const casName=s.mode==='filtered'?(method==='rcas'?'rcas':'casFiltered'):'cas';const p=this.programs[casName];gl.useProgram(p.program);gl.uniform1i(gl.getUniformLocation(p.program,'filterId'),method==='usm'?1:2);
        this.draw(casName,null,outW,outH,{data:source},{iResolution:[outW,outH],qualityMode:s.mode==='filtered'&&s.processingMode==='quality',rcasStrength:s.sharpness/10,haloMargin:(2+s.sharpness)/255,noiseFloor:s.noiseFloor/255,lumaSharpen:s.lumaSharpen,sharpenFactor:s.mode==='original'?0:s.mode==='cas'?s.sharpness/1.2:s.sharpness/(s.processingMode==='quality'?1:1.2),brightness:1,contrast:s.mode==='filtered'?s.contrast:1,saturation:s.mode==='filtered'?s.saturation:1,shadows:s.mode==='filtered'?s.shadows:0,deband:s.mode==='filtered'?s.deband*this.budget.debandScale:0,diagnostic});
        this.frames++;return true;
      }finally{
        if(q){gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.queries.push({q,mode:s.mode,revision,segment});}
        for(const [name,t] of Object.entries(this.targets))if(!this.usedTargets.has(name)){
          gl.deleteTexture(t.texture);if(t.second)gl.deleteTexture(t.second);gl.deleteFramebuffer(t.fbo);delete this.targets[name];
        }
        this.usedTargets=null;
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);
      }
    }
    resetHistory(){this.previous=null;}
    resetBudget(){for(const item of this.queries)this.gl.deleteQuery(item.q);this.queries=[];this.budget=createBudget();this.resetHistory();}
    destroy(){const gl=this.gl;
      for(const t of Object.values(this.targets)){gl.deleteTexture(t.texture);if(t.second)gl.deleteTexture(t.second);gl.deleteFramebuffer(t.fbo);}
      for(const p of Object.values(this.programs))gl.deleteProgram(p.program);
      for(const item of this.queries)gl.deleteQuery(item.q);
      gl.deleteTexture(this.input);gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);this.targets={};this.programs={};this.queries=[];
    }
  }
  globalThis.BxRestoration={decoderSummary,createDiagnostics,captureVideoStats,downloadReport,Engine,defaults,normalize,historyValid,createBudget,outputSize,resolveOutput};
})();
