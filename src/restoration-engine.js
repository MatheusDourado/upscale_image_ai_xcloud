/* Shared GPU video processing engine. GLSL assets are embedded by tools/build.py. */
(() => {
  const defaults = Object.freeze({mode:'filtered',cleanup:.35,deband:.3,temporal:0,upscale:true,output:'native',antialias:0,gpuBudget:3,sharpness:2,processing:'cas',processingMode:'performance',contrast:1,saturation:1,shadows:0});
  function normalize(value={}) {
    if(!value || typeof value!=='object')value={};
    const result={...defaults};
    if(['native','1440','2160'].includes(value.output))result.output=value.output;
    if([0,3,6,10].includes(value.gpuBudget))result.gpuBudget=value.gpuBudget;
    if(['original','cas','filtered'].includes(value.mode))result.mode=value.mode;
    if(['cas','usm'].includes(value.processing))result.processing=value.processing;
    if(['performance','quality'].includes(value.processingMode))result.processingMode=value.processingMode;
    if(typeof value.upscale==='boolean')result.upscale=value.upscale;
    for(const [key,min,max] of [['antialias',0,1],['sharpness',0,10],['cleanup',0,1],['deband',0,1],['temporal',0,1],['contrast',.8,1.2],['saturation',0,1.3],['shadows',0,1]])
      if(typeof value[key]==='number'&&Number.isFinite(value[key]))result[key]=Math.min(max,Math.max(min,value[key]));
    return result;
  }
  function historyValid(previous,time,w,h){return !!previous && previous.w===w && previous.h===h && time>previous.time && time-previous.time<.25;}
  function outputSize(w,h,output){const height=output==='1440'?1440:output==='2160'?2160:h;return {width:Math.round(w*height/h),height};}
  function createBudget(){return {limitMs:3,values:[],p95:null,cadenceOver:0,over:0,temporalAllowed:true,debandScale:1,reason:'',degrade(){
    if(this.temporalAllowed){this.temporalAllowed=false;this.reason='Temporal desligado para preservar fluidez';}
    else if(this.debandScale>0){this.debandScale=Math.max(0,this.debandScale-.5);this.reason='Degradês reduzidos para preservar fluidez';}
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
  const vertex='#version 300 es\nlayout(location=0) in vec2 position;void main(){gl_Position=vec4(position,0,1);}';
  class Engine {
    constructor(gl,shaders){
      this.gl=gl;this.programs={};this.targets={};this.queries=[];this.budget=createBudget();this.previous=null;this.frames=0;this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
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
    target(name,w,h){const gl=this.gl;let t=this.targets[name];if(t&&t.w===w&&t.h===h)return t;
      if(t){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}
      t={w,h,texture:gl.createTexture(),fbo:gl.createFramebuffer()};this.targets[name]=t;this.configure(t.texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);
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
      if(gl.getParameter(this.ext.GPU_DISJOINT_EXT)){for(const item of this.queries)gl.deleteQuery(item.q);this.queries=[];return;}
      while(this.queries.length&&gl.getQueryParameter(this.queries[0].q,gl.QUERY_RESULT_AVAILABLE)){
        const item=this.queries.shift();this.budget.sample(gl.getQueryParameter(item.q,gl.QUERY_RESULT)/1e6,item.mode);gl.deleteQuery(item.q);}
    }
    render(video,outW,outH,rawSettings,time,diagnostic=false){
      const gl=this.gl,s=normalize(rawSettings),w=video.videoWidth||video.width,h=video.videoHeight||video.height;
      if(!w||!h||gl.isContextLost())return false;
      if(this.budget.limitMs!==s.gpuBudget){this.resetBudget();this.budget.limitMs=s.gpuBudget;}
      this.poll();let q=null;
      if(this.ext&&this.queries.length<4){q=gl.createQuery();gl.beginQuery(this.ext.TIME_ELAPSED_EXT,q);}
      try{
        gl.activeTexture(gl.TEXTURE0);this.configure(this.input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
        let source=this.input;
        if(s.mode==='filtered'){
          const spatial=this.target('spatial',w,h);
          this.draw('spatial',spatial,w,h,{source},{cleanup:s.cleanup,deband:s.deband*this.budget.debandScale});source=spatial.texture;
          const temporalEnabled=s.temporal>0&&this.budget.temporalAllowed;
          if(temporalEnabled){
            const qw=Math.max(1,Math.ceil(w/4)),qh=Math.max(1,Math.ceil(h/4));
            const index=(this.historyIndex||0)^1;
            const low=this.target('low'+index,qw,qh),prevLow=this.target('low'+(index^1),qw,qh),history=this.target('history'+(index^1),w,h);
            this.draw('copy',low,qw,qh,{source:this.input});
            const valid=historyValid(this.previous,time,w,h);
            const cut=this.target('cut',1,1);this.draw('cut',cut,1,1,{source:low.texture,previous:prevLow.texture});
            const motion=this.target('motion',Math.max(1,Math.ceil(w/16)),Math.max(1,Math.ceil(h/16)));
            gl.bindTexture(gl.TEXTURE_2D,motion.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
            this.draw('motion',motion,motion.w,motion.h,{source:low.texture,previous:prevLow.texture,cut:cut.texture},{validHistory:valid});
            const temporal=this.target('history'+index,w,h);
            this.draw('temporal',temporal,w,h,{source,history:history.texture,motion:motion.texture},{temporal:valid?s.temporal:0});source=temporal.texture;
            this.historyIndex=index; // Ping-pong retains both histories without two extra copies.
          }
          this.previous=temporalEnabled?{time,w,h}:null;
          if(s.antialias>0){const aa=this.target('aa',w,h);this.draw('antialias',aa,w,h,{source},{amount:s.antialias});source=aa.texture;}
          if(s.upscale&&outW>w&&outH>h){const scaled=this.target('scaled',outW,outH);this.draw('easu',scaled,outW,outH,{source});source=scaled.texture;}
        }else this.previous=null;
        // One sharpening stage; filtered mode follows native Better xCloud controls. CAS reference stays at 2.
        const cas=this.target('cas',outW,outH);
        const casName=s.mode==='filtered'?'casFiltered':'cas';const p=this.programs[casName];gl.useProgram(p.program);gl.uniform1i(gl.getUniformLocation(p.program,'filterId'),s.mode==='filtered'&&s.processing==='usm'?1:2);
        this.draw(casName,cas,outW,outH,{data:source},{iResolution:[outW,outH],qualityMode:s.mode==='filtered'&&s.processingMode==='quality',sharpenFactor:s.mode==='original'?0:s.mode==='cas'?2/1.2:s.sharpness/(s.processingMode==='quality'?1:1.2),brightness:1,contrast:1,saturation:1});
        this.draw('finish',null,outW,outH,{source:cas.texture},{contrast:s.mode==='filtered'?s.contrast:1,saturation:s.mode==='filtered'?s.saturation:1,shadows:s.mode==='filtered'?s.shadows:0,deband:s.mode==='filtered'?s.deband*this.budget.debandScale:0,diagnostic});
        this.frames++;return true;
      }finally{
        if(q){gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.queries.push({q,mode:s.mode});}
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);
      }
    }
    resetHistory(){this.previous=null;}
    resetBudget(){for(const item of this.queries)this.gl.deleteQuery(item.q);this.queries=[];this.budget=createBudget();this.resetHistory();}
    destroy(){const gl=this.gl;
      for(const t of Object.values(this.targets)){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}
      for(const p of Object.values(this.programs))gl.deleteProgram(p.program);
      for(const item of this.queries)gl.deleteQuery(item.q);
      gl.deleteTexture(this.input);gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);this.targets={};this.programs={};this.queries=[];
    }
  }
  globalThis.BxRestoration={Engine,defaults,normalize,historyValid,createBudget,outputSize};
})();
