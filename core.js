/* WH-1000XM4 2.9.0 RACE updater. No dependency on native helper software. */
(function(root){
'use strict';
const UUID='8901dfa8-5c7e-4d8f-9f0c-c2b70683f5f0';
const IMAGES={
 'aad2b5073a1116536149680c341b8be2150d2b2d1c6c498dc2337fec0e1b3988':{name:'2.9.0 · ANC off at startup',size:4087024,page:'3b3528355cf0f0c1c4431ffaf90ec787f6bccc65dc1053459167488b050fa45a'},
 '589e06b4fffbc74114f495ca0424761c0e3784b06adbf56d3f431559efe45b38':{name:'2.9.0 · Stock Sony firmware',size:4151776,page:'95a74afa50a48a3a9bd8433b1118133370a0f8fd2b97fd99f92c1ee8006df52f'}
};
const bytes=(...x)=>new Uint8Array(x), view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const eq=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
async function sha(b){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',b)));}
function u32(n){const b=new Uint8Array(4);view(b).setUint32(0,n,true);return b;}
function concat(...xs){const b=new Uint8Array(xs.reduce((n,x)=>n+x.length,0));let at=0;for(const x of xs){b.set(x,at);at+=x.length;}return b;}
function need(ok,msg){if(!ok)throw Error(msg);}
async function validate(image){
 need(image instanceof Uint8Array && image.length>=4096,'Firmware is too small.');
 const hash=await sha(image),meta=IMAGES[hash];
 need(meta&&meta.size===image.length,'Unknown firmware. Only the checked WH-1000XM4 2.9.0 stock and ANC-off packages are accepted.');
 need(await sha(image.subarray(256))===hex(image.subarray(0,32)),'Package header hash does not match.');
 need(image.subarray(32,256).every(x=>x===255),'Unexpected package header padding.');
 const d=view(image);let p=256,basic=false,end=false;
 while(p+4<=4096){const tag=d.getUint16(p,true),n=d.getUint16(p+2,true);p+=4;if(tag===65535){end=true;break;}need(p+n<=4096,'Invalid package metadata.');
  if(tag===0x11){need(n===10&&image[p]===2&&image[p+1]===1&&d.getUint32(p+2,true)===4096&&4096+d.getUint32(p+6,true)===image.length,'Unexpected package format.');basic=true;}p+=n;
 }
 need(basic&&end,'Package metadata is incomplete.');return {...meta,hash,image};
}
function crc(page){let c=0;for(const b of page){c^=b;for(let i=0;i<8;i++)c=((c<<1)^((c&128)?0x31:0))&255;}let r=0;for(let i=0;i<8;i++){r=(r<<1)|(c&1);c>>=1;}return r;}
function frame(cmd,payload=new Uint8Array(),head=0x15,kind=0x5a){const b=new Uint8Array(payload.length+6),d=view(b);b[0]=head;b[1]=kind;d.setUint16(2,payload.length+2,true);d.setUint16(4,cmd,true);b.set(payload,6);return b;}
class Race{
 constructor(send,log=()=>{}){this.send=send;this.log=log;this.buf=new Uint8Array();this.queue=[];this.waiters=[];this.dead=null;this.busy=false;}
 fail(e){if(this.dead)return;this.dead=e instanceof Error?e:Error(String(e));for(const w of this.waiters.splice(0)){clearTimeout(w.timer);w.reject(this.dead);}}
 recv(chunk){if(this.dead)return;try{this.buf=concat(this.buf,chunk);while(this.buf.length>=6){const d=view(this.buf),n=d.getUint16(2,true);need([5,21].includes(this.buf[0])&&[0x5a,0x5b,0x5d].includes(this.buf[1])&&n>=2&&n<=8192,'Invalid RACE frame.');if(this.buf.length<n+4)break;
  const p={kind:this.buf[1],cmd:d.getUint16(4,true),data:this.buf.slice(6,n+4)};this.buf=this.buf.slice(n+4);
  if(p.cmd===0x1c03&&p.kind===0x5a)throw Error('Headphones sent FOTA STOP: '+hex(p.data));
  const at=this.waiters.findIndex(w=>w.kind===p.kind&&w.cmd===p.cmd);if(at>=0){const w=this.waiters.splice(at,1)[0];clearTimeout(w.timer);w.resolve(p.data);}else{need(this.queue.length<128,'Too many unexpected device packets.');this.queue.push(p);}
 }}catch(e){this.fail(e);}}
 take(kind,cmd,timeout=15000){if(this.dead)return Promise.reject(this.dead);const i=this.queue.findIndex(p=>p.kind===kind&&p.cmd===cmd);if(i>=0)return Promise.resolve(this.queue.splice(i,1)[0].data);
  return new Promise((resolve,reject)=>{const w={kind,cmd,resolve,reject};w.timer=setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==w);const e=Error('Timed out waiting for '+cmd.toString(16)+'. Reconnect before retrying.');this.fail(e);reject(e);},timeout);this.waiters.push(w);});}
 async command(cmd,payload=new Uint8Array(),head=0x15,timeout=15000){need(!this.busy,'Concurrent command rejected.');if(this.dead)throw this.dead;this.busy=true;try{
  const answer=this.take(0x5b,cmd,timeout);answer.catch(()=>{});
  try{await this.send(frame(cmd,payload,head));}catch(e){this.fail(e);throw e;}
  return await answer;
 }finally{this.busy=false;}}
 async ok(cmd,payload,head=0x15,timeout=15000){const r=await this.command(cmd,payload,head,timeout);need(r.length>0&&r[0]===0,'Command '+cmd.toString(16)+' rejected: '+hex(r));return r;}
 async readPage(storage,address){const r=await this.ok(0x403,concat(bytes(storage,1),u32(address)),5);need(r.length===264&&r[1]===storage&&view(r).getUint32(4,true)===address,'Flash readback address/size mismatch.');return r.slice(8);}
 async preflight(){const r=await this.ok(0x1c00,bytes(0),5);need(eq(r,bytes(0,0,1,0,0,0x51,0,0,0xf0,0x5f,0)),'Unexpected staging partition. This updater only supports the checked XM4 layout.');
  const page=await this.readPage(0,0x255400),hash=await sha(page),installed=Object.values(IMAGES).find(x=>x.page===hash);
  need(installed,'Installed firmware fingerprint is not recognized. Only the checked 2.9.0 layout is supported.');return installed.name;
 }
 async flash(file,{status=()=>{},progress=()=>{},cancelled=()=>false}={}){
  // Revalidate and recheck immediately before any state-changing command.
  const checked=await validate(file.image);need(checked.hash===file.hash,'Selected package changed.');await this.preflight();
  const checkCancel=()=>need(!cancelled(),'Stopped before commit. Partial staging may remain; reconnect before retrying.');checkCancel();
  const image=checked.image,padded=new Uint8Array(Math.ceil(image.length/256)*256);padded.fill(255);padded.set(image);need(padded.length<=0x5ff000,'Package exceeds staging partition.');
  status('Preparing update');await this.ok(0x1c08,bytes(1,0));const started=await this.take(0x5d,0x1c08,30000);need(started.length>0&&started[0]===0,'Update start failed.');checkCancel();
  await this.ok(0x1c0a);await this.ok(0x1c06,bytes(1,2));await this.ok(0x1c06,bytes(0x10,2));checkCancel();
  status('Erasing staging partition');await this.ok(0x404,concat(bytes(1),u32(0x5ff000),u32(0x510000)),5,60000);
  const erased=await this.take(0x5d,0x404,60000);need(eq(erased,concat(bytes(0,1),u32(0x5ff000),u32(0x510000))),'Erase completion did not match the staging partition.');checkCancel();
  status('Writing firmware');const pages=padded.length/256;
  for(let i=0;i<pages;i+=3){checkCancel();const count=Math.min(3,pages-i),parts=[bytes(1,count)];for(let j=0;j<count;j++){const page=padded.subarray((i+j)*256,(i+j+1)*256);parts.push(bytes(crc(page)),u32(0x510000+(i+j)*256),page);}
   let done=false;for(let retry=0;retry<3;retry++){const r=await this.command(0x402,concat(...parts));need(r.length>=3,'Truncated page acknowledgement.');if(r[0]===0x0a&&retry<2)continue;
    need(r[0]===0&&r[1]===1&&r[2]===count&&r.length===3+4*count,'Page programming failed: '+hex(r));for(let j=0;j<count;j++)need(view(r).getUint32(3+4*j,true)===0x510000+(i+j)*256,'Page acknowledgement address mismatch.');done=true;break;}
   need(done,'Page checksum retries exhausted.');progress(Math.min(image.length,(i+count)*256),image.length);
  }
  checkCancel();status('Reading staged header');need(eq(await this.readPage(1,0x510000),padded.subarray(0,256)),'Staged header readback mismatch.');checkCancel();
  status('Checking integrity on headphones');await this.ok(0x1c01,bytes(1,0,1),0x15,60000);const integrity=await this.take(0x5d,0x1c01,60000);need(eq(integrity,bytes(0,1,0,1)),'Headphone integrity check failed: '+hex(integrity));checkCancel();
  await this.ok(0x1c06,bytes(0x11,2));checkCancel();status('Committing update');
  try{await this.ok(0x1c02,bytes(0));}catch(e){throw Error('Commit was sent; the result is unknown. Reconnect and verify before retrying. '+e.message);}
  status('Commit accepted. Allow the headset to finish and reboot, then reconnect to verify.');return checked;
 }
}
root.XM4={UUID,IMAGES,bytes,u32,concat,eq,hex,sha,crc,frame,validate,Race};
if(typeof module!=='undefined')module.exports=root.XM4;
})(globalThis);
