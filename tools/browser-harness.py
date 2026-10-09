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
 s.cleanup=0;s.deband=0;engine.render(input,128,96,s,.048);const neutral=pixels();
 check(Array.from({length:30},(_,x)=>neutral[(40*128+x+50)*4]).every(v=>v>=46&&v<=66),'Halo limiter keeps step inside neighborhood bounds');
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
 player.bxEngine.budget.temporalAllowed=false;BxImageFilter.reset();check(player.bxEngine.budget.temporalAllowed,'Panel reset clears adaptation');
 
 const prevCount=player.bxEngine.frames;
 BxImageFilter.settings.mode='filtered';player.updateFrame();
 const readPlayer=()=>{const b=new Uint8Array(player.$canvas.width*player.$canvas.height*4);player.gl.readPixels(0,0,player.$canvas.width,player.$canvas.height,player.gl.RGBA,player.gl.UNSIGNED_BYTE,b);return b;};
 adapterInput.getContext('2d').fillStyle='#555';adapterInput.getContext('2d').fillRect(0,0,64,96);adapterInput.getContext('2d').fillStyle='#999';adapterInput.getContext('2d').fillRect(64,0,64,96);
 prefs['video.processing.sharpness']=0;player.updateFrame();const noSharp=readPlayer();const beforeSharpCount=player.bxEngine.frames;
 prefs['video.processing.sharpness']=5;player.updateFrame();const withSharp=readPlayer();
 check(withSharp.some((v,i)=>v!==noSharp[i]),'Native sharpness changes actual filtered pixels');check(player.bxEngine.frames===beforeSharpCount+1,'Native sharpness redraws unchanged video frame');
 prefs['video.processing.mode']='quality';player.updateFrame();check(player.gl.getError()===player.gl.NO_ERROR,'Native quality mode remains valid');
 const qualityPixels=readPlayer();check(Math.abs(qualityPixels[(40*128+20)*4]-85)<=1,'Quality halo limiter preserves uniform region luminance');
 const menu=document.createElement('section');document.body.append(menu);BxImageFilter.mountControls(menu);
 check(menu.querySelector('[data-bx-restoration="v7"]')&&!document.getElementById('bx-image-filter-panel'),'Controls mount inside supplied Better xCloud menu');
 check(menu.querySelectorAll('input[type=range]').length===4,'Compression, gradient, temporal and AA sliders added');
 const slider=menu.querySelector('input[type=range]');slider.value='71';slider.dispatchEvent(new Event('input'));check(BxImageFilter.settings.cleanup===.71,'Native menu controls persist settings');
 const menu2=document.createElement('section');document.body.append(menu2);BxImageFilter.mountControls(menu2);check(menu2.querySelector('input').value==='71'&&!menu.querySelector('[data-bx-restoration]'),'Rebuilt menu retains controls and settings');
 player.destroy();
 const nextPlayer=new WebGL2Player(adapterInput);await nextPlayer.setupShaders();nextPlayer.updateFrame();BxImageFilter.diagnostic=true;nextPlayer.updateFrame();
 const tint=new Uint8Array(128*96*4);nextPlayer.gl.readPixels(0,0,128,96,nextPlayer.gl.RGBA,nextPlayer.gl.UNSIGNED_BYTE,tint);
 check(nextPlayer.bxEngine.frames===2&&tint.some((v,i)=>i%4===0&&v>100),'Next player applies persisted settings and diagnostic without reload');
 nextPlayer.destroy();
 const stoppedPlayer=new WebGL2Player(adapterInput);const pending=stoppedPlayer.setupShaders();stoppedPlayer.destroy();await pending;check(!stoppedPlayer.bxEngine,'Destroy during asynchronous setup does not resurrect engine');


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
 const forcedPlayer=new WebGL2Player(adapterInput);adapterInput.width=192;adapterInput.height=108;await forcedPlayer.setupShaders();
 BxImageFilter.settings.output='2160';BxImageFilter.settings.gpuBudget=0;forcedPlayer.updateFrame();
 check(forcedPlayer.$canvas.width===3840&&forcedPlayer.$canvas.height===2160,'4K output ignores smaller display dimensions');
 check(forcedPlayer.bxEngine.budget.limitMs===0,'Manual GPU policy is applied');
 BxImageFilter.settings.output='1440';forcedPlayer.updateFrame();check(forcedPlayer.$canvas.width===2560&&forcedPlayer.$canvas.height===1440,'2K output renders at 1440p');
 BxImageFilter.settings.output='native';forcedPlayer.updateFrame();check(forcedPlayer.$canvas.width===192&&forcedPlayer.$canvas.height===108,'Native output matches decoded source');
 check(forcedPlayer.gl.getError()===forcedPlayer.gl.NO_ERROR,'Forced output targets render without GL errors');forcedPlayer.destroy();
 const textures=Object.values(engine.targets).map(t=>t.texture);engine.destroy();check(textures.every(t=>!gl.isTexture(t)),'GPU resources released');
 document.getElementById('result').textContent=JSON.stringify({passed:checks});
})().catch(e=>{document.getElementById('result').textContent=JSON.stringify({error:e.message});console.error(e);});
'''
original=Path('script.js').read_text();a=original.index('class WebGL2Player');b=original.index('class VideoPlayer',a)
base="\nconst prefs={'video.processing.sharpness':2,'video.processing':'cas','video.processing.mode':'performance'};function getStreamPref(key){return prefs[key]??'default';}\nclass BaseCanvasPlayer {\n constructor(type,video){this.$video=video;this.$canvas=document.createElement('canvas');this.$canvas.width=128;this.$canvas.height=96;document.body.append(this.$canvas);this.options={processing:'cas',processingMode:'performance',sharpness:2,brightness:100,contrast:100,saturation:100};}\n toFilterId(){return 2;}destroy(){}\n}\n"
Path('output/playwright').mkdir(parents=True,exist_ok=True)
Path('output/playwright/filter-harness.html').write_text('<!doctype html><meta charset="utf-8"><pre id="result">Running</pre><script src="../restoration.bundle.js"></script><script>'+base+original[a:b]+Path('src/image-filter.js').read_text()+probe+'</script>')
