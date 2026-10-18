const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');

function playerClock(){
 const source=fs.readFileSync('better-xcloud-image-filter.user.js','utf8');
 const start=source.indexOf('class BaseCanvasPlayer'),end=source.indexOf('class ',start+10);
 let now=0;
 const context={BaseStreamPlayer:class {},performance:{now:()=>now}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+';globalThis.Player=BaseCanvasPlayer;',context);
 // The integration patch must also be present in the shipped userscript.
 const patch=source.match(/\/\* BEGIN FRAME PACING \*\/([\s\S]*?)\/\* END FRAME PACING \*\//);
 if(patch)vm.runInContext(patch[1],context);
 const player=Object.create(context.Player.prototype);
 return {player,at(time){now=time;return player.shouldDraw();}};
}
test('30 FPS cap retains frames arriving alternately at 32 and 34.67 ms',()=>{
 const {player,at}=playerClock();player.setTargetFps(30);
 let time=1000,drawn=0;at(time);
 for(let i=0;i<60;i++){time+=i%2?1000/15-32:32;if(at(time))drawn++;}
 assert.equal(drawn,60);
});
test('30 FPS cap limits a 60 FPS source without long-term drift',()=>{
 const {player,at}=playerClock();player.setTargetFps(30);
 let drawn=0;for(let i=0;i<600;i++)if(at(1000+i*1000/60))drawn++;
 assert.equal(drawn,300);
});
test('FPS cap resets after a pause and target changes without catch-up bursts',()=>{
 const {player,at}=playerClock();player.setTargetFps(30);
 assert.equal(at(1000),true);assert.equal(at(5000),true);assert.equal(at(5001),false);
 player.setTargetFps(20);assert.equal(at(5002),true);assert.equal(at(5010),false);assert.equal(at(5052),true);
 player.setTargetFps(0);assert.equal(at(6000),false);
 player.setTargetFps(60);assert.equal(at(6001),true);assert.equal(at(6002),true);
});

function adapter(){
 const timers=new Map(),events=new Map();let id=0;
 class WebGL2Player {updateFrame(){}destroy(){}async setupShaders(){}}
 const context={WebGL2Player,window:{setInterval(fn){timers.set(++id,fn);return id;},clearInterval(id){timers.delete(id);},setTimeout(){return 0;},clearTimeout(){},addEventListener(name,fn){events.set(name,fn);}},
  document:{},localStorage:{getItem:()=>null,setItem(){}},console,STATES:{currentStream:{}}};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync('src/restoration-engine.js','utf8'),context);
 vm.runInContext(fs.readFileSync('src/image-filter.js','utf8'),context);
 return {context,timers,events,tick(){for(const fn of timers.values())fn();},api:context.window.BxImageFilter};
}
test('smoothing follows live receivers without a WebGL player or an open panel',()=>{
 const a=adapter(),video={track:{kind:'video'},jitterBufferTarget:null};
 a.api.settings.smoothing=33;a.context.STATES.currentStream.peerConnection={getReceivers:()=>[video]};a.tick();
 assert.equal(video.jitterBufferTarget,33);
 a.api.reset();assert.equal(video.jitterBufferTarget,null);
});
test('smoothing releases the old peer and survives page cache suspension',()=>{
 const a=adapter(),first={track:{kind:'video'},jitterBufferTarget:null},second={track:{kind:'video'},jitterBufferTarget:null};
 a.api.settings.smoothing=17;a.context.STATES.currentStream.peerConnection={getReceivers:()=>[first]};a.tick();
 a.context.STATES.currentStream.peerConnection={getReceivers:()=>[second]};a.tick();
 assert.equal(first.jitterBufferTarget,null);assert.equal(second.jitterBufferTarget,17);
 a.events.get('pagehide')?.();assert.equal(a.timers.size,0);assert.equal(second.jitterBufferTarget,null);
 a.events.get('pageshow')?.();assert.equal(a.timers.size,1);assert.equal(second.jitterBufferTarget,17);
});
test('smoothing reports missing support and receiver errors without abandoning other receivers',()=>{
 const a=adapter();a.api.settings.smoothing=33;
 a.context.STATES.currentStream.peerConnection={getReceivers:()=>[{track:{kind:'video'}}]};a.tick();
 assert.equal(a.api.status.smoothing.state,'unsupported');
 const broken={track:{kind:'video'},get jitterBufferTarget(){return null;},set jitterBufferTarget(v){throw Error('unavailable');}};
 const working={track:{kind:'video'},jitterBufferTarget:null};
 a.context.STATES.currentStream.peerConnection={getReceivers:()=>[broken,working]};a.tick();
 assert.equal(working.jitterBufferTarget,33);assert.equal(a.api.status.smoothing.failed,1);
});
test('compression-adaptive treatment follows a sustained QP change with hysteresis',async()=>{
 const a=adapter();let qpSum=0,frames=0,bytes=0,t=0,qp=28;
 const rtp=()=>({id:'v',type:'inbound-rtp',kind:'video',timestamp:t,qpSum,framesDecoded:frames,bytesReceived:bytes,packetsLost:0,packetsReceived:frames*10});
 a.context.STATES.currentStream.peerConnection={getReceivers:()=>[],getStats:async()=>{t+=1000;frames+=30;qpSum+=qp*30;bytes+=2e6;const r=rtp();return new Map([['v',r]]);}};
 const step=async n=>{for(let i=0;i<n;i++){a.tick();await new Promise(r=>setImmediate(r));}};
 await step(3);assert.equal(a.api.status.adaptive.level,.5);assert.equal(a.api.status.net.bitrateMbps,16);
 qp=29;await step(5);assert.equal(a.api.status.adaptive.level,.5,'small QP changes do not move the treatment');
 qp=38;await step(8);assert.equal(a.api.status.adaptive.level,1);assert.ok(a.api.status.adaptive.scales.cleanup>1.3);
 a.api.update({adaptive:false,hud:'off'});const calls=t;await step(2);assert.equal(t,calls,'no getStats while nothing needs telemetry');
});
test('without a QP the treatment follows the bits per pixel of the last minute, not quiet seconds',async()=>{
 const a=adapter();let t=0,frames=0,bytes=0,perSecond=1866240,fps=30; // 0.24 bit/pixel at 1080p30
 a.context.STATES.currentStream.peerConnection={getReceivers:()=>[],getStats:async()=>{t+=1000;frames+=fps;bytes+=perSecond;
  return new Map([['v',{id:'v',type:'inbound-rtp',kind:'video',timestamp:t,framesDecoded:frames,bytesReceived:bytes,frameWidth:1920,frameHeight:1080}]]);}};
 const step=async n=>{for(let i=0;i<n;i++){a.tick();await new Promise(r=>setImmediate(r));}};
 await step(5);assert.equal(a.api.status.adaptive,null,'five seconds before the first estimate');assert.equal(a.api.status.net.qp,null);
 await step(1);const first=a.api.status.adaptive;assert.equal(first.source,'bitrate');assert.equal(first.qp,null);assert.equal(first.qpMean,null);
 assert.ok(Math.abs(first.qpEstimate-24)<1e-9);assert.equal(first.level,.2);assert.ok(first.scales.cleanup<1);
 perSecond=1866240/8;await step(6);assert.equal(a.api.status.adaptive.level,.2,'quiet seconds below the 80th percentile keep the level');
 fps=5;perSecond=1e8;await step(3);assert.equal(a.api.status.adaptive.level,.2,'stalled seconds are skipped');
 fps=30;perSecond=1866240/8;await step(20);assert.equal(a.api.status.adaptive.level,1,'a sustained low bitrate reads as heavy compression');
});
test('a new session restarts telemetry and the compression level',async()=>{
 const a=adapter(),session=qp=>{let t=0,frames=0,sum=0;return {getReceivers:()=>[],getStats:async()=>{t+=1000;frames+=30;sum+=qp*30;return new Map([['v',{id:'v',type:'inbound-rtp',kind:'video',timestamp:t,qpSum:sum,framesDecoded:frames}]]);}};};
 const step=async n=>{for(let i=0;i<n;i++){a.tick();await new Promise(r=>setImmediate(r));}};
 a.context.STATES.currentStream.peerConnection=session(40);await step(4);assert.equal(a.api.status.adaptive.level,1);
 a.context.STATES.currentStream.peerConnection=session(22);await step(2);assert.ok(a.api.status.adaptive.level<=.1,'level '+a.api.status.adaptive.level);
});
