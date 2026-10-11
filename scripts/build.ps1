# Собирает dist\YMusicMod-Setup.exe (нужны Node.js для сборки и .NET Framework 4.x, который есть в Windows).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root 'build'
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $build, $dist | Out-Null

if (-not (Test-Path (Join-Path $root 'node_modules'))) { Push-Location $root; npm install --silent; Pop-Location }
$payload = Join-Path $build 'payload'
node (Join-Path $root 'scripts\patch.mjs') --emit-payload $payload
if ($LASTEXITCODE -ne 0) { throw 'payload build failed' }

& (Join-Path $PSScriptRoot 'make-icon.ps1') -Png (Join-Path $root 'assets\logo.png') -Ico (Join-Path $build 'icon.ico')

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$out = Join-Path $dist 'YMusicMod-Setup.exe'
$src = Join-Path $root 'src\installer'
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/out:$out" "/win32icon:$(Join-Path $build 'icon.ico')" `
  /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll `
  "/resource:$payload\scheme.js,scheme.js" "/resource:$payload\main.js,main.js" "/resource:$payload\preload.js,preload.js" "/resource:$payload\version.txt,version.txt" "/resource:$(Join-Path $root 'assets\logo-256.png'),logo.png" `
  (Join-Path $src 'Program.cs') (Join-Path $src 'Patcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'csc failed' }
Write-Host "OK: $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"
