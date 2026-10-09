const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const vm=require('node:vm');
function api(){const context={globalThis:{}}; if(fs.existsSync('src/restoration-engine.js'))vm.runInNewContext(fs.readFileSync('src/restoration-engine.js','utf8'),context);return context.globalThis.BxRestoration;}
test('validated settings preserve natural colors and separate modes',()=>{const a=api();assert.ok(a,'engine exported');const s=a.normalize({cleanup:5,temporal:-1,contrast:NaN,mode:'bad'});assert.equal(s.cleanup,1);assert.equal(s.temporal,0);assert.equal(s.contrast,1);assert.equal(s.mode,'filtered');assert.equal(s.shadows,0);});
test('temporal history resets on interruption, resize and backwards time',()=>{const a=api();assert.ok(a);assert.equal(a.historyValid({time:1,w:100,h:100},1.02,100,100),true);for(const [time,w,h]of[[0.5,100,100],[2,100,100],[1.02,200,100]])assert.equal(a.historyValid({time:1,w:100,h:100},time,w,h),false);});
test('sustained GPU overload disables temporal before reducing debanding',()=>{const a=api();assert.ok(a);const p=a.createBudget();for(let i=0;i<90;i++)p.sample(6);assert.equal(p.temporalAllowed,false);for(let i=0;i<90;i++)p.sample(6);assert.ok(p.debandScale<1);assert.equal(p.p95,6);});
test('reference GPU samples never reduce treatments',()=>{const a=api();const p=a.createBudget();for(let i=0;i<200;i++)p.sample(10,'cas');assert.equal(p.temporalAllowed,true);assert.equal(p.debandScale,1);});
test('without GPU timers adaptation requires a measured reference cadence',()=>{const a=api(),p=a.createBudget();assert.equal(typeof p.cadence,'function');for(let i=0;i<5;i++)p.cadence(null,20);assert.equal(p.temporalAllowed,true);for(let i=0;i<3;i++)p.cadence(60,45);assert.equal(p.temporalAllowed,false);});

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
