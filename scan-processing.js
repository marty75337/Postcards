/* Local scan processing: no files leave the browser. Originals are retained. */
'use strict';
window.ScanProcessor = (() => {
  const VERSION = 'scan-v1';
  function canvas(w,h) { const c=document.createElement('canvas'); c.width=w;c.height=h;return c; }
  function bounds(points, angle) {
    const c=Math.cos(angle),s=Math.sin(angle);let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
    for(const [x,y] of points){const u=x*c-y*s,v=x*s+y*c;l=Math.min(l,u);r=Math.max(r,u);t=Math.min(t,v);b=Math.max(b,v);}
    return {l,t,r,b,area:(r-l)*(b-t)};
  }
  // Sample at low resolution so a full A4 scan remains practical on an iPad.
  // Flood fill from the border removes only connected scanner background.
  function analyse(source) {
    const scale=Math.min(1,700/Math.max(source.width,source.height));
    const w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale));
    const c=canvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,w,h);
    const d=ctx.getImageData(0,0,w,h).data, samples=[];
    for(let x=0;x<w;x+=Math.max(1,Math.floor(w/80))){samples.push(x,(h-1)*w+x);}
    for(let y=0;y<h;y+=Math.max(1,Math.floor(h/80))){samples.push(y*w,y*w+w-1);}
    const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
    const bg=[0,1,2].map(k=>median(samples.map(i=>d[4*i+k])));
    const similar=i=>Math.max(...bg.map((v,k)=>Math.abs(d[4*i+k]-v)))<24;
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
    function add(i){if(!seen[i]&&similar(i)){seen[i]=1;queue[tail++]=i;}}
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
    // Keep the largest connected foreground object, excluding dust and specks.
    let best=[];
    for(let start=0;start<w*h;start++){
      if(seen[start])continue;head=0;tail=0;queue[tail++]=start;seen[start]=1;
      while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&!seen[j]){seen[j]=1;queue[tail++]=j;}}
      if(tail>best.length)best=Array.from(queue.subarray(0,tail));
    }
    // Without a distinct card boundary, do not crop down to handwriting.
    if(best.length<w*h*.025)return {angle:0,box:null,note:'No clear paper edge: full scan retained'};
    const points=best.filter((_,i)=>i%3===0).map(i=>[i%w,Math.floor(i/w)]);
    let angle=0,box=bounds(points,0);
    for(let deg=-15;deg<=15;deg+=.5){const a=deg*Math.PI/180,b=bounds(points,a);if(b.area<box.area){box=b;angle=a;}}
    for(let deg=angle*180/Math.PI-.5;deg<=angle*180/Math.PI+.5;deg+=.1){const a=deg*Math.PI/180,b=bounds(points,a);if(b.area<box.area){box=b;angle=a;}}
    const fill=best.length/Math.max(1,box.area);
    if(fill<.65||Math.abs(angle)>14.5*Math.PI/180)return {angle:0,box:null,note:'Paper edge uncertain: full scan retained'};
    // Almost full-frame images need no crop; rotating these could cut off corners.
    if(box.area>w*h*.96)return {angle:0,box:null,note:'Already fills the scan: retained full frame'};
    const margin=5/scale;
    return {angle,box:{l:box.l/scale-margin,t:box.t/scale-margin,r:box.r/scale+margin,b:box.b/scale+margin},note:'Automatically cropped and straightened'};
  }
  function process(source){
    const result=analyse(source),b=result.box;
    const c=canvas(b?Math.ceil(b.r-b.l):source.width,b?Math.ceil(b.b-b.t):source.height),ctx=c.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
    if(b){ctx.translate(-b.l,-b.t);ctx.rotate(result.angle);}ctx.drawImage(source,0,0);
    const data=c.toDataURL('image/jpeg',.94);c.width=c.height=1;return {data,note:result.note};
  }
  async function imageSource(data){const im=new Image();im.src=data;await im.decode();const scale=Math.min(1,2600/Math.max(im.naturalWidth,im.naturalHeight));const c=canvas(Math.round(im.naturalWidth*scale),Math.round(im.naturalHeight*scale));c.getContext('2d').drawImage(im,0,0,c.width,c.height);return c;}
  async function generate(asset,progress=()=>{}){
    const out=[],stem=asset.name.replace(/\.[^.]+$/,'');
    function append(source,page){const p=process(source);out.push({name:stem+(page?'-page-'+page:'')+'-processed.jpg',label:stem+(page?' — page '+page:'')+' — '+p.note,mime:'image/jpeg',data:p.data,sourceId:asset.assetId,processingVersion:VERSION});source.width=source.height=1;}
    if(asset.mime==='application/pdf'){
      if(!window.pdfjsLib)throw Error('PDF processing library is unavailable. Check that the vendor folder was uploaded.');
      pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';
      const raw=atob(asset.data.split(',')[1]);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      const pdf=await pdfjsLib.getDocument({data:bytes,isEvalSupported:false}).promise;
      try{for(let n=1;n<=pdf.numPages;n++){progress('Processing '+asset.name+' — page '+n+' of '+pdf.numPages+'…');await new Promise(r=>setTimeout(r,0));const page=await pdf.getPage(n),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(3,2600/Math.max(base.width,base.height))});const c=canvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:c.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;append(c,n);page.cleanup();}}
      finally{await pdf.destroy();}
    }else{progress('Processing '+asset.name+'…');await new Promise(r=>setTimeout(r,0));append(await imageSource(asset.data));}
    return out;
  }
  return {generate,analyse,VERSION};
})();
