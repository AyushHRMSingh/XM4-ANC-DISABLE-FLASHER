'use strict';
const $=id=>document.getElementById(id),C=XM4;
let chosen=null,port=null,reader=null,writer=null,race=null,verified=false,busy=false,connecting=false,selecting=false,cancel=false,committing=false,wake=null,readTask=null;
const events=[];
function log(message){events.push({time:new Date().toISOString(),message});$('log').textContent=events.map(x=>`${x.time}  ${x.message}`).join('\n');$('log').scrollTop=$('log').scrollHeight;}
function sync(){ $('connect').disabled=busy||connecting||!!port||!navigator.serial;$('disconnect').disabled=busy||connecting||!port;$('flash').disabled=busy||connecting||selecting||!chosen||!verified;$('included').disabled=busy||selecting;$('file').disabled=busy||selecting;$('stop').disabled=!busy||committing||cancel; }
function phase(s){$('phase').textContent=s;log(s);if(s==='Committing update'){committing=true;sync();}}
function failed(e){log('ERROR: '+e.message);$('phase').textContent=e.message;$('hint').textContent='No automatic retry. Save the log, reconnect, and verify the installed firmware before trying again.';}
async function select(data){selecting=true;chosen=null;sync();$('firmware').textContent='Checking package…';try{chosen=await C.validate(data);$('firmware').textContent=chosen.name;$('hash').textContent=`${chosen.image.length.toLocaleString()} bytes · SHA-256 ${chosen.hash}`;log('Validated '+chosen.name+' '+chosen.hash);}catch(e){$('firmware').textContent=e.message;$('hash').textContent='';}finally{selecting=false;sync();}}
$('included').onclick=()=>select(Uint8Array.from(atob(window.XM4_FIRMWARE),x=>x.charCodeAt(0)));
$('file').onchange=async()=>{const f=$('file').files[0];if(f)await select(new Uint8Array(await f.arrayBuffer()));};
async function closePort(){verified=false;const oldReader=reader,oldWriter=writer,oldPort=port;reader=writer=port=null;
 race?.fail(Error('Connection closed.'));race=null;
 if(oldReader){try{await oldReader.cancel();}catch{}try{await readTask;}catch{}try{oldReader.releaseLock();}catch{}}
 if(oldWriter){try{oldWriter.releaseLock();}catch{}}if(oldPort){try{await oldPort.close();}catch{}}
 $('device').textContent='Not connected.';sync();
}
$('disconnect').onclick=()=>closePort();
$('connect').onclick=async()=>{connecting=true;sync();try{
 // requestPort stays directly in the click handler to preserve user activation.
 port=await navigator.serial.requestPort({allowedBluetoothServiceClassIds:[C.UUID],filters:[{bluetoothServiceClassId:C.UUID}]});
 if(String(port.getInfo().bluetoothServiceClassId).toLowerCase()!==C.UUID)throw Error('Wrong Bluetooth service selected.');
 await port.open({baudRate:115200,bufferSize:65536});writer=port.writable.getWriter();reader=port.readable.getReader();
 const localWriter=writer,localReader=reader;
 race=new C.Race(async packet=>{for(let i=0;i<packet.length;i+=512)await localWriter.write(packet.subarray(i,i+512));});const localRace=race;
 readTask=(async()=>{try{while(true){const {value,done}=await localReader.read();if(done)throw Error('Bluetooth connection ended.');localRace.recv(value);}}catch(e){localRace.fail(e);if(race===localRace){verified=false;$('device').textContent='Connection ended. Reconnect to verify.';sync();}}})();
 $('device').textContent='Checking installed firmware…';const installed=await race.preflight();verified=true;$('device').textContent='Connected · '+installed;log('Read-only preflight passed. Installed: '+installed);
 if(chosen&&installed===chosen.name){$('hint').textContent='This firmware is already installed. Reflashing is optional.';}
 }catch(e){failed(e);await closePort();}finally{connecting=false;sync();}};
$('flash').onclick=()=>{if(!chosen||!verified||busy)return;$('accept').checked=false;$('phrase').value='';$('confirm').disabled=true;$('review').textContent=chosen.name+'\nSHA-256 '+chosen.hash;$('warning').showModal();};
function arm(){$('confirm').disabled=!$('accept').checked||$('phrase').value!=='FLASH';}
$('accept').onchange=arm;$('phrase').oninput=arm;$('back').onclick=()=>$('warning').close();
$('confirm').onclick=async()=>{
 if($('confirm').disabled||busy||!chosen||!verified)return;$('warning').close();busy=true;cancel=false;committing=false;sync();const file=chosen,started=performance.now();$('progress').value=0;$('hint').textContent='Keep the page open and both devices powered. Progress counts acknowledged writes.';
 try{try{wake=await navigator.wakeLock?.request('screen');}catch{log('Wake lock unavailable; keep the Mac awake manually.');}
  await race.flash(file,{status:phase,cancelled:()=>cancel,progress:(done,total)=>{const pct=100*done/total,seconds=(performance.now()-started)/1000;$('progress').value=pct;$('meter').textContent=`${pct.toFixed(1)}% · ${done.toLocaleString()} / ${total.toLocaleString()} bytes · ${Math.floor(seconds/60)}m ${Math.floor(seconds%60)}s`;}});
  $('hint').textContent='The commit was acknowledged. Let the headset finish and restart. Then power it on and use Connect headphones to verify the installed firmware fingerprint.';
 }catch(e){failed(e);}finally{await wake?.release().catch(()=>{});wake=null;await closePort();busy=false;committing=false;sync();}
};
$('stop').onclick=()=>{if(committing)return;cancel=true;$('hint').textContent='Stopping after the current command completes. No commit will be sent.';log('Stop requested.');sync();};
$('save').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({app:'XM4 flasher',firmware:chosen?.hash,events},null,2)],{type:'application/json'}));a.href=url;a.download='xm4-flash-log.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='Firmware update in progress.';}});
if(!navigator.serial||!crypto.subtle){$('support').hidden=false;$('support').textContent='Open this folder’s index.html in desktop Google Chrome. This browser does not provide the required Web Serial / cryptography APIs. If file access is restricted, use Open in Chrome.command.';}
sync();
