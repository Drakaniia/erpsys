import {AbsoluteFill, Audio, Easing, Img, Interactive, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Application} from './Application';
import {type Surface} from './session';
import './film.css';

const ink='#071f37', paper='#f7f6f3', gold='#f5a623';
const mono='Consolas, monospace', sans='Segoe UI, Arial, sans-serif', serif='Georgia, Times New Roman, serif';
const ramp=(f:number,a:number,b:number)=>interpolate(f,[a,b],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.bezier(.24,.75,.18,1)});
function Colophon({dark=false,label='COT–SBO  /  ENROLLMENT SYSTEMS'}:{dark?:boolean;label?:string}) {return <div style={{position:'absolute',left:82,right:82,top:44,display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:mono,fontSize:20,letterSpacing:'0.095em',fontWeight:600,color:dark?paper:ink}}><div style={{display:'flex',alignItems:'center',gap:15}}><i style={{width:13,height:13,background:gold,display:'inline-block'}}/>{label}</div><span>ERPSYS &nbsp; / &nbsp; FIELD NOTES</span></div>}
function SealPress({end=false}:{end?:boolean}){
 const f=useCurrentFrame(), reveal=ramp(f,0,25), scale=end?1:.96+ramp(f,0,88)*.065;
 return <div style={{position:'absolute',width:680,height:680,top:205,left:1105,scale,translate:`${(1-reveal)*64}px 0px`}}>
  <svg width="680" height="680" viewBox="0 0 680 680" style={{position:'absolute',inset:0}}>
   <circle cx="340" cy="340" r="308" fill="none" stroke="#96a8b9" strokeOpacity=".42"/><circle cx="340" cy="340" r="281" fill="none" stroke={gold} strokeWidth="2" strokeDasharray="2 12"/>
   {Array.from({length:72},(_,i)=><path key={i} d={`M340 ${i%6===0?16:23}V33`} stroke={i%6===0?gold:'#7f96ac'} strokeWidth={i%6===0?3:1} transform={`rotate(${i*5+f*.055} 340 340)`}/>)}
   <g transform={`rotate(${-90+f*.22} 340 340)`}><circle cx="340" cy="340" r="308" fill="none" stroke={gold} strokeWidth="4" strokeDasharray={`${300*reveal} 2100`}/></g>
  </svg>
  <Img src={staticFile('seal.webp')} style={{position:'absolute',width:404,height:404,top:138,left:138,filter:'drop-shadow(0 18px 30px #0005)'}}/>
 </div>;
}
function Title({end=false}:{end?:boolean}){
 const f=useCurrentFrame();
 return <AbsoluteFill style={{background:`radial-gradient(ellipse at 81% 49%,#234563,${ink} 63%)`,color:paper,fontFamily:sans,overflow:'hidden'}}>
  <div style={{position:'absolute',inset:0,opacity:.12,backgroundImage:'linear-gradient(#94a9bc 1px,transparent 1px),linear-gradient(90deg,#94a9bc 1px,transparent 1px)',backgroundSize:'96px 96px',maskImage:'linear-gradient(90deg,transparent,#000)'}}/>
  <Colophon dark/><SealPress end={end}/>
  <div style={{position:'absolute',left:83,top:256,width:1110}}>
   <div style={{font:`600 23px ${mono}`,color:gold,letterSpacing:'.12em',marginBottom:36}}>{end?'06 / 06     RECORD COMPLETE':'01 / 06     THE ENROLLMENT RECORD'}</div>
   <div style={{overflow:'hidden'}}><Interactive.Div name="Title line" style={{fontFamily:serif,fontSize:116,letterSpacing:'-0.065em',lineHeight:1.05,translate:`0 ${(1-ramp(f,-4,19))*105}px`}}>{end?'One record.':'Enrollment,'}</Interactive.Div></div>
   <div style={{overflow:'hidden'}}><Interactive.Div name="Title resolution" style={{fontFamily:serif,fontStyle:'italic',fontSize:116,letterSpacing:'-0.065em',lineHeight:1.15,translate:`0 ${(1-ramp(f,1,25))*132}px`,color:'#f8cc7c'}}>{end?'Every handoff.':'on the record.'}</Interactive.Div></div>
   <div style={{marginTop:37,fontSize:33,lineHeight:1.35,maxWidth:880,opacity:ramp(f,10,30)}}>{end?'ERPSYS · Enrollment Requirements Processing System':'Follow one student from her last clearance requirement to a place on the enrolled roster.'}</div>
  </div>
  <div style={{position:'absolute',bottom:103,left:85,right:85,height:1,background:'#ffffff45'}}/><div style={{position:'absolute',bottom:53,left:85,right:85,display:'flex',justifyContent:'space-between',font:`20px ${mono}`,letterSpacing:'.08em',color:'#ced9e2'}}><span>COLLEGE OF TECHNOLOGIES</span><span>{end?'BUKIDNON STATE UNIVERSITY':'A CAMPUS OPERATIONS BRIEF'}</span></div>
 </AbsoluteFill>;
}
const shots = {
 student:{n:'01',role:'STUDENT',title:'One step left.',body:'Mara has four clearances. She opens Profiling and sends her form response for review.',loc:'/student',mark:'04 / 05'},
 officer:{n:'02',role:'SBO OFFICER',title:'Put a name to the stamp.',body:'The officer reads Mara’s answers, previews her stamp, and verifies the submission.',loc:'/officer',mark:'05 / 05'},
 queue:{n:'03',role:'FACULTY QUEUE',title:'First in line.',body:'With five steps cleared, Mara joins her department’s queue at the faculty.',loc:'/queue',mark:'NO. 001'},
 instructor:{n:'04',role:'ENROLLMENT ADVISER',title:'Make it official.',body:'The adviser calls Mara forward, checks all five stamps, and confirms her enrollment in person.',loc:'/instructor',mark:'06 / 06'},
 admin:{n:'05',role:'ADMINISTRATION',title:'See where work waits.',body:'Leadership can see the busiest clearance step and open a completion report for the term.',loc:'/admin',mark:'AY 26–27'},
} as const;
function Shot({surface}:{surface:Surface}){
 const f=useCurrentFrame(),s=shots[surface],enter=ramp(f,0,12),dark=surface==='queue';
 const bg=dark?ink:paper,fg=dark?paper:ink;
 const zoom=surface==='student'?1.13:surface==='queue'?1.5:1.15;
 return <AbsoluteFill style={{background:bg,color:fg,fontFamily:sans,overflow:'hidden'}}>
  <Colophon dark={dark} label="COT–SBO  /  THE ENROLLMENT RECORD"/>
  <div style={{position:'absolute',top:112,left:82,right:82,height:1,background:dark?'#ffffff48':'#19395740'}}/>
  <div style={{position:'absolute',left:82,width:390,top:230,translate:`${(1-enter)*-22}px 0px`,opacity:.5+.5*enter}}>
   <div style={{font:`bold 20px ${mono}`,letterSpacing:'.06em',color:dark?'#f4c573':'#6f4a09',marginBottom:32}}>{s.n} &nbsp; / &nbsp; {s.role}</div>
   <Interactive.Div name="Chapter headline" style={{fontFamily:serif,fontSize:86,lineHeight:.985,letterSpacing:'-.065em'}}>{s.title}</Interactive.Div>
   <div style={{height:4,width:59,background:gold,margin:'35px 0 26px'}}/><div style={{fontSize:29,lineHeight:1.4,maxWidth:377,color:dark?'#d1dde5':'#425467'}}>{s.body}</div>
  </div>
  <div style={{position:'absolute',right:78,top:160,width:1320,height:796,borderRadius:18,overflow:'hidden',background:paper,boxShadow:dark?'0 16px 50px #0005':'0 18px 55px #10293823, 0 0 0 1px #132d451a',transform:`perspective(3200px) rotateY(${(1-enter)*1.5}deg) translateY(${(1-enter)*16}px)`}}>
   <div style={{height:48,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',background:ink,color:paper,font:`16px ${mono}`,letterSpacing:'.08em'}}><span>ERPSYS &nbsp; : &nbsp; {s.loc}</span><span style={{color:'#c5d2dc'}}>DEMONSTRATION RECORD &nbsp; / &nbsp; {s.mark}</span></div>
   <div style={{height:748,width:1320,position:'relative',overflow:'hidden'}}><div style={{width:1320/zoom,height:748/zoom,transform:`scale(${zoom})`,transformOrigin:'0 0'}}><Application surface={surface} frame={f}/></div></div>
  </div>
  <div style={{position:'absolute',bottom:48,left:82,right:82,display:'flex',alignItems:'center',gap:30,font:`19px ${mono}`,letterSpacing:'.09em',color:fg}}><span>RECORD &nbsp; 2601041</span><div style={{flex:1,height:2,background:dark?'#ffffff40':'#183a5a25',position:'relative'}}><div style={{height:2,width:`${(Number(s.n)-1+ramp(f,0,133))/5*100}%`,background:dark?gold:ink}}/></div><span>{s.n} / 05</span></div>
 </AbsoluteFill>;
}
function Turn(){const f=useCurrentFrame();return <AbsoluteFill style={{pointerEvents:'none',background:gold,transform:`translateX(${interpolate(f,[0,7,14],[-101,0,101])}%)`,clipPath:'polygon(2% 0,100% 0,98% 100%,0 100%)'}}/>}
export function Film(){return <AbsoluteFill style={{background:ink}}>
 <Audio src={staticFile('record-score.wav')}/>
 <Sequence name="Prologue · The enrollment record" durationInFrames={96}><Title/></Sequence>
 <Sequence name="Student · Submit profiling" from={96} durationInFrames={168}><Shot surface="student"/></Sequence>
 <Sequence name="Officer · Review and stamp" from={264} durationInFrames={168}><Shot surface="officer"/></Sequence>
 <Sequence name="Student · Called to the faculty" from={432} durationInFrames={72}><Shot surface="queue"/></Sequence>
 <Sequence name="Adviser · Serve and enroll" from={504} durationInFrames={192}><Shot surface="instructor"/></Sequence>
 <Sequence name="Administration · Overview to report" from={696} durationInFrames={192}><Shot surface="admin"/></Sequence>
 <Sequence name="End card · One record" from={888} durationInFrames={120}><Title end/></Sequence>
 {[96,432,504,888].map(cut=><Sequence key={cut} from={cut-7} durationInFrames={15} name="Folio turn"><Turn/></Sequence>)}
 </AbsoluteFill>;}
