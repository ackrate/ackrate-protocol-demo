$ErrorActionPreference = 'Stop'
$archive = 'ackrate-compute-broker.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/compute-broker.zip' -OutFile $archive
  node -e "const f='ackrate-compute-broker.zip',e='80c8ad5226817b4ee8191208b210c8f5be918de79827d70f0f54394fe43f8a8a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
