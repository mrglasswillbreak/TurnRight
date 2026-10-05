"""Native PostgreSQL/PostGIS acceptance checks, only in the disposable GIS test database."""
import json
import os
import pathlib
import time
import uuid
import psycopg

url=os.environ['GIS_TEST_DATABASE_URL']
with psycopg.connect(url,autocommit=True) as db:
    if db.execute('select current_database()').fetchone()[0]!='turnright_gis_test':
        raise RuntimeError('Use a fresh disposable database named turnright_gis_test')
    if db.execute("select to_regclass('public.source_features')").fetchone()[0]:
        raise RuntimeError('The test database must be empty; create a fresh container')
    # The PostGIS image initially installs its extensions in public. Supabase uses extensions.
    for extension in ['postgis_tiger_geocoder','postgis_topology','postgis_raster','postgis']:
        db.execute('drop extension if exists '+extension)
    for role in ['anon','authenticated','service_role']:
        if not db.execute('select 1 from pg_roles where rolname=%s',(role,)).fetchone():db.execute('create role '+role)
    db.execute('create schema extensions;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[])')
    for file in sorted((pathlib.Path(__file__).parents[2]/'supabase'/'migrations').glob('*.sql')):
        db.execute(file.read_text(encoding='utf8'))
    print('Applied all migrations to',db.execute('select extensions.postgis_full_version()').fetchone()[0])
    owner,editor,reviewer,publisher=[str(uuid.uuid4()) for _ in range(4)]
    for actor in [owner,editor,reviewer,publisher]:db.execute('insert into auth.users values(%s)',(actor,))
    db.execute('insert into admin_users(id) values(%s)',(owner,))
    for actor,role in [(editor,'editor'),(reviewer,'reviewer'),(publisher,'publisher')]:db.execute("insert into campus_memberships values('lasu',%s,array[%s])",(actor,role))
    schema=json.dumps({'version':1,'fields':[{'name':'height','type':'number'}]})
    db.execute("insert into gis_datasets(campus_id,id,name,schema) values('lasu','native-scale','Native scale',%s)",(schema,))
    started=time.monotonic()
    db.execute("insert into gis_feature_index(campus_id,dataset_id,feature_key,geometry,properties) select 'lasu','native-scale','overlay:scale:'||lpad(i::text,6,'0'),extensions.ST_SetSRID(extensions.ST_MakePoint(3.2+(i%1000)*0.00001,6.46+(i/1000)*0.00001),4326),jsonb_build_object('height',i%50) from generate_series(1,100000) i")
    db.execute('analyze gis_feature_index')
    query=json.dumps({'datasetId':'native-scale','revision':1,'limit':100,'bbox':[3.201,6.4601,3.202,6.4603]})
    page=db.execute('select gis_query(%s,%s)',(editor,query)).fetchone()[0]
    assert len(page['features'])==100 and page['nextCursor'] and page['total']<100000
    assert len(json.dumps(page))<100000
    print('100,000 features: bounded spatial query passed in',round(time.monotonic()-started,2),'seconds including insertion')
    job={'operationId':str(uuid.uuid4()),'tool':'buffer','name':'Native buffer','input':{'datasetId':'native-scale','revision':1},'parameters':{'distance':10}}
    result=db.execute('select gis_start_job(%s,%s)',(editor,json.dumps(job))).fetchone()[0]
    assert result['status']=='queued' and 'inputs' not in result
    claim=db.execute('select gis_claim_job(%s)',(job['operationId'],)).fetchone()[0]
    assert len(claim['inputs']['input']['features'])==100000
    db.execute('select gis_cancel_job(%s,%s)',(editor,job['operationId']))
    assert db.execute('select gis_finish_job(%s,%s,%s)',(job['operationId'],claim['run_token'],'{}')).fetchone()[0] is False
    review=str(uuid.uuid4());db.execute('select gis_submit_review(%s,%s,%s)',(editor,review,'Native review of campus dataset'))
    db.execute('select gis_decide_review(%s,%s,true,%s,false)',(reviewer,review,'Independent native database verification'))
    release=db.execute('select gis_prepare_release(%s,%s,%s,%s)',(publisher,review,'catalogue','Native release')).fetchone()[0]
    lease=db.execute('select gis_begin_publication(%s)',(release,)).fetchone()[0]
    try:
        db.execute("update gis_datasets set revision=revision+1 where id='native-scale'")
        raise AssertionError('Publication lease allowed a concurrent edit')
    except psycopg.Error as error:
        assert error.sqlstate=='PT409'
    db.execute('select gis_end_publication(%s,%s)',(release,lease))
    db.execute("update gis_datasets set revision=revision+1 where id='native-scale'")
    try:
        db.execute('select gis_assert_release_approval(%s)',(release,))
        raise AssertionError('Stale approval accepted')
    except psycopg.Error as error: assert error.sqlstate=='PT409'
    print('Native processing snapshot, cancellation, independent approval and publication lock passed')
