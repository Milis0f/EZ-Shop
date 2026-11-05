# Builds EZ-Shop.exe at the root of the project, with the C# compiler that ships with Windows.
# The exe starts the production server, opens EZ-Shop in its own window and stops the server when it closes.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { throw "C# compiler not found: $csc" }
$icon = Join-Path $root 'src\app\favicon.ico'
$out = Join-Path $root 'EZ-Shop.exe'
$args = @('/nologo', '/target:winexe', '/optimize+', "/out:$out", '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll')
if (Test-Path -LiteralPath $icon) { $args += "/win32icon:$icon" }
$args += (Join-Path $here 'EZShopLauncher.cs')
& $csc @args
if ($LASTEXITCODE -ne 0) { throw "Build failed ($LASTEXITCODE)" }
Write-Output "Built $out"
