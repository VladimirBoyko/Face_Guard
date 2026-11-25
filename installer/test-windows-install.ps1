$ErrorActionPreference = 'Stop'
$programs = [Environment]::GetFolderPath('Programs')
$installedApp = Join-Path $env:LOCALAPPDATA 'FaceGuard\FaceGuard.exe'
$setup = (Resolve-Path 'out/make/squirrel.windows/x64/FaceGuard-Setup.exe').Path

function Get-FaceGuardShortcut {
    Get-ChildItem -LiteralPath $programs -Recurse -Filter 'FaceGuard.lnk' -File
}

if ((Test-Path -LiteralPath $installedApp) -or (Get-FaceGuardShortcut)) {
    throw 'This test requires a clean Windows user profile without FaceGuard.'
}

$installer = Start-Process -FilePath $setup -PassThru
$shell = New-Object -ComObject WScript.Shell
$deadline = [DateTime]::UtcNow.AddSeconds(90)
do {
    $installer.Refresh()
    if ($installer.HasExited -and $installer.ExitCode -ne 0) {
        throw "FaceGuard Setup failed with exit code $($installer.ExitCode)."
    }
    foreach ($file in (Get-FaceGuardShortcut)) {
        $shortcut = $shell.CreateShortcut($file.FullName)
        if ($shortcut.TargetPath -eq $installedApp -and
            (Test-Path -LiteralPath $installedApp -PathType Leaf)) {
            Write-Output 'FaceGuard Start menu shortcut points to the installed app.'
            exit 0
        }
    }
    Start-Sleep -Seconds 2
} while ([DateTime]::UtcNow -lt $deadline)
throw 'One run of FaceGuard Setup did not create a valid Start menu shortcut.'
