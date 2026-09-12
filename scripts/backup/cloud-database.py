"""Bounded app-schema backup; never prints SQL, rows, credentials or provider errors.

The GitHub runner has a read-only database identity and upload-only API token.
The private decryption key is deliberately not available to this process.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import uuid

IMAGE = 'postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73'
ENDPOINT = 'https://tpqqzowhndbkmkckpbgv.supabase.co/functions/v1/cloud-backup-ingest'
ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = ('public', 'portal_read_model', 'embe_studio')
MAX_BYTES = 16 * 1024 * 1024
PHASE = 'configuration'


def run(args, **kwargs):
    result = subprocess.run(args, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        # Safe schema-only hints: never include SQL statements, row values or credentials.
        message = result.stderr.decode(errors='replace')
        hint = re.search(r'(?:schema|role|type|function|relation) "[a-zA-Z0-9_.]+" (?:does not exist|already exists)', message)
        if hint: raise RuntimeError('Restore dependency: ' + hint.group(0))
        raise RuntimeError('Command failed')
    return result.stdout


def db_args():
    args = ['docker', 'run', '--rm', '-i', '-v', f'{ROOT / "scripts/backup/supabase-ca.crt"}:/backup-ca.crt:ro']
    for key in ('PGPASSWORD', 'PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGSSLMODE', 'PGSSLROOTCERT', 'PGCONNECT_TIMEOUT'):
        args += ['-e', key]
    return args + [IMAGE]


def psql(args, sql):
    return run(args + ['psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=sql.encode(), stdout=subprocess.PIPE).decode().strip()


def validate_metadata(tables):
    if not tables or len(tables) > 200:
        raise RuntimeError('Unexpected table inventory')
    for table in tables:
        if table['schema'] not in SCHEMAS or not re.fullmatch('[a-z][a-z0-9_]*', table['name']):
            raise RuntimeError('Unexpected relation')
        if not table['can_read'] or table['can_write'] or (table['rls'] and not table['backup_policy']) or table['restrictive']:
            raise RuntimeError('Backup privileges must be reviewed for every table')


def collect_snapshot(folder):
    global PHASE
    PHASE = 'read_only_preflight'
    proc = subprocess.Popen(db_args() + ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    def query(sql):
        proc.stdin.write(sql + '\n'); proc.stdin.flush()
        value = proc.stdout.readline().strip()
        if not value: raise RuntimeError('Snapshot connection failed')
        return value
    try:
        proc.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'); proc.stdin.flush()
        snapshot = query('SELECT pg_export_snapshot();')
        if not re.fullmatch('[0-9A-Fa-f-]+', snapshot): raise RuntimeError('Invalid snapshot')
        safe = query("SELECT current_user='embe_cloud_backup' AND current_setting('transaction_read_only')='on' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT has_schema_privilege(current_user,'vault','USAGE') FROM pg_roles WHERE rolname=current_user;")
        if safe != 't': raise RuntimeError('Unexpected identity or privileges')
        tables = json.loads(query("""SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,
          'can_read',has_table_privilege(c.oid,'SELECT'),'can_write',has_table_privilege(c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
          'rls',c.relrowsecurity,'backup_policy',EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='embe_cloud_backup_select'
            AND p.polcmd='r' AND p.polpermissive AND pg_get_expr(p.polqual,p.polrelid)='true'
            AND (SELECT oid FROM pg_roles WHERE rolname=current_user)=ANY(p.polroles)),
          'restrictive',EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive)) ORDER BY n.nspname,c.relname)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('public','portal_read_model','embe_studio') AND c.relkind IN ('r','p');"""))
        validate_metadata(tables)
        counts_sql = ' UNION ALL '.join(f'SELECT \'{t["schema"]}.{t["name"]}\' AS name, count(*) AS total FROM "{t["schema"]}"."{t["name"]}"' for t in tables)
        counts = json.loads(query(f'SELECT json_object_agg(name,total) FROM ({counts_sql}) counts;'))
        PHASE = 'consistent_dump'
        dump = folder / 'application.dump'
        with dump.open('wb') as out:
            args = db_args() + ['pg_dump', '--format=custom', '--inserts', '--enable-row-security', '--no-owner', '--no-privileges', '--snapshot', snapshot]
            for schema in SCHEMAS: args += ['--schema', schema]
            run(args, stdout=out, timeout=240)
        if not 0 < dump.stat().st_size <= MAX_BYTES: raise RuntimeError('Dump size limit')
        return dump, counts
    finally:
        if proc.poll() is None:
            try: proc.stdin.write('ROLLBACK;\n\\q\n'); proc.stdin.flush(); proc.wait(timeout=5)
            except (BrokenPipeError, subprocess.TimeoutExpired): proc.kill(); proc.wait()


def restore_check(dump, counts):
    global PHASE
    PHASE = 'isolated_restore'
    name = 'embe-backup-drill-' + uuid.uuid4().hex[:12]
    try:
        run(['docker','run','-d','--name',name,'--network','none','--memory','512m','--cpus','1',
             '--tmpfs','/var/lib/postgresql/data:rw,size=256m','-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE], stdout=subprocess.PIPE)
        for _ in range(40):
            probe = subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if probe.returncode == 0: break
            time.sleep(.5)
        else: raise RuntimeError('Restore database unavailable')
        local = ['docker','exec','-i',name]
        psql(local, """DROP SCHEMA public; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
          CREATE ROLE embe_cloud_backup; CREATE SCHEMA auth; CREATE SCHEMA extensions;
          -- Platform metadata is not backed up here. These empty dependencies
          -- allow app views to restore without activating Supabase Storage.
          CREATE SCHEMA storage;
          CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);
          CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text,metadata jsonb,user_metadata jsonb,
            created_at timestamptz,updated_at timestamptz,version text,archived_at timestamptz,is_delete_marker boolean);
          CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
          CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';
          CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT NULL::text';""")
        # No network, ports, real app roles or runtime jobs are activated in the restore target.
        with dump.open('rb') as src:
            run(local + ['pg_restore','-U','postgres','-d','postgres','--no-owner','--no-privileges','--exit-on-error'], stdin=src, stdout=subprocess.DEVNULL, timeout=180)
        queries = []
        for name_key in counts:
            schema, table = name_key.split('.')
            queries.append(f'SELECT \'{name_key}\' AS name, count(*) AS total FROM "{schema}"."{table}"')
        actual = json.loads(psql(local, 'SELECT json_object_agg(name,total) FROM (' + ' UNION ALL '.join(queries) + ') counts;'))
        if actual != counts: raise RuntimeError('Restored row count mismatch')
    finally:
        subprocess.run(['docker','rm','-f',name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def upload_request(method, token, body=None):
    headers = {'Authorization': f'Bearer {token}'}
    if body is not None:
        headers.update({'Content-Type':'application/pkcs7-mime','X-Content-SHA256':hashlib.sha256(body).hexdigest()})
    return urllib.request.Request(ENDPOINT, data=body, headers=headers, method=method)


def main():
    global PHASE
    PHASE = 'repository_identity'
    if os.environ.get('GITHUB_REPOSITORY') not in (None, 'nguyenhieuisocial/embe') or os.environ.get('GITHUB_REF') not in (None, 'refs/heads/main'):
        raise RuntimeError('Wrong repository or branch')
    PHASE = 'database_credential_format'
    if not re.fullmatch('[a-f0-9]{64}', os.environ.get('PGPASSWORD','')): raise RuntimeError('Missing database credential')
    PHASE = 'upload_credential_format'
    token = os.environ.get('EMBE_CLOUD_BACKUP_TOKEN','')
    if not re.fullmatch('[a-f0-9]{64}',token): raise RuntimeError('Missing upload credential')
    os.environ.update(PGHOST='aws-0-ap-southeast-1.pooler.supabase.com', PGPORT='5432', PGUSER='embe_cloud_backup.tpqqzowhndbkmkckpbgv',
                      PGDATABASE='postgres',PGSSLMODE='verify-full',PGSSLROOTCERT='/backup-ca.crt',PGCONNECT_TIMEOUT='15')
    PHASE = 'daily_slot_check'
    try:
        with urllib.request.urlopen(upload_request('HEAD',token), timeout=30) as response:
            if response.status == 204:
                print('Today already has an encrypted backup; retained without overwrite.'); return
            raise RuntimeError('Unexpected slot response')
    except urllib.error.HTTPError as error:
        if error.code != 404: raise RuntimeError('Slot unavailable') from None
    with tempfile.TemporaryDirectory(prefix='embe-cloud-backup-') as temp:
        folder = Path(temp); os.chmod(folder,0o700)
        dump, counts = collect_snapshot(folder)
        restore_check(dump, counts)
        PHASE = 'encryption'
        manifest = {'version':1,'project':'embe-read-model','schemas':SCHEMAS,'counts':counts,'dumpSha256':hashlib.sha256(dump.read_bytes()).hexdigest(),
                    'createdAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'verified':'isolated_restore_row_counts',
                    'excludes':['storage object bytes','auth','storage','vault','Immich originals']}
        (folder/'manifest.json').write_text(json.dumps(manifest),encoding='utf8')
        archive = folder/'application.tar.gz'
        with tarfile.open(archive,'w:gz') as tar:
            tar.add(dump,arcname='application.dump'); tar.add(folder/'manifest.json',arcname='manifest.json')
        encrypted = folder/'application.cms'
        run([os.environ.get('EMBE_OPENSSL','openssl'),'cms','-encrypt','-binary','-aes-256-gcm','-in',str(archive),'-out',str(encrypted),'-outform','DER',
             '-recip',str(ROOT/'scripts/backup/cloud-recipient.pem'),'-keyopt','rsa_padding_mode:oaep'],stdout=subprocess.DEVNULL)
        body = encrypted.read_bytes()
        if not 512 <= len(body) <= MAX_BYTES: raise RuntimeError('Encrypted size limit')
        PHASE = 'encrypted_offsite_upload'
        with urllib.request.urlopen(upload_request('POST',token,body),timeout=90) as response:
            receipt = json.load(response)
            if response.status != 201 or receipt.get('sha256') != hashlib.sha256(body).hexdigest() or receipt.get('bytes') != len(body):
                raise RuntimeError('Upload not verified')
        print(f'Encrypted backup stored; isolated restore checked {len(counts)} tables. No private data exported to workflow artifacts.')


if __name__ == '__main__':
    try: main()
    except Exception:
        print(f'Backup failed at {PHASE}. No success receipt. Private diagnostic output is suppressed.')
        raise SystemExit(1)
