# EDOPro Web — 폰(adb) 헬퍼
#   사용:
#     .\_tools\adb.ps1 -Action status
#     .\_tools\adb.ps1 -Action reload   [-Url "https://sw20103.synology.me:8451/"]
#     .\_tools\adb.ps1 -Action tap -X 1000 -Y 370
#     .\_tools\adb.ps1 -Action text -Text "Hello"
#     .\_tools\adb.ps1 -Action key  -Key 4
#     .\_tools\adb.ps1 -Action shot -Out "D:\rea-out\_tmp\pw-mcp\phone.png"
#   ⚠ DeX(외부 모니터) 화면은 adb 캡처가 되지 않는다(폰 화면만).
param(
  [Parameter(Mandatory = $true)][ValidateSet('status','reload','tap','text','key','shot','start','stop')]
  [string]$Action,
  [string]$Url = 'https://sw20103.synology.me:8451/',
  [int]$X = 0, [int]$Y = 0,
  [string]$Text = '',
  [int]$Key = 4,
  [string]$Out = '',
  [string]$Package = 'com.naver.whale'
)

$ErrorActionPreference = 'Continue'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { $adb = 'D:\rea-out\_tmp\platform-tools\adb.exe' }
if (-not (Test-Path $adb)) { Write-Error "adb 를 찾을 수 없습니다"; exit 2 }

function Invoke-Adb { param([string[]]$Args) & $adb @Args 2>&1 }

switch ($Action) {
  'status' {
    Invoke-Adb @('devices')
  }
  'start' {
    Invoke-Adb @('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
    Invoke-Adb @('shell', 'wm', 'dismiss-keyguard')
    Invoke-Adb @('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', $Url, $Package)
  }
  'reload' {
    Invoke-Adb @('shell', 'am', 'force-stop', $Package)
    Start-Sleep -Milliseconds 500
    Invoke-Adb @('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', $Url, $Package)
  }
  'stop'   { Invoke-Adb @('shell', 'am', 'force-stop', $Package) }
  'tap'    { Invoke-Adb @('shell', 'input', 'tap', "$X", "$Y") }
  'text'   { Invoke-Adb @('shell', 'input', 'text', $Text) }
  'key'    { Invoke-Adb @('shell', 'input', 'keyevent', "$Key") }
  'shot'   {
    if (-not $Out) { $Out = Join-Path $env:TEMP 'phone.png' }
    $dir = Split-Path $Out -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $tmp = Join-Path $env:TEMP ('shot_{0}.png' -f (Get-Random))
    Invoke-Adb @('exec-out', 'screencap', '-p') | Out-Null
    & $adb exec-out screencap -p > $tmp
    Copy-Item $tmp $Out -Force
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    "saved: $Out ({0:N0}B)" -f (Get-Item $Out).Length
  }
}
