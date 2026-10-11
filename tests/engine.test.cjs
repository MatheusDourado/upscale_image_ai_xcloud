const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const vm=require('node:vm');
function api(){const context={globalThis:{}}; if(fs.existsSync('src/restoration-engine.js'))vm.runInNewContext(fs.readFileSync('src/restoration-engine.js','utf8'),context);return context.globalThis.BxRestoration;}
test('validated settings preserve natural colors and separate modes',()=>{const a=api();assert.ok(a,'engine exported');const s=a.normalize({cleanup:5,temporal:-1,contrast:NaN,mode:'bad'});assert.equal(s.cleanup,1);assert.equal(s.temporal,0);assert.equal(s.contrast,1);assert.equal(s.mode,'filtered');assert.equal(s.shadows,0);});
test('temporal history resets on interruption, resize and backwards time',()=>{const a=api();assert.ok(a);assert.equal(a.historyValid({time:1,w:100,h:100},1.02,100,100),true);for(const [time,w,h]of[[0.5,100,100],[2,100,100],[1.02,200,100]])assert.equal(a.historyValid({time:1,w:100,h:100},time,w,h),false);});
test('sustained GPU overload disables temporal before reducing debanding',()=>{const a=api();assert.ok(a);const p=a.createBudget();p.configure({temporal:1,deband:1},1080);for(let i=0;i<90;i++)p.sample(6);assert.equal(p.temporalAllowed,false);for(let i=0;i<90;i++)p.sample(6);assert.ok(p.debandScale<1);assert.equal(p.p95,6);});
test('reference GPU samples never reduce treatments',()=>{const a=api();const p=a.createBudget();for(let i=0;i<200;i++)p.sample(10,'cas');assert.equal(p.temporalAllowed,true);assert.equal(p.debandScale,1);});
test('without GPU timers adaptation requires a measured reference cadence',()=>{const a=api(),p=a.createBudget();p.configure({temporal:1,deband:1},1080);assert.equal(typeof p.cadence,'function');for(let i=0;i<5;i++)p.cadence(null,20);assert.equal(p.temporalAllowed,true);for(let i=0;i<3;i++)p.cadence(60,45);assert.equal(p.temporalAllowed,false);});

test('forced output uses source aspect ratio independent of screen',()=>{
 const a=api();assert.deepEqual(JSON.parse(JSON.stringify(a.outputSize(1920,1080,'native'))),{width:1920,height:1080});
 assert.deepEqual(JSON.parse(JSON.stringify(a.outputSize(1920,1080,'1440'))),{width:2560,height:1440});
 assert.deepEqual(JSON.parse(JSON.stringify(a.outputSize(1920,1080,'2160'))),{width:3840,height:2160});
 assert.equal(a.outputSize(1280,720,'2160').width,3840);
});
test('manual GPU policy retains temporal and gradients despite high timings or low cadence',()=>{
 const p=api().createBudget();p.limitMs=0;for(let i=0;i<200;i++){p.sample(20);p.cadence(60,20);}
 assert.equal(p.temporalAllowed,true);assert.equal(p.debandScale,1);assert.equal(p.p95,20);
});
test('new controls sanitize saved output, AA and GPU policy',()=>{
 const a=api(),s=a.normalize({output:'invalid',antialias:99,gpuBudget:-5});assert.equal(s.output,'auto');assert.equal(s.antialias,1);assert.equal(s.gpuBudget,6);
 assert.equal(a.normalize({gpuBudget:0,output:'2160'}).gpuBudget,0);
});

test('overload skips disabled temporal and reduces actual debanding work',()=>{
 const p=api().createBudget();p.configure({temporal:0,deband:.3,cleanup:.35,antialias:0,output:'native'},1080);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.debandTaps,2);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.debandScale,0);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.cleanupAllowed,false);
});
test('overload can reduce forced resolution and AA without changing preferences',()=>{
 const a=api(),s=a.normalize({output:'2160',antialias:.5,deband:0,cleanup:0}),p=a.createBudget();p.configure(s,1080);
 for(let i=0;i<90;i++)p.sample(20);
 assert.equal(p.outputFor(s), '1440');
 for(let i=0;i<90;i++)p.sample(20);
 assert.equal(p.outputFor(s), 'native');
 for(let i=0;i<90;i++)p.sample(20);
 assert.equal(p.antialiasAllowed,false);
 assert.equal(s.output,'2160');assert.equal(s.antialias,.5);
 assert.equal(p.outputFor({...s,mode:'cas'}),'2160');
});
test('manual budget bypasses every automatic reduction',()=>{
 const a=api(),s=a.normalize({output:'2160',antialias:1,temporal:1,gpuBudget:0}),p=a.createBudget();p.limitMs=0;p.configure(s,1080);
 for(let i=0;i<1000;i++){p.sample(50);p.cadence(60,10);}
 assert.equal(p.outputFor(s),'2160');assert.equal(p.antialiasAllowed,true);assert.equal(p.cleanupAllowed,true);assert.equal(p.debandTaps,4);
});
test('explicit output below source resolution is retained before adaptation',()=>{
 const a=api(),s=a.normalize({output:'1440'}),p=a.createBudget();p.configure(s,2160);
 assert.equal(p.outputFor(s),'1440');
});

