"""Exercise a larger-than-production candidate against a 512 MiB PostgreSQL service."""
import json
import os
from pathlib import Path
import sys
import threading
import time
import uuid
import subprocess
import tempfile
import psycopg
from psycopg.types.json import Jsonb
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

url = os.environ['GIS_TEST_DATABASE_URL']
with psycopg.connect(url, autocommit=True) as db:
    assert db.execute('select current_database()').fetchone()[0] == 'turnright_import_test'
    assert db.execute("select to_regclass('public.source_features')").fetchone()[0] is None
    for extension in ['postgis_tiger_geocoder', 'postgis_topology', 'postgis_raster', 'postgis']:
        db.execute('drop extension if exists ' + extension)
    db.execute('create role anon;create role authenticated;create role service_role;create schema extensions;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[])')
    for file in sorted((Path(__file__).resolve().parents[2] / 'supabase' / 'migrations').glob('*.sql')):
        db.execute(file.read_text(encoding='utf8'))
    boot = db.execute('select pg_postmaster_start_time()').fetchone()[0]
    source, job, token = [str(uuid.uuid4()) for _ in range(3)]
    db.execute("insert into campus_sources(id,name,kind) values(%s,'Scale test','file')", (source,))
    db.execute("insert into campus_imports(id,source_id,status,phase,run_token,summary,configuration) values(%s,%s,'preview','preview',%s,'{\"errors\":[]}','{}')", (job, source, token))
    # Incompressible private attributes represent real import geometry/metadata.
    db.execute("insert into source_features(id,source,entity,payload,hash) select 'feature:scale:'||lpad(i::text,6,'0'),%s,'feature',jsonb_build_object('data',(select string_agg(md5(i::text||':'||j::text),'') from generate_series(1,90) j)),md5(i::text) from generate_series(1,10574) i", ('import:' + source,))
    db.execute("update source_features set payload=jsonb_build_object('data',%s::text) where id='feature:scale:000001'", (os.urandom(83500).hex(),))
    baseline = [r[0] for r in db.execute('select to_jsonb(s) from source_features s order by id')]
    observations = [{'provider':'file','collection':'scale','nativeId':r['id'],'stable':True,'featureType':'building','content':{'revision':2,'id':r['id']},'records':[{**r,'hash':'new-'+r['hash']}]} for r in baseline[:3647]]
    candidate = {'runId':job,'token':token,'importId':job,'sourceKey':'import:'+source,'observations':observations,'receipt':{'retrievedAt':'2026-10-13T00:00:00Z','contentHash':'scale-fixture','configurationHash':'scale-config','collections':[{'identity':'scale','complete':True,'count':3647}]}}
    db.execute("insert into source_check_policy values ('lasu',%s,true)",('import:'+source,))
    size = len(json.dumps(candidate).encode())
    assert size + len(json.dumps(baseline).encode()) > 31454509
    latencies, failures, requests = [], [], []
    stopped = threading.Event()
    def monitor():
        try:
            with psycopg.connect(url, autocommit=True) as connection:
                connection.execute("set statement_timeout='2s'")
                while not stopped.is_set():
                    start = time.monotonic()
                    connection.execute('select count(*) from auth.users').fetchone()
                    latencies.append(time.monotonic() - start)
                    stopped.wait(0.05)
        except Exception as error:
            failures.append(str(error))
    thread = threading.Thread(target=monitor); thread.start()
    def rpc(path, method, body):
        name = path.removeprefix('rpc/')
        assert name in ('source_check_begin','source_check_baseline','source_check_stage','source_check_evidence','source_check_finish','source_check_interrupted')
        requests.append(len(json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()))
        values = [Jsonb(value) if isinstance(value, (list,dict)) else value for value in body.values()]
        return db.execute('select ' + name + '(' + ','.join(key + ' => %s' for key in body) + ')', values).fetchone()[0]
    start = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix='turnright-native-check-') as folder:
            fixture=Path(folder)/'candidate.json';fixture.write_text(json.dumps(candidate),encoding='utf8')
            worker=subprocess.Popen(['node',str(Path(__file__).with_name('source-check-database-bridge.mjs')),str(fixture)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf8')
            completed=None
            for line in worker.stdout:
                request=json.loads(line)
                if 'finished' in request: completed=request;continue
                if 'error' in request: raise AssertionError(request['error'])
                try: response={'result':rpc(request['route'],request['method'],request['body'])}
                except Exception as error: response={'error':str(error)}
                worker.stdin.write(json.dumps(response,default=str)+'\n');worker.stdin.flush()
            assert worker.wait(timeout=10)==0
            assert completed['finished']['counts']['group']==3647
            assert completed['retry']['status']=='complete'
    finally:
        stopped.set(); thread.join()
    elapsed = time.monotonic() - start
    assert not failures, failures
    assert latencies and max(latencies) < 2
    assert max(requests) < 394000
    assert elapsed < 120
    assert db.execute('select pg_postmaster_start_time()').fetchone()[0] == boot
    assert db.execute('select count(*) from source_features').fetchone()[0] == 10574
    assert db.execute('select count(*) from source_proposal_groups').fetchone()[0] == 3647
    assert db.execute('select count(*) from source_accepted_observations').fetchone()[0] == 0
    assert db.execute('select status from campus_imports where id=%s', (job,)).fetchone()[0] == 'reviewed'
    print(json.dumps({'candidateBytes': size, 'sources': 10574, 'proposals': 3647, 'requests': len(requests), 'largestRequestBytes': max(requests), 'elapsedSeconds': round(elapsed, 3), 'authTableProbes': len(latencies), 'slowestProbeSeconds': round(max(latencies), 3), 'databaseRestarted': False}))
