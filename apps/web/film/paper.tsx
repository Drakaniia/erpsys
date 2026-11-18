import {useEffect, useState} from 'react';
import {Composition, registerRoot, delayRender, continueRender} from 'remotion';
import {MemoryRouter} from 'react-router';
import {QueryClientProvider} from '@tanstack/react-query';
import Header from '../src/components/Header';
import {LoginPage} from '../src/app/pages';
import {StudentPage} from '../src/app/student-page';
import {OfficerPage} from '../src/app/officer-page';
import {InstructorPage} from '../src/app/instructor-page';
import {QueuePage} from '../src/app/queue-page';
import {AdminPage} from '../src/app/admin-page';
import {SceneData, type Surface} from './session';
import {queryClient} from './api';
import {StaticChartPreviewProvider} from '../src/components/charts/static-chart-preview-context';
import './film.css';

const pages = {student:StudentPage,officer:OfficerPage,instructor:InstructorPage,queue:QueuePage,admin:AdminPage};
const shots = [
  {id:'2-7-sign-in',surface:'student',frame:0,login:true},
  {id:'2-8-student-progress',surface:'student',frame:0},
  {id:'2-9-student-profiling',surface:'student',frame:112},
  {id:'2-10-officer-submissions',surface:'officer',frame:0},
  {id:'2-11-officer-review',surface:'officer',frame:60},
  {id:'2-12-student-queue',surface:'queue',frame:0},
  {id:'2-13-adviser-queue',surface:'instructor',frame:60},
  {id:'2-14-enrolled-roster',surface:'instructor',frame:150},
  {id:'2-15-admin-overview',surface:'admin',frame:0},
  {id:'2-16-officer-overview',surface:'officer',frame:200},
  {id:'2-17-admin-activity',surface:'admin',frame:0,scroll:650},
  {id:'2-18-officer-activity',surface:'officer',frame:200,scroll:650},
] satisfies Array<{id:string;surface:Surface;frame:number;login?:boolean;scroll?:number}>;

function PaperPage({surface,frame,login=false,scroll=0}:{surface:Surface;frame:number;login?:boolean;scroll?:number}) {
  const [handle]=useState(()=>delayRender('Wait for fonts, layout and chart reveal animations'));
  useEffect(()=>{
    let cancelled=false;
    const scrollTimer=setTimeout(()=>{
      const main=document.querySelector('main');
      if(main)main.scrollTop=scroll;
    },1500);
    const timer=setTimeout(async()=>{
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(image=>image.decode().catch(()=>{})));
      if(!cancelled)continueRender(handle);
    },6000);
    return ()=>{cancelled=true;clearTimeout(scrollTimer);clearTimeout(timer);};
  },[handle,scroll]);
  const Page=pages[surface];
  return <div className="film-app bg-surface text-ink" style={{width:'100%',height:'100%',fontFamily:'var(--font-sans)',fontSize:16,lineHeight:1.5}}>
    <SceneData.Provider value={{surface,frame}}>
      <QueryClientProvider client={queryClient}><StaticChartPreviewProvider>
        <MemoryRouter initialEntries={[login?'/login':`/${surface}`]}>
          {login?<LoginPage/>:<div className="relative grid h-full grid-rows-[auto_1fr]"><Header/><div className="min-h-0 overflow-hidden"><Page/></div></div>}
        </MemoryRouter>
      </StaticChartPreviewProvider></QueryClientProvider>
    </SceneData.Provider>
  </div>;
}

registerRoot(() => <>{shots.map(shot=><Composition key={shot.id} id={shot.id} component={PaperPage} defaultProps={shot} width={1440} height={900} fps={24} durationInFrames={1}/>)}</>);
