$ErrorActionPreference = 'Stop'
$archive = 'ackrate-carbon-aware-run-window.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/carbon-aware-run-window.zip' -OutFile $archive
  node -e "const f='ackrate-carbon-aware-run-window.zip',e='d836debcff757ea74d97245764d8f5c7682512cd039e0766993a9167c3ae816e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
  if ($LASTEXITCODE -ne 0) { throw 'Starter integrity verification failed' }
  Expand-Archive -LiteralPath $archive -DestinationPath '.' -Force
  Remove-Item -LiteralPath $archive
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
  Write-Host ''
  Write-Host 'ACKRATE starter installed. Run: npm run demo'
} finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
