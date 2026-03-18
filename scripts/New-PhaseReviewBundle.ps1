param(
    [Parameter(Mandatory = $true)]
    [string]$PhaseName,

    [string]$RootDir = (Get-Location).Path
)

$templatesDir = Join-Path $RootDir "doc\templates"
$reviewsDir = Join-Path $RootDir "doc\reviews"

if (-not (Test-Path -LiteralPath $templatesDir)) {
    throw "Templates directory not found: $templatesDir"
}

$safePhase = ($PhaseName -replace '[^a-zA-Z0-9_-]+', '_').Trim('_')
if ([string]::IsNullOrWhiteSpace($safePhase)) {
    throw "PhaseName must contain at least one letter or number."
}

$bundleName = "{0}_{1}" -f (Get-Date -Format "yyyy-MM-dd_HHmmss"), $safePhase
$bundleDir = Join-Path $reviewsDir $bundleName

New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $templatesDir "CROSS_CHECK_REQUEST.md") -Destination (Join-Path $bundleDir "01_CROSS_CHECK_REQUEST.md")
Copy-Item -LiteralPath (Join-Path $templatesDir "FIX_RESPONSE.md") -Destination (Join-Path $bundleDir "03_FIX_RESPONSE.md")

Write-Output $bundleDir
