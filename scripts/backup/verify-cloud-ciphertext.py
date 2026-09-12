"""Local, private restore drill of the actual R2 ciphertext, not a fresh source dump."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tarfile
import tempfile
import time
import boto3

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('cloud_backup',Path(__file__).with_name('cloud-database.py'))
backup=importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)

def main():
    day=int(time.time()//86400)
    key=f'cloud-db-v1/slot-{day%35:02d}.cms'
    client=boto3.client('s3',endpoint_url=f'https://{os.environ["EMBE_R2_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
       aws_access_key_id=os.environ['EMBE_R2_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['EMBE_R2_SECRET_ACCESS_KEY'],region_name='auto')
    obj=client.get_object(Bucket='embe-backup',Key=key)
    body=obj['Body'].read(backup.MAX_BYTES+1); obj['Body'].close()
    digest=hashlib.sha256(body).hexdigest()
    if len(body)>backup.MAX_BYTES or digest!=obj['Metadata'].get('sha256'): raise RuntimeError('Offsite checksum mismatch')
    with tempfile.TemporaryDirectory(prefix='embe-cloud-cipher-drill-') as temp:
        folder=Path(temp); os.chmod(folder,0o700)
        cipher=folder/'backup.cms'; cipher.write_bytes(body)
        archive=folder/'application.tar.gz'
        backup.run([os.environ.get('EMBE_OPENSSL','openssl'),'cms','-decrypt','-binary','-inform','DER','-in',str(cipher),
          '-recip',str(ROOT/'scripts/backup/cloud-recipient.pem'),'-inkey',str(ROOT/'secrets/cloud-backup-recipient.pem'),'-out',str(archive)])
        with tarfile.open(archive) as tar:
            members=tar.getmembers()
            if {m.name for m in members}!={'application.dump','manifest.json'} or len(members)!=2: raise RuntimeError('Unexpected archive')
            for member in members:
                if not member.isfile() or member.size>backup.MAX_BYTES: raise RuntimeError('Unsafe member')
            tar.extractall(folder,filter='data')
        manifest=json.loads((folder/'manifest.json').read_text(encoding='utf8'))
        dump=folder/'application.dump'
        if hashlib.sha256(dump.read_bytes()).hexdigest()!=manifest['dumpSha256']: raise RuntimeError('Plaintext checksum mismatch')
        backup.restore_check(dump,manifest['counts'])
        report={'verifiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'status':'verified','object':key,
          'cipherSha256':digest,'dumpSha256':manifest['dumpSha256'],'tables':len(manifest['counts']),
          'source':'downloaded R2 ciphertext','checks':['decrypt authenticated CMS','dump checksum','isolated restore','all table row counts']}
        dest=ROOT/'exports/restore-verification/cloud-database'; dest.mkdir(parents=True,exist_ok=True)
        (dest/'latest.json').write_text(json.dumps(report,indent=2),encoding='utf8')
        print(json.dumps({k:report[k] for k in ['status','tables','checks']}))

if __name__=='__main__':
    try: main()
    except Exception:
        print('Offsite restore drill failed. Private output suppressed.'); raise SystemExit(1)