test('v9 sharpening defaults to luma-only USM and keeps every method selectable',()=>{
 const a=api();assert.equal(a.defaults.sharpening,'usm');assert.equal(a.defaults.lumaSharpen,true);assert.equal(a.defaults.sharpness,3);assert.equal(a.defaults.spatialMode,'selective');
 for(const m of ['usm','cas','rcas','native'])assert.equal(a.normalize({sharpening:m}).sharpening,m);
 assert.equal(a.normalize({sharpening:'bad',spatialMode:'bad'}).sharpening,'usm');
 assert.equal(a.normalize({sharpening:'rcas',spatialMode:'legacy'}).spatialMode,'legacy');
 assert.equal(a.normalize({noiseFloor:99}).noiseFloor,8);assert.equal(a.normalize({lumaSharpen:false}).lumaSharpen,false);
});
test('diagnostics are opt-in, segment settings and compute percentiles without mixing modes',()=>{
 const d=api().createDiagnostics();assert.equal(d.frame({},0),null);d.start({test:true});
 const a=d.frame({mode:'cas'},0);d.frame({mode:'cas'},1000);for(let i=1;i<=100;i++)d.sample(a,i);
 const b=d.frame({mode:'filtered'},1100);d.sample(b,2);d.disjoint();d.sample(b,NaN);d.stop();
 const r=d.report();assert.equal(r.segments.length,2);assert.equal(r.segments[0].gpu.p95,95);assert.equal(r.segments[1].gpu.count,1);assert.equal(r.disjoints,1);assert.equal(d.frame({},2000),null);
 d.start();d.sample(a,123);assert.equal(d.report().segments.length,0);
});
test('video stats export only allowlisted video counters, no addresses',async()=>{
 const a=api(),rows=new Map([['v',{id:'v',type:'inbound-rtp',kind:'video',framesDecoded:20,powerEfficientDecoder:true,decoderImplementation:'MediaCodec',codecId:'c',address:'private'}],['c',{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=42e01f'}],['ip',{type:'candidate-pair',address:'private'}]]);
 const r=await a.captureVideoStats({videoWidth:1920,videoHeight:1080,currentTime:1,getVideoPlaybackQuality:()=>({totalVideoFrames:20,droppedVideoFrames:1})},{getStats:async()=>rows});
 assert.equal(r.rtc.length,1);assert.equal(r.rtc[0].framesDecoded,20);assert.equal(r.rtc[0].powerEfficientDecoder,true);assert.equal(r.rtc[0].decoderImplementation,'MediaCodec');assert.equal(r.rtc[0].codec.mimeType,'video/H264');assert.ok(!JSON.stringify(r).includes('private'));
});
test('ending a capture keeps the original interruption reason on export',()=>{
 const d=api().createDiagnostics();d.start();d.frame({},0);d.stop('source-changed');d.stop();assert.equal(d.report().stopReason,'source-changed');d.start();assert.equal(d.report().stopReason,null);
});

test('auto output matches the on-screen video height, never above it',()=>{
 const a=api();assert.equal(a.defaults.output,'auto');
 assert.equal(a.resolveOutput('auto',1080,1080),'native');
 assert.equal(a.resolveOutput('auto',864*1.25,1080),'native');
 assert.equal(a.resolveOutput('auto',1110,1080),'native');
 assert.equal(a.resolveOutput('auto',1220,1080),'1216');
 assert.equal(a.resolveOutput('auto',1280,1080),'1280');
 assert.equal(a.resolveOutput('auto',1440,1080),'1440');
 assert.equal(a.resolveOutput('auto',2160,1080),'2160');
 assert.equal(a.resolveOutput('auto',4320,1080),'2160');
 assert.equal(a.resolveOutput('auto',2160,2160),'native');
 assert.equal(a.resolveOutput('auto',0,1080),'native');
 assert.equal(a.resolveOutput('2160',1080,1080),'2160');
 assert.equal(a.normalize({output:'auto'}).output,'auto');
 assert.equal(a.normalize({output:'1216'}).output,'1216');
 assert.equal(a.normalize({output:'99999'}).output,'auto');
 assert.deepEqual(JSON.parse(JSON.stringify(a.outputSize(1920,1080,'1280'))),{width:2276,height:1280});
});
test('display-matched output degrades to native under overload',()=>{
 const a=api(),s=a.normalize({output:'1280',antialias:0,deband:0,cleanup:0}),p=a.createBudget();p.configure(s,1080);
 assert.equal(p.outputFor(s),'1280');
 for(let i=0;i<90;i++)p.sample(20);
 assert.equal(p.outputFor(s),'native');
});
test('v8.5 chroma and detail are bounded and degrade last under overload',()=>{
 const a=api(),s=a.normalize({chroma:7,detail:-1});assert.equal(s.chroma,1);assert.equal(s.detail,0);
 assert.ok(a.defaults.chroma>0&&a.defaults.detail>0);
 const p=a.createBudget();p.configure({cleanup:.35,deband:0,chroma:.5,detail:.35},1080);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.cleanupAllowed,false);assert.equal(p.enhanceAllowed,true);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.enhanceAllowed,false);
});

test('neural restoration is opt-in, bounded and degraded right after AA',()=>{
 const a=api();assert.equal(a.defaults.neural,0);assert.equal(a.normalize({neural:5}).neural,1);assert.equal(a.normalize({neural:-1}).neural,0);
 const p=a.createBudget();p.configure({neural:1,antialias:.5,deband:.3,cleanup:0,output:'native'},1080);
 for(let i=0;i<90;i++)p.sample(20);assert.equal(p.antialiasAllowed,false);assert.equal(p.neuralAllowed,true);
 for(let i=0;i<90;i++)p.sample(20);assert.equal(p.neuralAllowed,false);assert.equal(p.debandScale,1);
});

test('decoder summary reports DT like Better xCloud and the decoder kind when exposed',()=>{
 const a=api();
 const d=a.decoderSummary({framesDecoded:100,totalDecodeTime:1},{framesDecoded:160,totalDecodeTime:1.6,powerEfficientDecoder:true,decoderImplementation:'ExternalDecoder (MediaCodecVideoDecoder)'});
 assert.equal(d.kind,'hardware');assert.ok(Math.abs(d.dtMs-10)<1e-9);assert.match(d.implementation,/MediaCodec/);
 assert.equal(a.decoderSummary(null,{framesDecoded:1,totalDecodeTime:0}).dtMs,null);
 assert.equal(a.decoderSummary({framesDecoded:1,totalDecodeTime:0},{framesDecoded:2,totalDecodeTime:.0005,powerEfficientDecoder:false}).kind,'software');
 assert.equal(a.decoderSummary({framesDecoded:1,totalDecodeTime:0},{framesDecoded:2,totalDecodeTime:.0005}).kind,'unknown');
 assert.equal(a.decoderSummary(null,null),null);
});

test('codec test keeps only the requested family plus RTX/RED/FEC',()=>{
 const a=api(),caps=[{mimeType:'video/VP8'},{mimeType:'video/H264',sdpFmtpLine:'x'},{mimeType:'video/AV1'},{mimeType:'video/rtx'},{mimeType:'video/red'},{mimeType:'video/ulpfec'},{mimeType:'video/H265'}];
 assert.deepEqual(JSON.parse(JSON.stringify(a.filterCodecs(caps,'av1').map(c=>c.mimeType))),['video/AV1','video/rtx','video/red','video/ulpfec']);
 assert.deepEqual(JSON.parse(JSON.stringify(a.filterCodecs(caps,'h265').map(c=>c.mimeType))),['video/H265','video/rtx','video/red','video/ulpfec']);
 assert.equal(a.filterCodecs(caps,'vp9').length,0);assert.equal(a.filterCodecs(caps,'auto'),null);
 assert.equal(a.defaults.codec,'auto');assert.equal(a.normalize({codec:'av1'}).codec,'av1');assert.equal(a.normalize({codec:'x'}).codec,'auto');
});

test('H.264 High test keeps only profile 64 and reports profiles from fmtp',()=>{
 const a=api();
 assert.equal(a.h264Profile('level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f'),'High');
 assert.equal(a.h264Profile('profile-level-id=4d001f'),'Main');assert.equal(a.h264Profile('profile-level-id=42e01f'),'Baseline');assert.equal(a.h264Profile(''),null);
 const caps=[{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=42e01f'},{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=4d001f'},{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=640c1f'},{mimeType:'video/rtx'}];
 assert.deepEqual(JSON.parse(JSON.stringify(a.filterCodecs(caps,'h264high').map(c=>c.sdpFmtpLine||c.mimeType))),['profile-level-id=640c1f','video/rtx']);
 assert.equal(a.filterCodecs(caps.slice(0,2),'h264high').length,0);assert.equal(a.normalize({codec:'h264high'}).codec,'h264high');
 const d=a.decoderSummary({framesDecoded:0,totalDecodeTime:0,jitterBufferDelay:0,jitterBufferEmittedCount:0},{framesDecoded:30,totalDecodeTime:.3,jitterBufferDelay:.45,jitterBufferEmittedCount:30,framesPerSecond:30});
 assert.ok(Math.abs(d.jitterMs-15)<1e-9);assert.ok(Math.abs(d.dtMs-10)<1e-9);assert.equal(d.fps,30);
});
