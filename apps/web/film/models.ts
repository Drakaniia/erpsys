import {useScene, accounts} from './session';
import {ago, course, detail, entries, overview, people, record, register, year} from './records';
import {chipFor} from '../src/lib/student/steps';

// These are film-only page-model snapshots. All visible UI is rendered by the app pages.
const noop = () => {};
const idle = {isPending:false, isFetching:false, isError:false, refetch:noop};
const notices = {...idle,data:{data:[],total:0}};
const stamp = {stampName:'Lia Cruz',verifiedByName:'Lia Cruz',verifiedAt:ago(0),stampGraphicUrl:null,stampSignatureUrl:null};
export const EVIDENCE_CONFIG = {};
export function useStudentState() {
  const {frame}=useScene();
  const data=record(frame>=111?'submitted':'draft');
  const openStepRow=frame>=42?data.steps[2]:null;
  return {data,activeTab:'progress',notificationsQuery:notices,stepsQuery:idle,verifiedCount:4,progressPercent:400/6,pillScale:1,openStepRow,openCode:openStepRow?.code,sheetChip:openStepRow?chipFor(openStepRow):null,closeSheet:noop,toast:noop};
}
export function useOfficerState() {
  const {frame}=useScene();
  const verified=frame>=139;
  return {activeTab:'profiling',stepMeta:{label:'Profiling'},activeStep:'PROFILING',yearLabel:'AY 2026–2027 · 1st Semester',counts:{PROFILING:verified?3:4},bellQuery:notices,detailId:frame>=42?'review-0':null,selectedId:'review-0',listData:register(verified),listQuery:idle,view:'table',sortField:'submittedAt',sortDir:'desc',pageNum:1,pageSize:50,unreadIds:new Set(frame<42?['review-0']:[]),searchQ:'',statusFilter:'ALL',evidenceFilter:'ALL',rangeFilter:'ALL',setGuideOpen:noop,openGuide:noop,setDetailId:noop,handleMarkRead:noop,clearNew:noop};
}
export function useDetailSheetState() {
  const {frame}=useScene(); const verified=frame>=139;
  return {data:detail,student:detail.student,step:detail.step,detailQuery:idle,stampQuery:{...idle,data:{}},status:verified?'VERIFIED':'SUBMITTED',isVerified:verified,canStamp:!verified,stampOpen:frame>=85 && !verified,revokeOpen:false,replyOpen:false,lightboxIndex:-1,effectiveStamp:verified?stamp:null,sendBackLabel:'Send back',dialogStampName:stamp.stampName,dateLabel:'Aug 17, 2026',verifyMutation:idle,replyMutation:idle,captureMutation:idle,revokeMutation:idle,presence:{editors:[],error:false},resetLocal:noop};
}
export function useQueueModel() {
  const data=record('cleared'); return {sessionReady:true,data,readyForQueue:true,isQueued:true,positionShown:1,queue:{status:'WAITING',deptOpen:true,servesMyLevel:true,departmentName:course.name,servedByName:accounts.instructor.name},myDept:{departmentName:course.name},gateShowing:false};
}
export const IDLE_PROMPT_MS=600000;
export function useInstructorState() {
  const {frame}=useScene(); const serving=frame>=45; const enrolled=frame>=141;
  const servingEntry=serving&&!enrolled?{...entries[0],servedById:accounts.instructor.id}:null;
  const waiting=entries.slice(serving?1:0); const department={...course,entries:waiting,waitingCount:waiting.length,servingEntry};
  const completed=[{enrollmentId:'enrolled-mara',studentName:people[0]!.name,studentNumber:people[0]!.studentNumber,completedAt:ago(0),servedByName:accounts.instructor.name,yearLevel:'FIRST'}];
  return {activeView:enrolled?'enrolled':'queue',activeDeptId:course.id,notificationItems:[],incomingTransferRequests:[],transferNotices:[],enrolledRange:'today',enrolledQ:'',
    queue:{hasActiveYear:true,yearLabel:'2026–2027 · 1st Semester',yearBare:year.label,semesterLabel:year.semesterLabel,departments:[department],activeDept:department,servingEntry,spotlight:waiting[0],canServeFirst:!serving,selectedId:!serving?'entry-0':null,autoClosedDepts:[],availabilityMutation:idle,beginServingMutation:idle,removeMutation:idle,showValidateDialog:frame>=91&&!enrolled,openGuide:noop,setGuideOpen:noop,noteActivity:noop,lastInteractionAt:{current:Infinity}},
    enrolled:{enrolledQuery:{...idle,data:{data:completed,total:1}},selectedIds:new Set(),enrollMutation:idle,revertMutation:idle,bulkRevertMutation:idle,revertEntry:null},respondTransferMutation:idle};
}
export const ADMIN_SHORTCUTS=[];
export function useAdminConsole() {
  const {frame}=useScene(); const reports=frame>=114;
  return {sessionQuery:{...idle,data:{user:accounts.admin}},activeTab:reports?'reports':'overview',tabTitle:reports?'Reports':'Overview',overviewQuery:{...idle,data:overview},hasActiveYear:true,yearLabel:'AY 2026–2027 · 1st Semester',selectTab:noop};
}
