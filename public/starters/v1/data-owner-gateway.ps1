$ErrorActionPreference = 'Stop'
$archive = 'ackrate-data-owner-gateway.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/data-owner-gateway.zip' -OutFile $archive
  node -e "const f='ackrate-data-owner-gateway.zip',e='86af0e9f918ecc6947b4c4ea635b13205c815219706377d03c2f12f49e0a8935',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
