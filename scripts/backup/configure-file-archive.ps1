param([string]$ProjectRoot='C:\EmBe')
$ErrorActionPreference='Stop'
$config=@{}
Get-Content -LiteralPath (Join-Path $ProjectRoot 'secrets/supabase-backup.env') | ForEach-Object {
 if($_ -match '^([A-Z0-9_]+)=(.*)$'){$config[$matches[1]]=$matches[2].Trim().Trim('"').Trim("'")}
}
$ref='tpqqzowhndbkmkckpbgv'
if($config.SUPABASE_PROJECT_REF -ne $ref){throw 'Wrong project'}
$headers=@{Authorization='Bearer '+$config.SUPABASE_ACCESS_TOKEN}
$query=@"
DO `$`$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='embe_file_archive_secret') THEN
  PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'embe_file_archive_secret');
 END IF;
END `$`$;
SELECT decrypted_secret AS token FROM vault.decrypted_secrets WHERE name='embe_file_archive_secret';
"@
$result=Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ref/database/query" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{query=$query}|ConvertTo-Json)
$token=$result.token
if($token -notmatch '^[a-f0-9]{64}$'){throw 'Invalid archive credential'}
$temp=Join-Path $ProjectRoot ('secrets/cloud-file-'+[guid]::NewGuid().ToString('N')+'.env')
try{
 [IO.File]::WriteAllText($temp,"EMBE_FILE_ARCHIVE_TOKEN=$token`n",[Text.UTF8Encoding]::new($false))
 $env:SUPABASE_ACCESS_TOKEN=$config.SUPABASE_ACCESS_TOKEN
 & (Join-Path $ProjectRoot 'tools/bin/supabase.exe') secrets set --project-ref $ref --env-file $temp
 if($LASTEXITCODE -ne 0){throw 'Edge credential configuration failed'}
 'File archive credential configured; no private key or health files exported.'
}finally{
 if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp}
 Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
 $token=$null;$result=$null;$config=$null
}
