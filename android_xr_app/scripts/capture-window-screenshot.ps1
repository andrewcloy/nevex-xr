param(
    [Parameter(Mandatory = $true)]
    [string]$WindowTitleContains,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$nativeSource = @"
using System;
using System.Runtime.InteropServices;

public static class NevexWindowCaptureNative
{
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

Add-Type -TypeDefinition $nativeSource

$targetWindow = Get-Process |
    Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Contains($WindowTitleContains) } |
    Select-Object -First 1

if (-not $targetWindow) {
    throw "No window found containing title fragment '$WindowTitleContains'."
}

$shell = New-Object -ComObject WScript.Shell
$shell.SendKeys('%')
Start-Sleep -Milliseconds 150
$null = $shell.AppActivate($targetWindow.Id)
[void]$shell.AppActivate($targetWindow.MainWindowTitle)
[NevexWindowCaptureNative]::ShowWindowAsync($targetWindow.MainWindowHandle, 9) | Out-Null
[NevexWindowCaptureNative]::SetForegroundWindow($targetWindow.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 800

$virtualBounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $virtualBounds.Width, $virtualBounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(
    $virtualBounds.Location,
    [System.Drawing.Point]::Empty,
    $virtualBounds.Size
)

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Saved window screenshot to $OutputPath"
