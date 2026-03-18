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

if (-not $OutputFile) {
    $parentDir = Split-Path -Parent $resolvedInput
    if ($Mode -eq "cross-check") {
        $OutputFile = Join-Path $parentDir "02_CODEX_REVIEW.md"
    } else {
        $OutputFile = Join-Path $parentDir "04_CODEX_RECHECK.md"
    }
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputFile)
$parentDir = Split-Path -Parent $resolvedInput

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

$resolvedStatus = [System.IO.Path]::GetFullPath($StatusFile)
$resolvedLog = [System.IO.Path]::GetFullPath($LogFile)
$inputContent = Get-Content -LiteralPath $resolvedInput -Raw
$scriptStartedAt = (Get-Date).ToString("o")

# Force UTF-8 when sending Korean markdown to the Codex CLI native process.
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

function Write-StatusFile {
    param(
        [string]$State,
        [string]$Message,
        [string]$FinishedAt = $null
    )

    $payload = [ordered]@{
        mode = $Mode
        status = $State
        inputFile = $resolvedInput
        outputFile = $resolvedOutput
        statusFile = $resolvedStatus
        logFile = $resolvedLog
        workerPid = $PID
        startedAt = $scriptStartedAt
        finishedAt = $FinishedAt
        updatedAt = (Get-Date).ToString("o")
        lastMessage = $Message
    }

    $statusDir = Split-Path -Parent $resolvedStatus
    if (-not (Test-Path -LiteralPath $statusDir)) {
        New-Item -ItemType Directory -Path $statusDir -Force | Out-Null
    }

    $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedStatus -Encoding UTF8
}

function Write-LogLine {
    param([string]$Message)

    $logDir = Split-Path -Parent $resolvedLog
    if (-not (Test-Path -LiteralPath $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }

    "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message | Add-Content -LiteralPath $resolvedLog -Encoding UTF8
}

if ($Mode -eq "cross-check") {
    $instruction = @"
You are Codex performing a cross-check review for the AUZA project.

Use the current workspace as the source of truth. Review against:
- doc/PRD_AUZA_HWP작성기.md
- doc/CLAUDE_CODEX_교차검토_파이프라인.md

Focus on:
- behavioural bugs
- regressions
- PRD mismatches
- missing tests
- risky edge cases

If you find issues, output markdown beginning with '## Debug Request'.
If you do not find blocking issues, output markdown beginning with '## Cross-check Result'.
Include concrete file paths, reproduction steps, and specific fix requests when possible.

Below is the review request from Claude:

$inputContent
"@
} else {
    $instruction = @"
You are Codex performing a re-check for the AUZA project after Claude has applied fixes.

Use the current workspace as the source of truth. Re-check against:
- doc/PRD_AUZA_HWP작성기.md
- doc/CLAUDE_CODEX_교차검토_파이프라인.md

Focus on:
- whether each reported finding is actually fixed
- whether the fix introduced regressions
- whether testing is sufficient

Output markdown beginning with '## Re-check Result'.
Be explicit about closed findings, remaining findings, regressions, and final completion judgment.

Below is the fix response from Claude:

$inputContent
"@
}

$outputDir = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

if (Test-Path -LiteralPath $resolvedOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Force
}

if (Test-Path -LiteralPath $resolvedLog) {
    Remove-Item -LiteralPath $resolvedLog -Force
}

Write-StatusFile -State "running" -Message "Codex $Mode started."
Write-LogLine -Message "Starting Codex $Mode. Input=$resolvedInput Output=$resolvedOutput"

try {
    $null = & {
        $instruction | codex exec `
            --skip-git-repo-check `
            --full-auto `
            -C $resolvedRoot `
            -o $resolvedOutput `
            -
    } 2>&1 | Tee-Object -FilePath $resolvedLog -Append

    if ($LASTEXITCODE -ne 0) {
        throw "codex exec exited with code $LASTEXITCODE"
    }

    if (-not (Test-Path -LiteralPath $resolvedOutput)) {
        throw "Codex did not produce an output file: $resolvedOutput"
    }

    Write-StatusFile -State "completed" -Message "Codex $Mode completed successfully." -FinishedAt ((Get-Date).ToString("o"))
    Write-LogLine -Message "Codex $Mode completed successfully."
    Write-Output $resolvedOutput
} catch {
    Write-StatusFile -State "failed" -Message $_.Exception.Message -FinishedAt ((Get-Date).ToString("o"))
    Write-LogLine -Message ("Codex {0} failed: {1}" -f $Mode, $_.Exception.Message)
    throw
}
