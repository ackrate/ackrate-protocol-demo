$ErrorActionPreference = 'Stop'
$archive = 'ackrate-rights-receipt.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/rights-receipt.zip' -OutFile $archive
  node -e "const f='ackrate-rights-receipt.zip',e='6026a2762d676e191b8ac2d9b9b26f057aa8ce7cf7f5e8bfc8f73fa96f27293b',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
