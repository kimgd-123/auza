param(
    [Parameter(Mandatory = $true)]
    [string]$Target,

    [ValidateSet("auto", "cross-check", "recheck")]
    [string]$Mode = "auto",

    [int]$PollSeconds = 10,

    [int]$TimeoutMinutes = 30
)

$resolvedTarget = (Resolve-Path -LiteralPath $Target).Path
$statusScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "Get-CodexCrossCheckStatus.ps1"

if (-not (Test-Path -LiteralPath $statusScript)) {
    throw "Status helper not found: $statusScript"
}

$deadline = (Get-Date).AddMinutes($TimeoutMinutes)

while ((Get-Date) -lt $deadline) {
    try {
        $jsonText = & powershell -ExecutionPolicy Bypass -File $statusScript -Target $resolvedTarget -Mode $Mode
        $status = $jsonText | ConvertFrom-Json
    } catch {
        Start-Sleep -Seconds $PollSeconds
        continue
    }

    if ($status.status -eq "completed" -or $status.status -eq "failed") {
        [ordered]@{
            mode = $status.mode
            status = $status.status
            workerPid = $status.workerPid
            inputFile = $status.inputFile
            outputFile = $status.outputFile
            outputExists = $status.outputExists
            outputLength = $status.outputLength
            logFile = $status.logFile
            statusFile = $status.statusFile
            startedAt = $status.startedAt
            finishedAt = $status.finishedAt
            updatedAt = $status.updatedAt
            lastMessage = $status.lastMessage
            timedOut = $false
        } | ConvertTo-Json -Depth 6
        exit 0
    }

    Start-Sleep -Seconds $PollSeconds
}

try {
    $jsonText = & powershell -ExecutionPolicy Bypass -File $statusScript -Target $resolvedTarget -Mode $Mode
    $status = $jsonText | ConvertFrom-Json
} catch {
    $status = $null
}

if ($status) {
    [ordered]@{
        mode = $status.mode
        status = $status.status
        workerPid = $status.workerPid
        inputFile = $status.inputFile
        outputFile = $status.outputFile
        outputExists = $status.outputExists
        outputLength = $status.outputLength
        logFile = $status.logFile
        statusFile = $status.statusFile
        startedAt = $status.startedAt
        finishedAt = $status.finishedAt
        updatedAt = $status.updatedAt
        lastMessage = $status.lastMessage
        timedOut = $true
    } | ConvertTo-Json -Depth 6
} else {
    [ordered]@{
        mode = $Mode
        status = "unknown"
        timedOut = $true
        target = $resolvedTarget
        lastMessage = "Timed out while waiting for status file."
    } | ConvertTo-Json -Depth 6
}

exit 1
