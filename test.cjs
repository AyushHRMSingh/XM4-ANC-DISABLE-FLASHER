'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
if(!global.crypto)Object.defineProperty(global,'crypto',{value:require('node:crypto').webcrypto});
const C=require('./core.js'),{bytes,u32,concat,frame}=C;
const env={window:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/firmware.js','utf8'),env);
const image=new Uint8Array(Buffer.from(env.window.XM4_FIRMWARE,'base64'));
// Fixed known firmware page, captured from the stock decompressed image. No device needed.
const page=Uint8Array.from(Buffer.from('ACAP4ByxFvH/NBi/ASQLSwdJjegYAE/0oHLFaAJIASOoRyBGBLBwvWzsNAgchjIIKpQyCMRMBxBDhjIIbIYyCPC1IktFaBt4IUyFsDu5IUsAk+VoIEkgRkDy9lIK4Oj3GfoGRlCxHUsAk+VoGkkgRkDy+lIBI6hH/yAk4BhLGU8VSe2yjegoADt4ApPU+AzAIEZA8v1SASPgRy2xAS0R0ShGAvDf+Q3gPHgU8PsEAdAAIAjg6/do/wAo+dAgRgLw0fn15zBGQLIFsPC9zUwHEGzsNAiLhjII5JEyCKmGMgjPhjIIzkwHEDe1DUscaKy5DEgNSwCTxWgMSQEjQPKyUg==','base64'));
function mock({failWrite=false,badIntegrity=false,commitLost=false,stopAfter=Infinity,early=true,wrongAddress=false,badErase=false,checksumOnce=false}={}){
 let r,written=0,commits=0,retries=0;const commands=[],staging=new Uint8Array(0x5ff000);staging.fill(255);
 const sendPacket=(kind,cmd,data)=>{const b=frame(cmd,data,5,kind);r.recv(b.subarray(0,3));r.recv(b.subarray(3,7));r.recv(b.subarray(7));};
 r=new C.Race(async b=>{const d=new DataView(b.buffer,b.byteOffset,b.byteLength),cmd=d.getUint16(4,true),p=b.subarray(6);commands.push(cmd);let out=bytes(0),note=null;
  if(cmd===0x1c00)out=bytes(0,0,1,0,0,0x51,0,0,0xf0,0x5f,0);
  if(cmd===0x403){const a=new DataView(p.buffer,p.byteOffset,p.byteLength).getUint32(2,true);out=concat(bytes(0,p[0],0,0),u32(a),p[0]===0?page:staging.subarray(a-0x510000,a-0x510000+256));}
  if(cmd===0x1c08)note=bytes(0);
  if(cmd===0x404){assert.deepEqual(p,concat(bytes(1),u32(0x5ff000),u32(0x510000)));note=concat(bytes(badErase?1:0,1),u32(0x5ff000),u32(0x510000));}
  if(cmd===0x402){if(failWrite){r.fail(Error('Connection lost during write'));return;}if(checksumOnce&&retries++===0){sendPacket(0x5b,cmd,bytes(0x0a,1,0));return;}
   assert.equal(p[0],1);const addrs=[];for(let j=0;j<p[1];j++){const at=2+j*261,addr=new DataView(p.buffer,p.byteOffset,p.byteLength).getUint32(at+1,true),data=p.subarray(at+5,at+261);assert.equal(C.crc(data),p[at]);assert.equal(addr,0x510000+written);staging.set(data,addr-0x510000);written+=256;addrs.push(u32(addr+(wrongAddress?256:0)));}out=concat(bytes(0,1,p[1]),...addrs);}
  if(cmd===0x1c01){assert.deepEqual(p,bytes(1,0,1));assert.deepEqual(staging.subarray(0,image.length),image);note=bytes(badIntegrity?1:0,1,0,1);}
  if(cmd===0x1c02){commits++;if(commitLost){r.fail(Error('Reboot/disconnect'));return;}}
  if(note&&early)sendPacket(0x5d,cmd,note);sendPacket(0x5b,cmd,out);if(note&&!early)sendPacket(0x5d,cmd,note);
 });return {r,commands,get written(){return written;},get commits(){return commits;},cancelled:()=>written>=stopAfter};
}
(async()=>{
 const f=await C.validate(image);assert.equal(f.hash,Object.keys(C.IMAGES)[0]);
 const bad=image.slice();bad[5000]^=1;await assert.rejects(()=>C.validate(bad),/Unknown firmware/);
 assert.equal(C.crc(new Uint8Array(256)),0);assert.equal(C.crc(Uint8Array.from({length:256},(_,i)=>i)),0xa9);
 const parser=new C.Race(async()=>{}),a=parser.take(0x5d,0x1234),b=parser.take(0x5b,0x4321);parser.recv(concat(frame(0x1234,bytes(9),5,0x5d),frame(0x4321,bytes(8),5,0x5b)));assert.deepEqual(await a,bytes(9));assert.deepEqual(await b,bytes(8));
 const broken=new C.Race(async()=>{});broken.recv(bytes(0,0,0,0,0,0));assert(broken.dead);
 const timeout=new C.Race(async()=>{});await assert.rejects(()=>timeout.take(0x5b,9,5),/Timed out/);assert(timeout.dead);
 for(const early of [true,false]){const m=mock({early,checksumOnce:early});let last=0;await m.r.flash(f,{progress:(done,total)=>{assert(done>=last&&done<=total);last=done;}});assert.equal(last,image.length);assert.equal(m.commits,1);assert.equal(m.written,Math.ceil(image.length/256)*256);}
 for(const [options,pattern] of [[{failWrite:true},/Connection lost/],[{badIntegrity:true},/integrity check failed/],[{wrongAddress:true},/address mismatch/],[{badErase:true},/Erase completion/],[{stopAfter:768},/Stopped before commit/]]){const m=mock(options);await assert.rejects(()=>m.r.flash(f,{cancelled:m.cancelled}),pattern);assert.equal(m.commits,0);}
 const lost=mock({commitLost:true});await assert.rejects(()=>lost.r.flash(f),/result is unknown/);assert.equal(lost.commits,1);
 const stopped=new C.Race(async()=>{});stopped.recv(frame(0x1c03,bytes(1),5,0x5a));assert.match(stopped.dead.message,/FOTA STOP/);
 console.log('PASS: package validation; CRC; fragmented/coalesced frames; notification ordering; full 4 MB transfers; checksum retry; cancellation; write/erase/integrity failures; lost commit; device STOP. No hardware touched.');
})().catch(e=>{console.error(e);process.exitCode=1;});
