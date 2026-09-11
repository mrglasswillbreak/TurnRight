import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { newSurvey, acceptSample } from '../src/survey-model';
import { loadSurveyLocal, saveSurveyLocal } from '../src/survey-storage';
import { syncSurvey } from '../src/survey-sync';
import { api } from '../src/supabase';
import { openDB } from 'idb';
vi.mock('../src/supabase',()=>({api:vi.fn()}));
const call=vi.mocked(api);
beforeEach(()=>{vi.stubGlobal('navigator',{onLine:true});call.mockReset();call.mockImplementation(async(_a,p)=>{const payload=p as {command:string;revisionId:string};return payload.command==='finalize'?{revisionId:payload.revisionId,status:'complete',headRevision:payload.revisionId}:{};});});
afterEach(()=>vi.unstubAllGlobals());
it('queues offline saves and resumes the identical operation',async()=>{
  const r=newSurvey('owner','source');r.session.state='review';
  vi.stubGlobal('navigator',{onLine:false});await syncSurvey(r,vi.fn());
  const operation=r.session.pendingUpload!.revisionId;expect(call).not.toHaveBeenCalled();
  const recovered=await loadSurveyLocal('owner',r.session.id);expect(recovered?.session.pendingUpload?.revisionId).toBe(operation);
  vi.stubGlobal('navigator',{onLine:true});await syncSurvey(r,vi.fn());
  expect(r.session.remoteRevision).toBe(operation);expect(r.session.pendingUpload).toBeUndefined();
});
it('retries lost finalize responses without generating another recording',async()=>{
  const r=newSurvey('owner','source');r.session.state='review';let lose=true;
  call.mockImplementation(async(_a,p)=>{const payload=p as {command:string;revisionId:string};if(payload.command==='finalize'){if(lose){lose=false;throw new Error('Connection lost');}return {revisionId:payload.revisionId,status:'complete'};}return {};});
  await expect(syncSurvey(r,vi.fn())).rejects.toThrow('Connection lost');const operation=r.session.pendingUpload!.revisionId;
  await syncSurvey(r,vi.fn());expect(r.session.remoteRevision).toBe(operation);
  expect(call.mock.calls.filter(([,p])=>(p as {command:string}).command==='begin').map(([,p])=>(p as {revisionId:string}).revisionId)).toEqual([operation,operation]);
});
it('saves newer local edits as another revision after an old response arrives',async()=>{
  const r=newSurvey('owner','source');r.session.state='review';let change=true;
  call.mockImplementation(async(_a,p)=>{const payload=p as {command:string;revisionId:string};if(payload.command==='finalize'){if(change){r.session.name='Newer local name';change=false;}return {revisionId:payload.revisionId,status:'complete'};}return {};});
  await syncSurvey(r,vi.fn());
  const begins=call.mock.calls.filter(([,p])=>(p as {command:string}).command==='begin');expect(begins).toHaveLength(2);
  expect((begins[1][1] as {metadata:{name:string}}).metadata.name).toBe('Newer local name');
});
it('uses bounded sample chunks',async()=>{
  const r=newSurvey('owner','source');
  for(let i=0;i<501;i++)acceptSample(r,{coordinates:[3.2,6.46],timestamp:100000+i*1000,accuracy:5,speed:null,heading:null},100000+i*1000);
  await syncSurvey(r,vi.fn());
  expect(call.mock.calls.filter(([,p])=>(p as {command:string}).command==='chunk').map(([,p])=>(p as {samples:unknown[]}).samples.length)).toEqual([250,250,1]);
});
it('detects another tab changing local recovery without overwriting it',async()=>{
  const r=newSurvey('owner','source');await saveSurveyLocal(r.session);
  const db=await openDB('turnright-surveys',1);const stored=await db.get('sessions',['owner',r.session.id]);stored.localVersion++;stored.name='Other tab';await db.put('sessions',stored);db.close();
  r.session.name='My conflicting edits';await expect(saveSurveyLocal(r.session)).rejects.toThrow(/another tab/);
  expect((await loadSurveyLocal('owner',r.session.id))?.session.name).toBe('Other tab');
});
