$ErrorActionPreference = 'SilentlyContinue'
$r = @()
$r += '========== AUZA Environment Check =========='
$r += 'Date: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
$r += ''
$os = Get-CimInstance Win32_OperatingSystem
$r += '[OS] ' + $os.Caption + ' (' + $os.OSArchitecture + ') Build ' + $os.BuildNumber
$arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
$r += '[Arch] ' + $arch
$ram = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$r += '[RAM] ' + $ram + 'GB'
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$free = [math]::Round($disk.FreeSpace / 1GB, 1)
$r += '[Disk] C: ' + $free + 'GB free'
$r += ''

$pyFound = $false
foreach ($v in @('313','312','311','310')) {
    $p = "$env:LOCALAPPDATA\Programs\Python\Python$v\python.exe"
    if (!$pyFound -and (Test-Path $p)) {
        $ver = & $p --version 2>&1
        $r += '[Python] ' + $ver + ' (' + $p + ')'
        $pyFound = $true
    }
}
if (!$pyFound) { try { $ver = & py --version 2>&1; if ($LASTEXITCODE -eq 0) { $r += '[Python] ' + $ver + ' (py)'; $pyFound = $true } } catch {} }
if (!$pyFound) { try { $ver = & python --version 2>&1; if ($ver -match 'Python') { $r += '[Python] ' + $ver + ' (PATH)'; $pyFound = $true } } catch {} }
if (!$pyFound) { $r += '[Python] NOT INSTALLED' }
$r += ''

$dll = "$env:SystemRoot\System32\vcruntime140.dll"
if (Test-Path $dll) {
    $dv = (Get-Item $dll).VersionInfo.FileVersion
    $r += '[VC++ Runtime] vcruntime140.dll v' + $dv
} else {
    $r += '[VC++ Runtime] NOT FOUND'
    $r += '  Download: https://aka.ms/vs/17/release/vc_redist.x64.exe'
}
$dll2 = "$env:SystemRoot\System32\vcruntime140_1.dll"
if (Test-Path $dll2) {
    $dv2 = (Get-Item $dll2).VersionInfo.FileVersion
    $r += '[VC++ Runtime_1] v' + $dv2
} else {
    $r += '[VC++ Runtime_1] NOT FOUND'
}
$r += ''

$hwpOk = $false
foreach ($h in @("$env:ProgramFiles\HNC\Hwp 2024\Hwp.exe", "${env:ProgramFiles(x86)}\HNC\Hwp 2024\Hwp.exe", "$env:ProgramFiles\HNC\Office 2024\HCell\Hwp.exe", "$env:ProgramFiles\HNC\Office NEO\HCell\Hwp.exe")) {
    if (!$hwpOk -and (Test-Path $h)) {
        $hv = (Get-Item $h).VersionInfo.FileVersion
        $r += '[HWP] v' + $hv + ' (' + $h + ')'
        $hwpOk = $true
    }
}
if (!$hwpOk) { $r += '[HWP] NOT FOUND' }
$r += ''

try {
    $t = [Type]::GetTypeFromProgID('HWPFrame.HwpObject.1')
    if ($t) { $r += '[HWP COM] Registered' } else { $r += '[HWP COM] NOT registered' }
} catch { $r += '[HWP COM] Check failed' }
$r += ''

try {
    $null = Invoke-WebRequest -Uri 'https://www.python.org' -UseBasicParsing -TimeoutSec 5
    $r += '[Internet] OK'
} catch {
    $r += '[Internet] FAILED'
}
$r += ''

foreach ($ap in @("$env:LOCALAPPDATA\Programs\auza", "$env:LOCALAPPDATA\Programs\AUZA-v2", "$env:APPDATA\AUZA-v2")) {
    if (Test-Path $ap) {
        $sz = [math]::Round((Get-ChildItem $ap -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB, 1)
        $r += '[AUZA Path] ' + $ap + ' (' + $sz + 'MB)'
        $tp = Join-Path $ap 'resources\python-embed\Lib\site-packages\torch'
        if (Test-Path $tp) { $r += '  -> torch exists' }
    }
}
$r += ''
$r += '=========================================='

$out = $r -join "`n"
Write-Host $out
$out | Set-Clipboard
Write-Host ''
Write-Host '[Copied to clipboard - Ctrl+V to paste]' -ForegroundColor Green
