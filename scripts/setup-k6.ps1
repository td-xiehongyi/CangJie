$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolDirectory = Join-Path $projectRoot '.local-tools'
$archivePath = Join-Path $toolDirectory 'k6-v2.3.0-windows-amd64.zip'
$expectedHash = '112276d495e5741c968e2bc09ea6196099c1275bd6db9ee0875d173c7148ce43'
New-Item -ItemType Directory -Force -Path $toolDirectory | Out-Null
if (!(Test-Path -LiteralPath $archivePath)) {
    & curl.exe -fL --retry 3 --connect-timeout 15 --max-time 180 -o $archivePath 'https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-windows-amd64.zip'
    if ($LASTEXITCODE -ne 0) { throw 'k6 download failed' }
}
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLower() -ne $expectedHash) { throw 'k6 checksum mismatch; existing file retained for inspection' }
$executable = Join-Path $toolDirectory 'k6-v2.3.0-windows-amd64/k6.exe'
if (!(Test-Path -LiteralPath $executable)) {
    $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        foreach ($entry in $archive.Entries) {
            $targetPath = [IO.Path]::GetFullPath((Join-Path $toolDirectory $entry.FullName))
            if (!$targetPath.StartsWith($toolDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'k6 archive path escape' }
        }
    } finally { $archive.Dispose() }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolDirectory
}
& $executable version
if ($LASTEXITCODE -ne 0) { throw 'k6 version probe failed' }
