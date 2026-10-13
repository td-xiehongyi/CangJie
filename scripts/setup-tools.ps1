$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    & node scripts/setup-cangjie.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Toolchain download or checksum failed' }
    $assets = @(
        @{ Zip='cangjie-sdk-windows-x64-1.0.5.zip'; Destination='.local-tools'; Folder='.local-tools/cangjie' },
        @{ Zip='cangjie-stdx-windows-x64-1.0.5.1.zip'; Destination='.local-tools/stdx'; Folder='.local-tools/stdx/windows_x86_64_cjnative' }
    )
    foreach ($asset in $assets) {
        if (Test-Path -LiteralPath $asset.Folder) {
            Write-Output "Retaining existing toolchain directory: $($asset.Folder)"
            continue
        }
        $archivePath = Join-Path $projectRoot ('.local-tools/' + $asset.Zip)
        $destinationPath = [IO.Path]::GetFullPath((Join-Path $projectRoot $asset.Destination))
        $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
        try {
            foreach ($entry in $archive.Entries) {
                $target = [IO.Path]::GetFullPath((Join-Path $destinationPath $entry.FullName))
                if (!$target.StartsWith($destinationPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
                    throw 'Archive path escapes destination'
                }
            }
        } finally { $archive.Dispose() }
        Expand-Archive -LiteralPath $archivePath -DestinationPath $destinationPath
    }
    & node scripts/doctor.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Toolchain environment check failed' }
} finally { Pop-Location }
