const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},document:{createElement:()=>({getContext:()=>({drawImage(source){this.source=source;},getImageData(){return {data:this.source.pixels};}})})}};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../scan-processing.js','utf8'),context);
const analyse=context.window.ScanProcessor.analyse;
function scan(angle=0,full=false){const w=400,h=300,pixels=new Uint8ClampedArray(w*h*4),a=angle*Math.PI/180;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=x-200,dy=y-150,u=dx*Math.cos(a)+dy*Math.sin(a),v=-dx*Math.sin(a)+dy*Math.cos(a),card=full||(Math.abs(u)<130&&Math.abs(v)<80);const i=4*(y*w+x);pixels.set(card?[215,197,160,255]:[255,255,255,255],i);}return {width:w,height:h,pixels};}
for(const angle of [-10,-4,0,6,12]){const r=analyse(scan(angle));assert(r.box,'card boundary detected');assert(Math.abs(r.angle*180/Math.PI+angle)<.7,'skew corrected: '+angle);assert(r.box.r-r.box.l>260&&r.box.r-r.box.l<280,'safe card width');assert(r.box.b-r.box.t>160&&r.box.b-r.box.t<180,'safe card height');}
assert.equal(analyse(scan(0,true)).box,null,'no boundary must keep full frame');
const empty=scan();empty.pixels.fill(255);assert.equal(analyse(empty).box,null,'blank page must keep full frame');
// Exercise the actual orchestration, including retry, duplicate prevention and originals.
const app=fs.readFileSync(__dirname+'/../app.js','utf8');
const functions=app.slice(app.indexOf('async function addProcessed'),app.indexOf('async function processExisting'));
let saves=0,ids=0;const record={assets:[]};
const orchestration={records:[record],uid:()=> 'source-'+(++ids),ScanProcessor:{generate:async a=>[{name:'processed.jpg',sourceId:a.assetId,processingVersion:'scan-v1'}]},scanProgress(){},save:async()=>saves++};
vm.createContext(orchestration);vm.runInContext(functions,orchestration);
(async()=>{const original={name:'original.pdf'};record.assets.push(original);await orchestration.addProcessed(record,[original]);await orchestration.addProcessed(record,[original]);assert.equal(record.assets.length,2);assert.equal(record.assets[0],original);assert.equal(saves,1);const failed={name:'bad.pdf'};record.assets.push(failed);orchestration.ScanProcessor.generate=async()=>{throw Error('invalid PDF');};const r=await orchestration.addProcessed(record,[failed]);assert.equal(r.failures.length,1);assert(record.assets.includes(failed));console.log('Passed: five skew angles, crop margins, blank/full-page safety, original retention, duplicate prevention and processing errors.');})().catch(e=>{console.error(e);process.exitCode=1;});
