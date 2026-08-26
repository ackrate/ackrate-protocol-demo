$ErrorActionPreference = 'Stop'
$archive = 'ackrate-paid-tool-gateway.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/paid-tool-gateway.zip' -OutFile $archive
  node -e "const f='ackrate-paid-tool-gateway.zip',e='fe2b2f31408a3ff33483894188a38d25a49a64fac2206d531dfeeeba6d252a74',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
