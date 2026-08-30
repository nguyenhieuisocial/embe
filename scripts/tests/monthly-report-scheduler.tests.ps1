$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$installer = Join-Path $projectRoot "scripts\install-monthly-report-current-user.ps1"
$taskName = "EmBe Monthly Report Test " + [guid]::NewGuid().ToString("N")

try {
    & pwsh -NoProfile -File $installer -ProjectRoot $projectRoot -TaskName $taskName -SkipInitialRun
    if ($LASTEXITCODE -ne 0) { throw "Monthly scheduler installer failed" }
    $task = Get-ScheduledTask -TaskName $taskName
    $action = @($task.Actions)[0]
    if ([string]$task.Principal.RunLevel -ne "Limited") { throw "Monthly report task must not be elevated" }
    if ([string]$task.Principal.LogonType -ne "Interactive") { throw "Monthly report task must use the signed-in user" }
    if ($action.Arguments -notlike '*run-monthly.ps1*') { throw "Monthly report task does not run the verified pipeline" }
    if ($action.Arguments -match 'TOKEN|SECRET|PASSWORD|API_KEY') { throw "Monthly report task exposes a secret" }
    $taskXml = [xml](Export-ScheduledTask -TaskName $taskName)
    $namespaces = [Xml.XmlNamespaceManager]::new($taskXml.NameTable)
    $namespaces.AddNamespace("task", "http://schemas.microsoft.com/windows/2004/02/mit/task")
    $dayOne = $taskXml.SelectSingleNode("//task:CalendarTrigger/task:ScheduleByMonth/task:DaysOfMonth/task:Day[text()='1']", $namespaces)
    if ($null -eq $dayOne) { throw "Monthly report task is not scheduled for day one" }
    Write-Output "monthly report scheduler tests passed"
} finally {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}
