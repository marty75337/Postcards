'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types=['Postal stationery card','Picture postcard','Cover','Folded entire','Other'];
const sections={overview:[['reference','Reference number'],['title','Title'],['type','Item type','select',types],['date','Posting date / approximate date'],['origin','Origin'],['destination','Destination'],['sender','Sender'],['recipient','Recipient'],['dimensions','Dimensions in mm (measured)'],['location','Album / box / sleeve'],['purchaseDate','Purchase date'],['seller','Seller / auction / lot'],['price','Price paid (include currency)'],['tags','Collection / themes / tags'],['condition','Condition & physical features','textarea'],['description','Description','textarea']],research:[['evidence','Overall research status','select',['Provisional','In progress','Reviewed']],['franking','Franking / imprinted postage','textarea'],['markings','Postal & censorship markings','textarea'],['route','Route & dated transit evidence','textarea'],['rate','Postal rate & supporting evidence','textarea'],['sources','Sources / catalogue references','textarea'],['questions','Unresolved readings & questions','textarea']],letter:[['messageDate','Message date'],['language','Language'],['transcription','Transcription','textarea'],['translation','English translation','textarea'],['letterNotes','People, places & content notes','textarea']],album:[['caption','Album caption','textarea']]};
let processing=false;
let records=[],selected='',tab='overview',db,saveTimer,saveChain=Promise.resolve(),viewAsset=null,zoom=100;
const current=()=>records.find(r=>r.id===selected);
const uid=()=>globalThis.crypto?.randomUUID?.()||'item-'+Date.now()+'-'+Math.random().toString(36).slice(2);
function status(msg){$('status').textContent=msg;}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('martin-postal-register-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('collection');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function readDB(){return new Promise((resolve,reject)=>{const t=db.transaction('collection');const r=t.objectStore('collection').get('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function schedule(){clearTimeout(saveTimer);status('Changes waiting to save…');saveTimer=setTimeout(save,450);}
function save(){clearTimeout(saveTimer);const snapshot=structuredClone(records);saveChain=saveChain.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{if(!db){reject(new Error('Browser storage unavailable'));return;}const t=db.transaction('collection','readwrite');t.objectStore('collection').put(snapshot,'records');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Save interrupted'));}));saveChain.then(()=>status('Saved on this device · '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})),()=>status('Could not save on this device. Export a backup now to keep your work.'));return saveChain;}
function renderList(){const q=$('search').value.toLocaleLowerCase(),type=$('filter').value;const found=records.filter(r=>(!type||r.type===type)&&Object.entries(r).filter(([k])=>k!=='assets').map(([,v])=>String(v)).join(' ').toLocaleLowerCase().includes(q));$('count').textContent=records.length;$('list').innerHTML=found.map(r=>`<button class="item ${r.id===selected?'selected':''}" data-id="${esc(r.id)}"><small>${esc(r.reference||'No reference')} · ${esc(r.type)}</small><strong>${esc(r.title||'Untitled item')}</strong><small>${esc(r.date||'Date to establish')}</small></button>`).join('')||'<p class="empty">No matching records.</p>';$('list').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.id;render();});}
function headings(){const r=current();$('refHeading').textContent=r?.reference||'NEW RECORD';$('recordHeading').textContent=r?.title||'Untitled item';}
function render(){renderList();const r=current();$('workspace').hidden=!r;if(!r)return;headings();document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});$('editor').hidden=tab==='images';$('images').hidden=tab!=='images';if(tab==='images'){renderImages();return;}
let pre=tab==='overview'&&r.assets.find(a=>a.mime.startsWith('image/'));$('editor').innerHTML=(pre?`<img class="sample-image" src="${pre.data}" alt="${esc(pre.label)}">`:'')+(tab==='research'?'<p class="intro">Separate observed facts from interpretation. Note uncertainty and sources alongside each finding.</p>':'')+(tab==='album'?'<p class="intro">Write or edit a concise caption to copy into your album-page editor.</p><div class="caption-actions"><button type="button" id="draftCaption">Draft from record fields</button> <button type="button" id="copyCaption">Copy caption</button></div>':'')+'<div class="fields">'+sections[tab].map(([key,label,kind,options])=>`<label class="${kind==='textarea'?'wide':''}">${esc(label)}${kind==='select'?`<select data-field="${key}">${options.map(o=>`<option ${r[key]===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`:kind==='textarea'?`<textarea data-field="${key}" rows="${key==='caption'?10:5}">${esc(r[key]||'')}</textarea>`:`<input data-field="${key}" value="${esc(r[key]||'')}">`}</label>`).join('')+'</div>';
$('editor').querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{r[el.dataset.field]=el.value;r.updated=new Date().toISOString();headings();renderList();schedule();});if(tab==='album'){$('draftCaption').onclick=()=>{if(r.caption&&!confirm('Replace the existing caption with a draft from this record?'))return;r.caption=[`${r.type}${r.date?' dated '+r.date:''}${r.origin?' from '+r.origin:''}${r.destination?' to '+r.destination:''}.`,r.franking,r.description].filter(Boolean).join('\n\n');render();schedule();};$('copyCaption').onclick=async()=>{try{await navigator.clipboard.writeText(r.caption||'');status('Caption copied.');}catch{const t=$('editor').querySelector('textarea');t.focus();t.select();status('Caption selected. Use Copy on your device.');}};}}
function renderImages(){const r=current();$('images').innerHTML='<p class="intro">Keep both sides, unfolded pages and details together. Add JPEG, PNG, WebP or PDF files, up to 20 MB each. Uploads are automatically cropped and straightened where paper edges are clear. Originals are retained in backups.</p><button class="primary" id="attach">＋ Add images or PDFs</button> <button id="processExisting">Process existing uploads</button><p id="scanProgress" role="status" aria-live="polite"></p><div class="gallery">'+r.assets.map((a,i)=>`<article class="image-card">${a.mime.startsWith('image/')?`<img src="${a.data}" alt="${esc(a.label)}" data-open="${i}" tabindex="0" role="button">`:'<div class="pdf-tile">Original PDF document</div>'}<label>Image / document label<input data-label="${i}" value="${esc(a.label)}"></label><small>${esc(a.name)}</small><div class="actions"><button data-open="${i}">View</button><button data-download="${i}">Download</button>${a.mime.startsWith('image/')?`<button data-rotate="${i}" data-turn="-1" ${processing?'disabled':''} aria-label="Rotate image left 90 degrees">↶ Rotate left</button><button data-rotate="${i}" data-turn="1" ${processing?'disabled':''} aria-label="Rotate image right 90 degrees">↷ Rotate right</button>`:''}<button class="danger" data-remove="${i}">Remove</button></div></article>`).join('')+'</div>';$('attach').disabled=processing;$('processExisting').disabled=processing;$('attach').onclick=()=>$('upload').click();$('processExisting').onclick=()=>processExisting(r);$('images').querySelectorAll('[data-open]').forEach(b=>{b.onclick=()=>openAsset(r.assets[+b.dataset.open]);b.onkeydown=e=>{if(e.key==='Enter')b.click();};});$('images').querySelectorAll('[data-label]').forEach(b=>b.oninput=()=>{r.assets[+b.dataset.label].label=b.value;schedule();});$('images').querySelectorAll('[data-download]').forEach(b=>b.onclick=()=>downloadAsset(r.assets[+b.dataset.download]));$('images').querySelectorAll('[data-rotate]').forEach(b=>b.onclick=()=>rotateAsset(r,r.assets[+b.dataset.rotate],+b.dataset.turn));$('images').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(confirm('Remove this attachment from the record?')){r.assets.splice(+b.dataset.remove,1);renderImages();schedule();}});}
async function rotateAsset(record,asset,direction){
  if(processing||!asset||!asset.mime.startsWith('image/'))return;
  processing=true;renderImages();
  const previous={...asset};
  try{
    const base=asset.rotationBaseData||asset.data;
    const turns=((asset.quarterTurns||0)+direction+4)%4;
    let data=base;
    if(turns){
      const im=new Image();im.src=base;await im.decode();
      const c=document.createElement('canvas');
      c.width=turns%2?im.naturalHeight:im.naturalWidth;
      c.height=turns%2?im.naturalWidth:im.naturalHeight;
      const ctx=c.getContext('2d');
      ctx.translate(c.width/2,c.height/2);ctx.rotate(turns*Math.PI/2);
      ctx.drawImage(im,-im.naturalWidth/2,-im.naturalHeight/2);
      // PNG avoids introducing JPEG damage during repeated orientation changes.
      data=c.toDataURL('image/png');c.width=c.height=1;
    }
    if(!records.includes(record)||!record.assets.includes(asset))return;
    asset.rotationBaseData=base;
    asset.rotationBaseMime=asset.rotationBaseMime||asset.mime;
    asset.rotationBaseName=asset.rotationBaseName||asset.name;
    asset.quarterTurns=turns;asset.data=data;
    asset.mime=turns?'image/png':asset.rotationBaseMime;
    asset.name=turns?asset.rotationBaseName.replace(/\.[^.]+$/,'')+'-rotated.png':asset.rotationBaseName;
    await save();
  }catch(err){Object.keys(asset).forEach(k=>delete asset[k]);Object.assign(asset,previous);alert('Rotation could not be saved: '+err.message);}
  finally{processing=false;render();}
}
function dataBlob(data){const parts=data.split(',');const binary=atob(parts[1]);const arr=Uint8Array.from(binary,c=>c.charCodeAt(0));return new Blob([arr],{type:parts[0].slice(5).split(';')[0]});}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function downloadAsset(a){download(dataBlob(a.data),a.name);}
let pdfURL=null;function openAsset(a){viewAsset=a;zoom=100;$('viewerTitle').textContent=a.label;if(pdfURL){URL.revokeObjectURL(pdfURL);pdfURL=null;}if(a.mime==='application/pdf'){pdfURL=URL.createObjectURL(dataBlob(a.data));$('viewContent').innerHTML=`<iframe title="PDF attachment" src="${pdfURL}"></iframe>`;}else $('viewContent').innerHTML=`<img style="width:100%" src="${a.data}" alt="${esc(a.label)}">`;['smaller','larger','fit'].forEach(id=>$(id).disabled=a.mime==='application/pdf');$('viewer').showModal();}
function zoomTo(n){zoom=Math.max(25,Math.min(400,n));const im=$('viewContent').querySelector('img');if(im)im.style.width=zoom+'%';}
function fileData(f){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(f);});}
const safeMimes=['image/jpeg','image/png','image/webp','application/pdf'];
function validBackup(b){if(b?.format!=='postal-history-register'||b.version!==1||!Array.isArray(b.records))throw Error('This is not a version 1 Collection Register backup.');const ids=new Set();for(const r of b.records){if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||!Array.isArray(r.assets))throw Error('Invalid or duplicate record ID.');ids.add(r.id);for(const [k,v] of Object.entries(r)){if(k!=='assets'&&typeof v!=='string')throw Error('Invalid record field.');}if(!types.includes(r.type))throw Error('Unknown item type.');for(const a of r.assets){if(!a||!safeMimes.includes(a.mime)||typeof a.name!=='string'||typeof a.label!=='string'||typeof a.data!=='string'||!a.data.startsWith('data:'+a.mime+';base64,')||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data.split(',')[1])||a.data.split(',')[1].length%4)throw Error('Invalid attachment.');}}return b.records;}
$('search').oninput=renderList;$('filter').onchange=renderList;document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
$('add').onclick=()=>{const used=new Set(records.map(r=>r.reference));let n=records.length+1;while(used.has('PH-'+String(n).padStart(4,'0')))n++;const r={id:uid(),reference:'PH-'+String(n).padStart(4,'0'),title:'New collection item',type:'Cover',evidence:'Provisional',assets:[],updated:new Date().toISOString()};records.unshift(r);selected=r.id;tab='overview';$('search').value='';$('filter').value='';render();schedule();};
$('delete').onclick=()=>{const r=current();if(!confirm(`Delete “${r.title}” and its attachments? Export a backup first if you may need it later.`))return;records=records.filter(x=>x.id!==r.id);selected=records[0]?.id||'';render();schedule();};
function scanProgress(message){status(message);const el=$('scanProgress');if(el)el.textContent=message;}
async function addProcessed(r, originals){
  let processed=0;const failures=[];
  for(const original of originals){
    if(!records.includes(r))break;
    if(!original.assetId)original.assetId=uid();
    if(original.processingVersion||r.assets.some(a=>a.sourceId===original.assetId&&a.processingVersion))continue;
    try{const generated=await ScanProcessor.generate(original,scanProgress);if(!records.includes(r))break;r.assets.push(...generated);await save();processed++;}
    catch(err){failures.push(original.name+': '+err.message);}
  }
  return {processed,failures};
}
async function processExisting(r){
  if(processing)return;processing=true;render();
  try{const result=await addProcessed(r,r.assets.filter(a=>!a.processingVersion));render();scanProgress(result.processed+' original(s) processed.'+(result.failures.length?' Some originals need another attempt.':''));if(result.failures.length)alert('Originals retained. Could not process:\n'+result.failures.join('\n'));}
  catch(err){alert('Processing could not finish: '+err.message);}
  finally{processing=false;render();}
}
$('upload').onchange=async e=>{
  const files=[...e.target.files],r=current();e.target.value='';if(processing||!r||!files.length)return;
  processing=true;render();
  try{
    const additions=[];
    for(const f of files){const mime=f.type||(/\.pdf$/i.test(f.name)?'application/pdf':'');if(!safeMimes.includes(mime))throw Error('Use JPEG, PNG, WebP or PDF files.');if(f.size>20*1024*1024)throw Error(f.name+' exceeds the 20 MB limit.');additions.push({assetId:uid(),name:f.name,label:f.name+' — original',mime,data:await fileData(f)});}
    if(!records.includes(r))throw Error('The selected record was deleted.');
    r.assets.push(...additions);await save();
    const result=await addProcessed(r,additions);render();
    if(result.failures.length)alert('Uploads saved as originals, but some processing failed. Use Process existing uploads to retry:\n'+result.failures.join('\n'));
  }catch(err){alert('Upload could not finish: '+err.message);}
  finally{processing=false;render();}
};
$('backup').onclick=async()=>{const name=prompt('Name your backup (the date is included):','Postal-history-collection');if(name===null)return;const filename=(name.trim()||'Postal-history-collection').replace(/[^a-zA-Z0-9 _-]/g,'_')+'-'+new Date().toISOString().slice(0,10)+'.json';download(new Blob([JSON.stringify({format:'postal-history-register',version:1,exported:new Date().toISOString(),records})],{type:'application/json'}),filename);status('Backup download started. Save the JSON file in Files or iCloud Drive.');};
$('restore').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>200*1024*1024)throw Error('This backup exceeds the 200 MB import limit.');const incoming=validBackup(JSON.parse(await f.text()));const overlaps=incoming.filter(r=>records.some(x=>x.id===r.id)).length;if(!confirm(`Import ${incoming.length} record(s)? ${overlaps} matching record(s) will be replaced. Other records will be kept. Export a backup first if needed.`))return;const merged=new Map(records.map(r=>[r.id,r]));incoming.forEach(r=>merged.set(r.id,r));records=[...merged.values()];selected=incoming[0]?.id||records[0]?.id||'';render();await save();}catch(err){alert('Import failed: '+err.message);}};
$('help').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('closeViewer').onclick=()=>$('viewer').close();$('larger').onclick=()=>zoomTo(zoom+25);$('smaller').onclick=()=>zoomTo(zoom-25);$('fit').onclick=()=>zoomTo(100);$('downloadImage').onclick=()=>downloadAsset(viewAsset);
$('print').onclick=()=>{const r=current();$('printArea').innerHTML=`<span>POSTAL HISTORY COLLECTION REGISTER · ${esc(r.reference)}</span><h1>${esc(r.title)}</h1>`+Object.entries(sections).map(([section,fields])=>`<h2>${({overview:'Item details',research:'Postal research',letter:'Letter & translation',album:'Album caption'})[section]}</h2><dl>`+fields.filter(([k])=>r[k]&&k!=='title'&&k!=='reference').map(([k,l])=>`<dt>${esc(l)}</dt><dd><p>${esc(r[k])}</p></dd>`).join('')+'</dl>').join('')+r.assets.filter(a=>a.mime.startsWith('image/')).map(a=>`<figure><img src="${a.data}" alt="${esc(a.label)}"><figcaption>${esc(a.label)}</figcaption></figure>`).join('')+'<p>PDF originals: '+esc(r.assets.filter(a=>a.mime==='application/pdf').map(a=>a.label).join('; ')||'None')+'</p>';Promise.all([...$('printArea').querySelectorAll('img')].map(im=>im.decode().catch(()=>{}))).then(()=>window.print());};
window.addEventListener('beforeunload',e=>{if(saveTimer){save();}});document.addEventListener('visibilitychange',()=>{if(document.hidden)save().catch(()=>{});});
(async()=>{try{db=await openDB();records=await readDB();if(!Array.isArray(records)){records=structuredClone(window.SEED_RECORDS||[]);await save();}else status('Collection loaded from this device.');}catch{records=structuredClone(window.SEED_RECORDS||[]);status('Browser storage is unavailable. Keep your work by exporting a backup before closing.');}selected=records[0]?.id||'';render();})();
