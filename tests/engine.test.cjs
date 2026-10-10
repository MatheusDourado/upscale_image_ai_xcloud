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
 const a=api(),s=a.normalize({output:'invalid',antialias:99,gpuBudget:-5});assert.equal(s.output,'native');assert.equal(s.antialias,1);assert.equal(s.gpuBudget,3);
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

test('v8 settings keep native sharpening and allow isolated legacy comparison',()=>{
 const a=api();assert.equal(a.defaults.sharpening,'native');assert.equal(a.defaults.spatialMode,'selective');
 assert.equal(a.normalize({sharpening:'rcas',spatialMode:'legacy'}).sharpening,'rcas');
 assert.equal(a.normalize({sharpening:'bad',spatialMode:'bad'}).spatialMode,'selective');
});
test('diagnostics are opt-in, segment settings and compute percentiles without mixing modes',()=>{
 const d=api().createDiagnostics();assert.equal(d.frame({},0),null);d.start({test:true});
 const a=d.frame({mode:'cas'},0);d.frame({mode:'cas'},1000);for(let i=1;i<=100;i++)d.sample(a,i);
 const b=d.frame({mode:'filtered'},1100);d.sample(b,2);d.disjoint();d.sample(b,NaN);d.stop();
 const r=d.report();assert.equal(r.segments.length,2);assert.equal(r.segments[0].gpu.p95,95);assert.equal(r.segments[1].gpu.count,1);assert.equal(r.disjoints,1);assert.equal(d.frame({},2000),null);
 d.start();d.sample(a,123);assert.equal(d.report().segments.length,0);
});
test('video stats export only allowlisted video counters, no addresses',async()=>{
 const a=api(),rows=new Map([['v',{id:'v',type:'inbound-rtp',kind:'video',framesDecoded:20,codecId:'c',address:'private'}],['c',{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=42e01f'}],['ip',{type:'candidate-pair',address:'private'}]]);
 const r=await a.captureVideoStats({videoWidth:1920,videoHeight:1080,currentTime:1,getVideoPlaybackQuality:()=>({totalVideoFrames:20,droppedVideoFrames:1})},{getStats:async()=>rows});
 assert.equal(r.rtc.length,1);assert.equal(r.rtc[0].framesDecoded,20);assert.equal(r.rtc[0].codec.mimeType,'video/H264');assert.ok(!JSON.stringify(r).includes('private'));
});
test('ending a capture keeps the original interruption reason on export',()=>{
 const d=api().createDiagnostics();d.start();d.frame({},0);d.stop('source-changed');d.stop();assert.equal(d.report().stopReason,'source-changed');d.start();assert.equal(d.report().stopReason,null);
});
