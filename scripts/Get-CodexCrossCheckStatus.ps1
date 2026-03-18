param(
    [Parameter(Mandatory = $true)]
    [string]$Target,

    [ValidateSet("auto", "cross-check", "recheck")]
    [string]$Mode = "auto"
)

$resolvedTarget = (Resolve-Path -LiteralPath $Target).Path

if (Test-Path -LiteralPath $resolvedTarget -PathType Leaf) {
    $statusFile = $resolvedTarget
} else {
    if ($Mode -eq "auto" -or $Mode -eq "cross-check") {
        $crossStatus = Join-Path $resolvedTarget "02_CODEX_REVIEW.status.json"
    }

    if ($Mode -eq "auto" -or $Mode -eq "recheck") {
        $recheckStatus = Join-Path $resolvedTarget "04_CODEX_RECHECK.status.json"
    }

    if ($Mode -eq "cross-check") {
        $statusFile = $crossStatus
    } elseif ($Mode -eq "recheck") {
        $statusFile = $recheckStatus
    } else {
        $candidates = @()
        if ($crossStatus -and (Test-Path -LiteralPath $crossStatus)) {
            $candidates += Get-Item -LiteralPath $crossStatus
        }
        if ($recheckStatus -and (Test-Path -LiteralPath $recheckStatus)) {
            $candidates += Get-Item -LiteralPath $recheckStatus
        }

        if (-not $candidates) {
            throw "No status file found in bundle: $resolvedTarget"
        }

        $statusFile = ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
    }
}

if (-not (Test-Path -LiteralPath $statusFile)) {
    throw "Status file not found: $statusFile"
}

$json = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
$outputExists = $false
$outputLength = 0

if ($json.outputFile -and (Test-Path -LiteralPath $json.outputFile)) {
    $outputExists = $true
    $outputLength = (Get-Item -LiteralPath $json.outputFile).Length
}

[ordered]@{
    mode = $json.mode
    status = $json.status
    workerPid = $json.workerPid
    inputFile = $json.inputFile
    outputFile = $json.outputFile
    outputExists = $outputExists
    outputLength = $outputLength
    logFile = $json.logFile
    statusFile = $statusFile
    startedAt = $json.startedAt
    finishedAt = $json.finishedAt
    updatedAt = $json.updatedAt
    lastMessage = $json.lastMessage
} | ConvertTo-Json -Depth 6
