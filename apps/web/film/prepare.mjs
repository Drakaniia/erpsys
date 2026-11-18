// An original score: six plucked notes, a soft pad and a low pulse, resolved on the final seal.
import {mkdir, writeFile, copyFile} from 'node:fs/promises';
const dir = new URL('./public/',import.meta.url);
await mkdir(dir,{recursive:true});
await copyFile(new URL('../public/images/cot-sbo-logo.webp',import.meta.url), new URL('seal.webp',dir));
const rate=32000, length=42, size=rate*length, left=new Float32Array(size), right=new Float32Array(size);
const tau=Math.PI*2, hz=m=>440*2**((m-69)/12);
function note(at,duration,pitch,level,kind,pan=.5){
  const w=tau*hz(pitch),start=Math.floor(at*rate),end=Math.min(size,start+Math.floor(duration*rate));
  for(let i=start;i<end;i++){const t=(i-start)/rate;
    const envelope=kind==='pad'?Math.min(1,t/.48,(duration-t)/.7):Math.min(1,t/.009)*Math.exp(-t*(kind==='bass'?3.8:4.4));
    const tone=kind==='pad'?(Math.sin(w*t)+.45*Math.sin(w*t*1.002)+.16*Math.sin(w*t*2))*.66:Math.sin(w*t)+.27*Math.sin(2*w*t)*Math.exp(-6*t)+.09*Math.sin(3*w*t);
    const s=tone*envelope*level; left[i]+=s*Math.sqrt(1-pan); right[i]+=s*Math.sqrt(pan);
  }
}
const chords=[[50,57,61,64],[47,54,57,62],[43,50,54,59],[45,52,57,61]];
for(let bar=0;bar<20;bar++){const t=bar*2,chord=chords[bar%4];
  chord.forEach((n,i)=>note(t,2.6,n,.042,'pad',.2+i*.18));
  if(bar>0){note(t,.9,chord[0]-12,.15,'bass'); note(t+1.25,.5,chord[0]-12,.066,'bass');}
  [0,.75,1,1.625].forEach((offset,i)=>{if((bar+i)%5===0)return; const n=chord[[1,3,2,1][i]]+12;note(t+offset,.9,n,.094,'pluck',i%2?.67:.36);note(t+offset+.19,.6,n,.022,'pluck',i%2?.2:.8);});
}
[50,57,62,66,69].forEach((n,i)=>note(39.6+i*.09,2,n,.12,'pad',.22+i*.14));
const b=Buffer.alloc(44+size*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size*4,40);
for(let i=0;i<size;i++){const g=Math.min(1,i/(rate*.25),(size-i)/(rate*1.4)); b.writeInt16LE(Math.round(32000*Math.tanh(left[i]*1.5)*g),44+4*i);b.writeInt16LE(Math.round(32000*Math.tanh(right[i]*1.5)*g),46+4*i);}
await writeFile(new URL('record-score.wav',dir),b);
