"""Read and decrypt real offsite files; compare original bytes, without printing PHI."""
import base64
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.parse
import urllib.request
import boto3
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT=Path(__file__).resolve().parents[2]
MAX=25*1024*1024+32768
BUCKETS={'embe-meal-inbox','embe-medical-records','embe-photo-inbox','embe-studio-drafts'}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--compare-current',action='store_true');args=parser.parse_args()
    if args.compare_current and os.environ.get('SUPABASE_URL')!='https://tpqqzowhndbkmkckpbgv.supabase.co': raise RuntimeError('Wrong project')
    client=boto3.client('s3',endpoint_url=f'https://{os.environ["EMBE_R2_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
        aws_access_key_id=os.environ['EMBE_R2_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['EMBE_R2_SECRET_ACCESS_KEY'],region_name='auto')
    private=serialization.load_pem_private_key((ROOT/'secrets/cloud-backup-recipient.pem').read_bytes(),password=None)
    counts={}; total_bytes=0
    for page in client.get_paginator('list_objects_v2').paginate(Bucket='embe-backup',Prefix='cloud-files-v1/'):
        for entry in page.get('Contents',[]):
            obj=client.get_object(Bucket='embe-backup',Key=entry['Key'])
            body=obj['Body'].read(MAX+1);obj['Body'].close()
            if len(body)>MAX or hashlib.sha256(body).hexdigest()!=obj['Metadata'].get('sha256'): raise RuntimeError('Cipher checksum')
            if body[:6]!=b'EMBA1\n': raise RuntimeError('Envelope format')
            n=int.from_bytes(body[6:10],'big')
            if not 0<n<2048: raise RuntimeError('Envelope header')
            header=body[10:10+n]; info=json.loads(header)
            if info['v']!=1 or info['algorithm']!='RSA-OAEP-SHA256/AES-256-GCM': raise RuntimeError('Algorithm')
            key=private.decrypt(base64.b64decode(info['key']),padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))
            plain=AESGCM(key).decrypt(base64.b64decode(info['iv']),body[10+n:],header)
            m=int.from_bytes(plain[:4],'big')
            if not 0<m<=16384: raise RuntimeError('Metadata size')
            meta=json.loads(plain[4:4+m]); original=plain[4+m:]
            if meta['bucket'] not in BUCKETS or len(original)!=meta['bytes'] or hashlib.sha256(original).hexdigest()!=meta['sha256']: raise RuntimeError('Original checksum')
            if entry['Key']!='cloud-files-v1/'+meta['key']+'.emba': raise RuntimeError('Archive identity')
            if args.compare_current:
                path=urllib.parse.quote(meta['name'],safe='/')
                secret=os.environ['SUPABASE_SECRET_KEY']
                request=urllib.request.Request(os.environ['SUPABASE_URL']+'/storage/v1/object/authenticated/'+meta['bucket']+'/'+path,
                    headers={'apikey':secret,'Authorization':'Bearer '+secret})
                with urllib.request.urlopen(request,timeout=30) as response: current=response.read(MAX+1)
                if hashlib.sha256(current).hexdigest()!=meta['sha256']: raise RuntimeError('Current source differs or was changed; review required')
            counts[meta['bucket']]=counts.get(meta['bucket'],0)+1;total_bytes+=len(original)
    if not counts: raise RuntimeError('No offsite files')
    report={'verifiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'status':'verified','files':sum(counts.values()),
        'buckets':counts,'bytes':total_bytes,'checks':['R2 ciphertext checksum','authenticated decryption','original metadata and checksum']+(['byte comparison with current Supabase source'] if args.compare_current else [])}
    dest=ROOT/'exports/restore-verification/cloud-files';dest.mkdir(parents=True,exist_ok=True)
    (dest/'latest.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report))

if __name__=='__main__':
    try: main()
    except Exception:
        print('Offsite file verification failed; sensitive details suppressed.');raise SystemExit(1)
