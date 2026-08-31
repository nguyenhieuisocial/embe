param(
    [string]$ProjectRoot = "C:\EmBe",
    [string]$TaskName = "EmBe Portal Timeline Sync",
    [string]$RotationTaskName = "EmBe Integration Credential Rotation",
    [string]$BridgeTaskName = "EmBe BabyBuddy Memos Sync",
    [string]$SyncAccountName = "EmBePortalSyncSvc",
    [string]$CredentialAccountName = "EmBeCredentialSvc",
    [string]$BridgeAccountName = "EmBeBridgeSvc",
    [switch]$VerifyNow
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$installStatusPath = Join-Path $ProjectRoot "data\status\portal-service-install.json"
$installStep = "administrator_check"

function Write-InstallStatus([string]$Status, [string]$ErrorType = "", [string]$ErrorMessage = "") {
    $payload = [ordered]@{
        schema_version = 1
        generated_at = [DateTimeOffset]::UtcNow.ToString("o")
        status = $Status
        install_step = $installStep
        verified_now = $(if ($Status -eq "ready") { [bool]$VerifyNow } else { $false })
        tasks_expected = 3
        tasks_verified = $(if ($Status -eq "ready" -and $VerifyNow) { 3 } else { 0 })
        error_type = $ErrorType
        error_message = $ErrorMessage
    }
    [IO.Directory]::CreateDirectory((Split-Path $installStatusPath -Parent)) | Out-Null
    $temporary = "$installStatusPath.tmp"
    [IO.File]::WriteAllText($temporary, ($payload | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $installStatusPath -Force
}

trap {
    Write-InstallStatus -Status "failed" -ErrorType $_.Exception.GetType().Name -ErrorMessage $_.Exception.Message
    Write-Error $_
    exit 1
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Administrator elevation is required to install isolated EmBe service accounts"
}
$installStep = "task_installation"

$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$syncScript = Join-Path $ProjectRoot "services\local-bff\src\sync_portal.py"
$bridgeScript = Join-Path $ProjectRoot "services\babybuddy-memos-sync\src\embe_sync\main.py"
$provisioner = Join-Path $ProjectRoot "scripts\provision-local-integrations.ps1"
$rotationScript = Join-Path $ProjectRoot "scripts\rotate-integration-credentials.ps1"
$adminSecretDirectory = Join-Path $ProjectRoot "secrets\admin"
$adminSecretFile = Join-Path $adminSecretDirectory "portal-data.env"
$runtimeSecretDirectory = Join-Path $ProjectRoot "secrets\runtime"
$syncSecretFile = Join-Path $runtimeSecretDirectory "portal-sync.env"
$bridgeSecretFile = Join-Path $runtimeSecretDirectory "babybuddy-memos-sync\sync.env"
$statusFile = Join-Path $ProjectRoot "data\status\portal-sync.json"
$logFile = Join-Path $ProjectRoot "data\logs\portal-sync.jsonl"
$vaultTimeline = Join-Path $ProjectRoot "vault\20-Timeline\Memos"
$vaultArchive = Join-Path $ProjectRoot "vault\90-System\Memos-Archive"
$bridgeLedgerDirectory = Join-Path $ProjectRoot "data\appdata\sync-daemon"
$bridgeStatusFile = Join-Path $ProjectRoot "data\status\babybuddy-memos-sync.json"
$bridgeLogFile = Join-Path $ProjectRoot "data\logs\babybuddy-memos-sync.jsonl"

foreach ($path in @($python, $syncScript, $bridgeScript, $provisioner, $rotationScript, $adminSecretFile, $syncSecretFile, $bridgeSecretFile)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Portal integration dependency is missing: $path" }
}
foreach ($path in @((Split-Path $statusFile -Parent), (Split-Path $logFile -Parent), $vaultTimeline, $vaultArchive)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}

function New-ServiceAccountPassword([string]$AccountName, [string]$Description) {
    $alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%+-_"
    $bytes = New-Object byte[] 48
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    $plain = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
    $secure = ConvertTo-SecureString $plain -AsPlainText -Force
    $existing = Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        New-LocalUser -Name $AccountName -Password $secure -PasswordNeverExpires -UserMayNotChangePassword -Description $Description | Out-Null
    } else {
        Set-LocalUser -Name $AccountName -Password $secure -PasswordNeverExpires $true -UserMayChangePassword $false
        Enable-LocalUser -Name $AccountName
    }
    $secure.Dispose()
    return $plain
}

if (-not ("EmBe.LsaRights" -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;

namespace EmBe {
    public static class LsaRights {
        [StructLayout(LayoutKind.Sequential)]
        private struct LSA_OBJECT_ATTRIBUTES {
            public int Length;
            public IntPtr RootDirectory;
            public IntPtr ObjectName;
            public uint Attributes;
            public IntPtr SecurityDescriptor;
            public IntPtr SecurityQualityOfService;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct LSA_UNICODE_STRING {
            public ushort Length;
            public ushort MaximumLength;
            public IntPtr Buffer;
        }

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern uint LsaOpenPolicy(IntPtr systemName, ref LSA_OBJECT_ATTRIBUTES attributes, uint access, out IntPtr handle);
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern uint LsaAddAccountRights(IntPtr handle, byte[] sid, LSA_UNICODE_STRING[] rights, uint count);
        [DllImport("advapi32.dll")]
        private static extern uint LsaNtStatusToWinError(uint status);
        [DllImport("advapi32.dll")]
        private static extern uint LsaClose(IntPtr handle);

        public static void GrantBatchLogon(string account) {
            var sid = (SecurityIdentifier)new NTAccount(account).Translate(typeof(SecurityIdentifier));
            var sidBytes = new byte[sid.BinaryLength];
            sid.GetBinaryForm(sidBytes, 0);
            var attributes = new LSA_OBJECT_ATTRIBUTES();
            attributes.Length = Marshal.SizeOf(attributes);
            IntPtr handle;
            uint status = LsaOpenPolicy(IntPtr.Zero, ref attributes, 0x00000810, out handle);
            if (status != 0) throw new Win32Exception((int)LsaNtStatusToWinError(status));
            IntPtr buffer = Marshal.StringToHGlobalUni("SeBatchLogonRight");
            try {
                var right = new LSA_UNICODE_STRING {
                    Buffer = buffer,
                    Length = (ushort)("SeBatchLogonRight".Length * 2),
                    MaximumLength = (ushort)(("SeBatchLogonRight".Length + 1) * 2)
                };
                status = LsaAddAccountRights(handle, sidBytes, new[] { right }, 1);
                if (status != 0) throw new Win32Exception((int)LsaNtStatusToWinError(status));
            } finally {
                Marshal.FreeHGlobal(buffer);
                LsaClose(handle);
            }
        }
    }
}
'@
}

$syncPassword = New-ServiceAccountPassword $SyncAccountName "Runs the read-only EmBe portal publication job"
$credentialPassword = New-ServiceAccountPassword $CredentialAccountName "Rotates EmBe integration credentials"
$bridgePassword = New-ServiceAccountPassword $BridgeAccountName "Syncs BabyBuddy milestones to private Memos"
$syncIdentity = "$env:COMPUTERNAME\$SyncAccountName"
$credentialIdentity = "$env:COMPUTERNAME\$CredentialAccountName"
$bridgeIdentity = "$env:COMPUTERNAME\$BridgeAccountName"
$ownerIdentity = $identity.Name
[EmBe.LsaRights]::GrantBatchLogon($syncIdentity)
[EmBe.LsaRights]::GrantBatchLogon($credentialIdentity)
[EmBe.LsaRights]::GrantBatchLogon($bridgeIdentity)

$rootAcl = Get-Acl -LiteralPath $ProjectRoot
$hasAuthenticatedUsersAce = @($rootAcl.Access | Where-Object {
    $_.IdentityReference.Value -in @("NT AUTHORITY\Authenticated Users", "S-1-5-11")
}).Count -gt 0
& icacls.exe $ProjectRoot /inheritance:r /grant:r "${ownerIdentity}:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)" "BUILTIN\Users:(OI)(CI)(RX)" | Out-Null
if ($hasAuthenticatedUsersAce) {
    & icacls.exe $ProjectRoot /remove:g "*S-1-5-11" /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to protect the EmBe project root" }
}

foreach ($path in @(
    (Join-Path $ProjectRoot ".venv"),
    (Join-Path $ProjectRoot "services\local-bff"),
    (Join-Path $ProjectRoot "services\vault-export"),
    (Join-Path $ProjectRoot "scripts")
)) {
    & icacls.exe $path /grant:r "${ownerIdentity}:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)" "${syncIdentity}:(OI)(CI)(RX)" "${credentialIdentity}:(OI)(CI)(RX)" | Out-Null
    & icacls.exe $path /grant:r "${syncIdentity}:(RX)" "${credentialIdentity}:(RX)" /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to protect executable integration path: $path" }
}

foreach ($path in @((Join-Path $ProjectRoot ".venv"), (Join-Path $ProjectRoot "services\babybuddy-memos-sync"))) {
    & icacls.exe $path /grant:r "${bridgeIdentity}:(OI)(CI)(RX)" | Out-Null
    & icacls.exe $path /grant:r "${bridgeIdentity}:(RX)" /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to protect BabyBuddy bridge code: $path" }
}

& icacls.exe $adminSecretDirectory /inheritance:r /grant:r "${ownerIdentity}:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)" "${credentialIdentity}:(OI)(CI)(M)" | Out-Null
& icacls.exe $adminSecretFile /inheritance:r /grant:r "${ownerIdentity}:(F)" "BUILTIN\Administrators:(F)" "SYSTEM:(F)" "${credentialIdentity}:(M)" | Out-Null
& icacls.exe $runtimeSecretDirectory /inheritance:r /grant:r "${ownerIdentity}:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)" "${credentialIdentity}:(OI)(CI)(M)" "${syncIdentity}:(OI)(CI)(RX)" | Out-Null
& icacls.exe $syncSecretFile /inheritance:r /grant:r "${ownerIdentity}:(F)" "BUILTIN\Administrators:(F)" "SYSTEM:(F)" "${credentialIdentity}:(M)" "${syncIdentity}:(R)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to isolate portal runtime credentials" }

& icacls.exe (Split-Path $bridgeSecretFile -Parent) /grant:r "${credentialIdentity}:(OI)(CI)(M)" "${bridgeIdentity}:(OI)(CI)(R)" | Out-Null
& icacls.exe $bridgeSecretFile /inheritance:r /grant:r "${ownerIdentity}:(F)" "BUILTIN\Administrators:(F)" "SYSTEM:(F)" "${credentialIdentity}:(M)" "${bridgeIdentity}:(R)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to isolate BabyBuddy bridge credentials" }

New-Item -ItemType Directory -Path $bridgeLedgerDirectory -Force | Out-Null
& icacls.exe $bridgeLedgerDirectory /grant:r "${bridgeIdentity}:(OI)(CI)(M)" | Out-Null
& icacls.exe $bridgeLedgerDirectory /grant:r "${bridgeIdentity}:(M)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to grant BabyBuddy bridge ledger access" }

foreach ($path in @((Split-Path $statusFile -Parent), (Split-Path $logFile -Parent), $vaultTimeline, $vaultArchive)) {
    & icacls.exe $path /grant:r "${syncIdentity}:(OI)(CI)(M)" | Out-Null
    & icacls.exe $path /grant:r "${syncIdentity}:(M)" /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to grant portal sync output access: $path" }
}

$syncAction = New-ScheduledTaskAction -Execute $python -Argument "`"$syncScript`" --env `"$syncSecretFile`" --vault `"$ProjectRoot\embe`" --status `"$statusFile`" --log `"$logFile`"" -WorkingDirectory $ProjectRoot
$syncTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$syncSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $syncAction -Trigger $syncTrigger -Settings $syncSettings -User $syncIdentity -Password $syncPassword -RunLevel Limited -Description "Publishes only approved private Memos into the EmBe family read-model." -Force | Out-Null

$rotationAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$rotationScript`" -ProjectRoot `"$ProjectRoot`"" -WorkingDirectory $ProjectRoot
$rotationTrigger = New-ScheduledTaskTrigger -Daily -At 2am
$rotationSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $RotationTaskName -Action $rotationAction -Trigger $rotationTrigger -Settings $rotationSettings -User $credentialIdentity -Password $credentialPassword -RunLevel Limited -Description "Checks and safely rotates EmBe integration credentials before expiry." -Force | Out-Null

$bridgeAction = New-ScheduledTaskAction -Execute $python -Argument "`"$bridgeScript`" --env `"$bridgeSecretFile`" --once --status `"$bridgeStatusFile`" --log `"$bridgeLogFile`"" -WorkingDirectory $ProjectRoot
$bridgeTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$bridgeSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $BridgeTaskName -Action $bridgeAction -Trigger $bridgeTrigger -Settings $bridgeSettings -User $bridgeIdentity -Password $bridgePassword -RunLevel Limited -Description "Synchronizes tagged BabyBuddy milestones into isolated private Memos." -Force | Out-Null

$syncPassword = $null
$credentialPassword = $null
$bridgePassword = $null

function Test-TaskNow([string]$Name, [int]$TimeoutMinutes) {
    $startedAt = Get-Date
    Start-ScheduledTask -TaskName $Name
    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    do {
        Start-Sleep -Seconds 1
        $task = Get-ScheduledTask -TaskName $Name
        $info = Get-ScheduledTaskInfo -TaskName $Name
        $hasFreshRun = $info.LastRunTime -ge $startedAt.AddSeconds(-2) -and $info.LastTaskResult -ne 267011 -and $task.State -ne "Running"
    } while (-not $hasFreshRun -and (Get-Date) -lt $deadline)
    if (-not $hasFreshRun -or $task.State -eq "Running") { throw "Task verification timed out: $Name" }
    if ($info.LastTaskResult -ne 0) { throw "Task verification failed: $Name ($($info.LastTaskResult))" }
}
foreach ($path in @((Split-Path $bridgeStatusFile -Parent), (Split-Path $bridgeLogFile -Parent))) {
    & icacls.exe $path /grant:r "${bridgeIdentity}:(OI)(CI)(M)" | Out-Null
    & icacls.exe $path /grant:r "${bridgeIdentity}:(M)" /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to grant BabyBuddy bridge status access: $path" }
}

if ($VerifyNow) {
    $installStep = "live_verification"
    Test-TaskNow $RotationTaskName 5
    Test-TaskNow $BridgeTaskName 3
    Test-TaskNow $TaskName 3
}

$syncTask = Get-ScheduledTask -TaskName $TaskName
$syncInfo = Get-ScheduledTaskInfo -TaskName $TaskName
$rotationTask = Get-ScheduledTask -TaskName $RotationTaskName
$rotationInfo = Get-ScheduledTaskInfo -TaskName $RotationTaskName
$bridgeTask = Get-ScheduledTask -TaskName $BridgeTaskName
$bridgeInfo = Get-ScheduledTaskInfo -TaskName $BridgeTaskName
$installStep = "complete"
Write-InstallStatus -Status "ready"
[ordered]@{
    status = "ready"
    sync_account = $syncTask.Principal.UserId
    sync_logon_type = [string]$syncTask.Principal.LogonType
    sync_last_result = $syncInfo.LastTaskResult
    rotation_account = $rotationTask.Principal.UserId
    rotation_logon_type = [string]$rotationTask.Principal.LogonType
    rotation_last_result = $rotationInfo.LastTaskResult
    bridge_account = $bridgeTask.Principal.UserId
    bridge_logon_type = [string]$bridgeTask.Principal.LogonType
    bridge_last_result = $bridgeInfo.LastTaskResult
    runs_without_login = $true
    verified_now = [bool]$VerifyNow
} | ConvertTo-Json -Compress
