param(
    [Parameter(Mandatory = $true)]
    [string]$InputFile,

    [ValidateSet("cross-check", "recheck")]
    [string]$Mode = "cross-check",

    [string]$RootDir = (Get-Location).Path,

    [string]$OutputFile,

    [string]$StatusFile,

    [string]$LogFile
)

$resolvedRoot = (Resolve-Path -LiteralPath $RootDir).Path
$resolvedInput = (Resolve-Path -LiteralPath $InputFile).Path
$parentDir = Split-Path -Parent $resolvedInput

if (-not $OutputFile) {
    if ($Mode -eq "cross-check") {
        $OutputFile = Join-Path $parentDir "02_CODEX_REVIEW.md"
    } else {
        $OutputFile = Join-Path $parentDir "04_CODEX_RECHECK.md"
    }
}

if (-not $StatusFile) {
    if ($Mode -eq "cross-check") {
        $StatusFile = Join-Path $parentDir "02_CODEX_REVIEW.status.json"
    } else {
        $StatusFile = Join-Path $parentDir "04_CODEX_RECHECK.status.json"
    }
}

if (-not $LogFile) {
    if ($Mode -eq "cross-check") {
        $LogFile = Join-Path $parentDir "02_CODEX_REVIEW.log"
    } else {
        $LogFile = Join-Path $parentDir "04_CODEX_RECHECK.log"
    }
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputFile)
$resolvedStatus = [System.IO.Path]::GetFullPath($StatusFile)
$resolvedLog = [System.IO.Path]::GetFullPath($LogFile)
$invokeScript = Join-Path $resolvedRoot "scripts\Invoke-CodexCrossCheck.ps1"

if (-not (Test-Path -LiteralPath $invokeScript)) {
    throw "Invoke script not found: $invokeScript"
}

function Write-StatusSnapshot {
    param(
        [string]$State,
        [string]$Message,
        [int]$WorkerPid = 0
    )

    $payload = [ordered]@{
        mode = $Mode
        status = $State
        inputFile = $resolvedInput
        outputFile = $resolvedOutput
        statusFile = $resolvedStatus
        logFile = $resolvedLog
        workerPid = $WorkerPid
        startedAt = $null
        finishedAt = $null
        updatedAt = (Get-Date).ToString("o")
        lastMessage = $Message
    }

    $statusDir = Split-Path -Parent $resolvedStatus
    if (-not (Test-Path -LiteralPath $statusDir)) {
        New-Item -ItemType Directory -Path $statusDir -Force | Out-Null
    }

    $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedStatus -Encoding UTF8
}

function Test-WorkerAlive {
    param([int]$PidValue)

    if ($PidValue -le 0) {
        return $false
    }

    return [bool](Get-Process -Id $PidValue -ErrorAction SilentlyContinue)
}

if (Test-Path -LiteralPath $resolvedStatus) {
    try {
        $existing = Get-Content -LiteralPath $resolvedStatus -Raw | ConvertFrom-Json
    } catch {
        $existing = $null
    }

    if ($existing -and ($existing.status -eq "running" -or $existing.status -eq "queued")) {
        if (Test-WorkerAlive -PidValue ([int]$existing.workerPid)) {
            throw "A Codex $Mode job is already running for this bundle. statusFile=$resolvedStatus workerPid=$($existing.workerPid)"
        }
    }
}

$shellExe = $null
$pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCmd) {
    $shellExe = $pwshCmd.Source
} else {
    $powershellCmd = Get-Command powershell -ErrorAction Stop
    $shellExe = $powershellCmd.Source
}

$quotedArgs = @(
    "-NoProfile"
    "-ExecutionPolicy Bypass"
    ('-File "{0}"' -f $invokeScript)
    ('-InputFile "{0}"' -f $resolvedInput)
    ('-Mode "{0}"' -f $Mode)
    ('-RootDir "{0}"' -f $resolvedRoot)
    ('-OutputFile "{0}"' -f $resolvedOutput)
    ('-StatusFile "{0}"' -f $resolvedStatus)
    ('-LogFile "{0}"' -f $resolvedLog)
) -join " "

if (Test-Path -LiteralPath $resolvedStatus) {
    Remove-Item -LiteralPath $resolvedStatus -Force
}

Write-StatusSnapshot -State "queued" -Message "Background Codex job queued."

$process = Start-Process -FilePath $shellExe -ArgumentList $quotedArgs -WindowStyle Hidden -PassThru

Write-StatusSnapshot -State "queued" -Message "Background Codex job started." -WorkerPid $process.Id

[ordered]@{
    mode = $Mode
    workerPid = $process.Id
    inputFile = $resolvedInput
    outputFile = $resolvedOutput
    statusFile = $resolvedStatus
    logFile = $resolvedLog
} | ConvertTo-Json -Depth 6
