import {QueryClient, skipToken} from '@tanstack/react-query';
import {ROUTES} from '../src/lib/api-routes';
import {course,overview,year} from './records';
export {ApiClientError, TS_ABORTED, recordTimestamp, timestampOf} from '../src/lib/api';

// Read-only transport: even a child component that queries eagerly cannot contact a live service.
export const queryClient=new QueryClient({defaultOptions:{queries:{enabled:false,staleTime:Infinity,retry:false,refetchOnWindowFocus:false}}});
const payloads:Record<string,unknown>={getOverview:overview,getIntegrations:{flags:{googleForms:true,cloudflareChat:true}},getSignupOptions:{departments:[course],academicYears:[year]},listDepartments:{data:[course]},getCalendarStatus:{available:false},getUserDirectoryReport:{rows:[],matchedCount:0,truncated:false}};
export const api=Object.fromEntries(Object.entries(ROUTES).map(([role,table])=>[role,Object.fromEntries(Object.keys(table).map(proc=>{
  const value=payloads[proc]??{data:[]};
  const queryKey=(input?:unknown)=>[role,proc,input===skipToken?'skip':input];
  return [proc,{queryKey,queryOptions:(opts:{input?:unknown}={})=>({...opts,queryKey:queryKey(opts.input),initialData:opts.input===skipToken?undefined:value,enabled:false,queryFn:async()=>value}),call:async()=>value,mutationOptions:()=>({mutationFn:async()=>{throw new Error('Film records are read-only');}})}];
}))]));
