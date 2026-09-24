$ErrorActionPreference = 'Stop'
$archive = 'ackrate-rights-receipt.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/rights-receipt.zip' -OutFile $archive
  node -e "const f='ackrate-rights-receipt.zip',e='0092b6063999ea4c80bf19f85b42ebc9701960c65d47b3340949c04203ad113c',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
