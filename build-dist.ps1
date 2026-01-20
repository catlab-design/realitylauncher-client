$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputDir = "release-$timestamp"

Write-Host "Building to: $outputDir"
Write-Host ""

$totalStart = Get-Date

Write-Host "[1/2] Running: bun run build"
$buildStart = Get-Date
bun run build
$buildEnd = Get-Date
$buildDuration = $buildEnd - $buildStart
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed after $($buildDuration.TotalSeconds) seconds"
    exit $LASTEXITCODE
}
Write-Host "[1/2] bun run build completed in $($buildDuration.TotalSeconds) seconds"
Write-Host ""

Write-Host "[2/2] Running: electron-builder"
$ebStart = Get-Date
bunx electron-builder --config.directories.output=$outputDir
$ebEnd = Get-Date
$ebDuration = $ebEnd - $ebStart
if ($LASTEXITCODE -ne 0) {
    Write-Host "electron-builder failed after $($ebDuration.TotalSeconds) seconds"
    exit $LASTEXITCODE
}
Write-Host "[2/2] electron-builder completed in $($ebDuration.TotalSeconds) seconds"
Write-Host ""

$totalEnd = Get-Date
$totalDuration = $totalEnd - $totalStart
Write-Host "========================================"
Write-Host "Build Summary"
Write-Host "  bun run build:     $($buildDuration.TotalSeconds) sec"
Write-Host "  electron-builder:  $($ebDuration.TotalSeconds) sec"
Write-Host "  TOTAL:             $($totalDuration.TotalSeconds) sec"
Write-Host "========================================"
