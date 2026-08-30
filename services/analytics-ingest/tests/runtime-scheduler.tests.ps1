$ErrorActionPreference = 'Stop'

$serviceRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$projectRoot = Split-Path -Parent (Split-Path -Parent $serviceRoot)
$installer = Join-Path $serviceRoot 'install-scheduled.ps1'
$taskName = "EmBe Analytics Test $([guid]::NewGuid())"

try {
    & pwsh -NoProfile -File $installer -ProjectRoot $projectRoot -TaskName $taskName -SkipInitialRun
    if ($LASTEXITCODE -ne 0) { throw "Installer failed with exit code $LASTEXITCODE" }

    $task = Get-ScheduledTask -TaskName $taskName
    $taskXml = [xml](Export-ScheduledTask -TaskName $taskName)
    $arguments = $task.Actions[0].Arguments

    if ($task.Principal.RunLevel -ne 'Limited') { throw 'Analytics task must run with Limited privileges' }
    if ($task.Principal.LogonType -ne 'Interactive') { throw 'Analytics task must use the current interactive account' }
    if ($arguments -notmatch 'run\.py') { throw 'Analytics task must invoke the local runner' }
    if ($arguments -match 'TOKEN|API.?KEY|secret=') { throw 'Scheduled task arguments must not contain credentials' }
    if ($taskXml.Task.Triggers.TimeTrigger.Repetition.Interval -ne 'PT15M') {
        throw 'Analytics task must repeat every 15 minutes'
    }
}
finally {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}

Write-Output 'Analytics scheduler tests passed.'
