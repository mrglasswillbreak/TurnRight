"""Queue opted-in source checks without changing accepted or published data."""
import json
import os
from datetime import datetime, timezone, timedelta
import urllib.request
import uuid
from import_map import db

def check_sources():
    repository=os.environ['GITHUB_REPOSITORY']
    token=os.environ['GITHUB_TOKEN']
    for campus in db('campuses?order=id'):
        os.environ['CAMPUS_ID']=campus['id']
        for source in db('campus_sources?schedule=eq.daily&order=id'):
            if source['kind']=='file': continue
            if source['kind']=='osm' and os.environ.get('OVERPASS_SCHEDULE_ALLOWED')!='true': continue
            if source.get('last_checked_at'):
                checked=datetime.fromisoformat(source['last_checked_at'].replace('Z','+00:00'))
                if checked>datetime.now(timezone.utc)-timedelta(hours=23): continue
            pending=db(f"campus_imports?source_id=eq.{source['id']}&status=in.(queued,running)&limit=1")
            if pending: continue
            identity,run_token=str(uuid.uuid4()),str(uuid.uuid4())
            db('campus_imports','POST',{'id':identity,'campus_id':campus['id'],'source_id':source['id'],'configuration':source['configuration'],'phase':'preview' if source['configuration'].get('layers') else 'inspect','status':'queued','run_token':run_token,'auto_queue':True})
            request=urllib.request.Request(f'https://api.github.com/repos/{repository}/actions/workflows/map-import.yml/dispatches',method='POST',data=json.dumps({'ref':'main','inputs':{'campus_id':campus['id'],'import_id':identity,'run_token':run_token}}).encode(),headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'})
            try:
                with urllib.request.urlopen(request,timeout=30) as response:
                    if response.status!=204: raise ValueError('Could not start import workflow.')
            except Exception:
                db(f'campus_imports?id=eq.{identity}','PATCH',{'status':'failed','message':'Scheduled worker could not start. Retry from Campuses.'})
                raise
            print('Queued source review:',campus['slug'],source['name'])

if __name__=='__main__': check_sources()
