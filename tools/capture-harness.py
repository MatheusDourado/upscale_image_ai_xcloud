from pathlib import Path
# Direct capture over a real WebRTC loopback: frames arriving in pairs 3 ms apart are partly skipped by the
# <video> element (one frame per display refresh) but all reach the treatment through the track processor.
probe=r'''
(async()=>{
 const checks=[];function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const src=document.createElement('canvas');src.width=320;src.height=180;const ctx=src.getContext('2d');
 const stream=src.captureStream(0),track=stream.getVideoTracks()[0];
 const a=new RTCPeerConnection(),b=new RTCPeerConnection();
 a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate);b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate);
 a.addTrack(track,stream);
 const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;document.body.append(video);
 const loaded=new Promise(r=>video.addEventListener('loadeddata',r,{once:true}));
 b.ontrack=e=>{video.srcObject=e.streams[0];video.play().catch(()=>{});};
 await a.setLocalDescription();await b.setRemoteDescription(a.localDescription);await b.setLocalDescription();await a.setRemoteDescription(b.localDescription);
 let produced=0;const produce=()=>{ctx.fillStyle=`rgb(${(produced*37)%256},${(produced*91)%256},90)`;ctx.fillRect(0,0,320,180);track.requestFrame();produced++;};
 let running=true;(async()=>{for(let i=0;running;i++){produce();await wait(i%2?63:3);}})();
 await loaded;
 window.STATES={currentStream:{peerConnection:b}};
 const player=new WebGL2Player(video);await player.setupShaders();
 // Upstream drawFrame: one updateFrame per presented video frame.
 const draw=()=>{if(player.isStopped)return;player.updateFrame();video.requestVideoFrameCallback(draw);};video.requestVideoFrameCallback(draw);
 const api=BxImageFilter;api.update({fluidity:'balanced',capture:'video'});
 await wait(800);
 const measure=async ms=>{const f0=player.bxEngine.frames,p0=produced;await wait(ms);return {rendered:player.bxEngine.frames-f0,produced:produced-p0};};
 const viaVideo=await measure(3000);
 check(api.status.origin.missed>0,`Video path skips bunched frames (${api.status.origin.missed} of ${api.status.origin.presented} in 2 s)`);
 check(api.directSupported(),'Track processor and VideoFrame are available');
 api.update({capture:'direct'});await wait(800);
 check(api.status.capture.active&&player.bxDirect,'Direct capture starts with Fluidez on');
 const direct=await measure(3000);
 check(direct.rendered>=direct.produced*.9,`Direct capture renders every decoded frame (${direct.rendered} of ${direct.produced})`);
 check(direct.rendered/direct.produced>viaVideo.rendered/viaVideo.produced+.15,`More frames than the video path (${direct.rendered}/${direct.produced} vs ${viaVideo.rendered}/${viaVideo.produced})`);
 check(api.status.fluidity&&api.status.pacing&&api.status.origin.missed===null,'Pacer runs on capture timestamps; video-element skips no longer apply');
 check(player.gl.getError()===player.gl.NO_ERROR,'VideoFrame upload renders without GL errors');
 const clone=player.bxDirect.track;api.update({capture:'video'});player.updateFrame();
 check(!player.bxDirect&&clone.readyState==='ended'&&!api.status.capture.active,'Switching back stops the cloned track');
 const viaVideoAgain=await measure(1000);check(viaVideoAgain.rendered>0,'Video path resumes');
 api.update({capture:'direct',fluidity:'off'});player.updateFrame();check(!player.bxDirect,'Direct capture needs Fluidez');
 // Fallback when the browser lacks the processor.
 const saved=window.MediaStreamTrackProcessor;delete window.MediaStreamTrackProcessor;
 api.update({fluidity:'balanced',capture:'direct'});await wait(500);
 check(!player.bxDirect&&/indisponível/i.test(api.status.capture.reason),'Unsupported browser falls back to the video path with a reason');
 const fallback=await measure(1000);check(fallback.rendered>0,'Video path keeps rendering after the fallback');
 window.MediaStreamTrackProcessor=saved;api.update({capture:'video'});api.update({capture:'direct'});await wait(800);
 check(player.bxDirect&&api.status.capture.frames>0,'Changing the setting retries direct capture');
 const last=player.bxDirect.track;player.destroy();
 check(last.readyState==='ended'&&!api.status.capture.active,'Destroying the player stops direct capture');
 running=false;a.close();b.close();api.update({capture:'video',fluidity:'off'});delete window.STATES;
 document.getElementById('result').textContent=JSON.stringify({passed:checks});
})().catch(e=>{document.getElementById('result').textContent=JSON.stringify({error:e.message});console.error(e);});
'''
original=Path('script.js').read_text();a=original.index('class WebGL2Player');b=original.index('class VideoPlayer',a)
base="\nconst prefs={'video.processing.sharpness':2,'video.processing':'cas','video.processing.mode':'performance','video.player.type':'webgl2'};function getStreamPref(key){return prefs[key]??'default';}\nclass BaseCanvasPlayer {\n constructor(type,video){this.$video=video;this.$canvas=document.createElement('canvas');this.$canvas.width=128;this.$canvas.height=96;this.$canvas.style.cssText='width:320px;height:180px';document.body.append(this.$canvas);this.options={processing:'cas',processingMode:'performance',sharpness:2,brightness:100,contrast:100,saturation:100};}\n toFilterId(){return 2;}destroy(){this.isStopped=true;}\n}\n"
Path('output/playwright').mkdir(parents=True,exist_ok=True)
Path('output/playwright/capture-harness.html').write_text('<!doctype html><meta charset="utf-8"><pre id="result">Running</pre><script src="../restoration.bundle.js"></script><script>'+base+original[a:b]+''.join(Path('src/'+n).read_text() for n in ('image-filter.js','panel.js','hud.js'))+probe+'</script>')
