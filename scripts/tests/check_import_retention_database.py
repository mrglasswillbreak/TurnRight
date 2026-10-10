"""Retention acceptance against the disposable database initialized by the queue test."""
import json
import os
import uuid
import psycopg

url = os.environ['GIS_TEST_DATABASE_URL']
with psycopg.connect(url, autocommit=True) as db:
    assert db.execute('select current_database()').fetchone()[0] == 'turnright_import_test'
    before = db.execute('select (select count(*) from source_features), (select count(*) from map_changes), (select count(*) from map_edits)').fetchone()
    db.execute("create table storage.objects(id uuid primary key, bucket_id text, name text unique, metadata jsonb, created_at timestamptz, updated_at timestamptz)")
    source = str(uuid.uuid4())
    db.execute("insert into campus_sources(id,name,kind) values(%s,'Retention fixture','arcgis')", (source,))

    def job(status='preview', age=10, automatic=True, source_id=source):
        identity = str(uuid.uuid4())
        path = f'lasu/{identity}/snapshot-{uuid.uuid4()}.json'
        db.execute("insert into campus_imports(id,source_id,status,phase,run_token,configuration,auto_queue,snapshot_path,summary,created_at,updated_at) values(%s,%s,%s,'preview',%s,'{}',%s,%s,'{\"errors\":[],\"counts\":{\"modified\":12}}',now()-%s*interval '1 day',now()-%s*interval '1 day')", (identity, source_id, status, str(uuid.uuid4()), automatic, path, age, age))
        db.execute("insert into storage.objects values(%s,'campus-imports',%s,'{\"size\":100}',now()-%s*interval '1 day',now()-%s*interval '1 day')", (str(uuid.uuid4()), path, age, age))
        return identity, path

    newest = job('reviewed', 2)
    previous = job('reviewed', 3)
    accepted = job('reviewed', 15)
    db.execute('update campus_sources set accepted_import_id=%s where id=%s', (accepted[0], source))
    expired = job()
    old_review = job('reviewed')
    old_cancel = job('cancelled')
    old_failed = job('failed')
    protected = [newest, previous, accepted, job(automatic=False), job(age=0), job('failed', 2), job('draft')]
    file_source = str(uuid.uuid4())
    db.execute("insert into campus_sources(id,name,kind) values(%s,'Uploaded fixture','file')", (file_source,))
    protected.append(job('cancelled', source_id=file_source))
    upload = job('cancelled')
    protected.append(upload)
    db.execute("insert into campus_import_assets(id,import_id,path,name,bytes,sha256) values(%s,%s,%s,'original.geojson',100,%s)", (str(uuid.uuid4()), upload[0], upload[1], 'a'*64))
    shared = job()
    protected.append(shared)
    holder = job(automatic=False)
    db.execute('update campus_imports set candidate_path=%s where id=%s', (shared[1], holder[0]))
    recent_file = job()
    protected.append(recent_file)
    db.execute('update storage.objects set updated_at=now() where name=%s', (recent_file[1],))
    # An old source configuration can still reference a generated file.
    configured = job()
    protected.append(configured)
    db.execute("update campus_sources set configuration=jsonb_build_object('retainedPath',%s::text) where id=%s", (configured[1], file_source))
    for name in ['baseline.json', 'detail-preparation.json', str(uuid.uuid4())+'.geojson']:
        db.execute("insert into storage.objects values(%s,'campus-imports',%s,'{\"size\":300}',now()-interval '30 days',now()-interval '30 days')", (str(uuid.uuid4()), f'lasu/{expired[0]}/{name}'))

    def plan():
        return {str(row[0]) for row in db.execute('select import_id from plan_import_artifact_cleanup()')}

    eligible = {pair[0] for pair in [expired, old_review, old_cancel, old_failed]}
    assert plan() == eligible
    assert all(identity not in plan() for identity, _ in protected)
    # An active worker on the source defers the whole source.
    active = job('queued', 0)
    assert not plan()
    db.execute("update campus_imports set status='failed' where id=%s", (active[0],))
    assert plan() == eligible
    # Planning in another campus cannot see or claim LASU's files.
    db.execute("select set_config('request.headers','{\"x-turnright-campus\":\"other-campus\"}',false)")
    assert not plan()
    assert not db.execute('select * from claim_import_artifact_cleanup(%s)', (expired[0],)).fetchall()
    db.execute("select set_config('request.headers','{}',false)")
    for role in ['anon', 'authenticated']:
        assert not db.execute("select has_function_privilege(%s,'claim_import_artifact_cleanup(uuid)','execute')", (role,)).fetchone()[0]
        assert not db.execute("select has_table_privilege(%s,'campus_import_artifact_cleanup','select')", (role,)).fetchone()[0]
    assert db.execute("select has_function_privilege('service_role','plan_import_artifact_cleanup()','execute')").fetchone()[0]

    # A retry that wins the row lock keeps its files. Cleanup skips the source.
    with psycopg.connect(url) as retry:
        retry.execute("update campus_imports set status='queued' where id=%s", (expired[0],))
        try:
            db.execute('select * from claim_import_artifact_cleanup(%s)', (expired[0],))
            raise AssertionError('Cleanup ignored the retry lock')
        except psycopg.errors.LockNotAvailable:
            pass
        retry.commit()
    assert not db.execute('select * from claim_import_artifact_cleanup(%s)', (expired[0],)).fetchall()
    db.execute("update campus_imports set status='preview' where id=%s", (expired[0],))

    claimed = db.execute('select * from claim_import_artifact_cleanup(%s)', (expired[0],)).fetchall()
    assert len(claimed) == 1 and claimed[0][0] == expired[1]
    row = db.execute('select status,snapshot_path,candidate_path,artifacts_expired_at,summary from campus_imports where id=%s', (expired[0],)).fetchone()
    assert row[:3] == ('cancelled', None, None) and row[3] and row[4]['counts']['modified'] == 12
    # A retry arriving after retirement cannot change the token or reattach files.
    for assignment, value in [('status', 'queued'), ('run_token', str(uuid.uuid4())), ('snapshot_path', expired[1])]:
        try:
            db.execute('update campus_imports set '+assignment+'=%s where id=%s', (value, expired[0]))
            raise AssertionError('Expired files were revived')
        except psycopg.DatabaseError as error:
            assert error.sqlstate == 'PT409'
    try:
        db.execute('select finish_import_artifact_cleanup(%s)', (expired[0],))
        raise AssertionError('Acknowledged undeleted storage')
    except psycopg.DatabaseError as error:
        assert error.sqlstate == 'PT409'
    assert db.execute('select * from claim_import_artifact_cleanup(%s)', (expired[0],)).fetchall() == claimed
    original_object_id = claimed[0][1]
    db.execute('update storage.objects set id=%s where name=%s', (str(uuid.uuid4()), expired[1]))
    try:
        db.execute('select * from claim_import_artifact_cleanup(%s)', (expired[0],))
        raise AssertionError('Replaced object was returned for deletion')
    except psycopg.DatabaseError as error:
        assert error.sqlstate == 'PT409'
    db.execute('update storage.objects set id=%s where name=%s', (original_object_id, expired[1]))
    # Test-only metadata stub simulates a successful Storage API response.
    db.execute('delete from storage.objects where name=%s', (expired[1],))
    assert db.execute('select finish_import_artifact_cleanup(%s)', (expired[0],)).fetchone()[0] == 1
    assert db.execute('select finish_import_artifact_cleanup(%s)', (expired[0],)).fetchone()[0] == 0
    assert not db.execute('select * from claim_import_artifact_cleanup(%s)', (expired[0],)).fetchall()
    assert db.execute("select count(*) from storage.objects where name like %s", (f'lasu/{expired[0]}/%',)).fetchone()[0] == 3
    for identity, path in protected:
        assert db.execute('select 1 from storage.objects where name=%s', (path,)).fetchone()
        assert db.execute('select artifacts_expired_at from campus_imports where id=%s', (identity,)).fetchone()[0] is None
    assert db.execute('select (select count(*) from source_features), (select count(*) from map_changes), (select count(*) from map_edits)').fetchone() == before
    print(json.dumps({'retention': 'passed', 'protectedImports': len(protected), 'retryRaces': 'passed', 'editorDataUnchanged': True}))
