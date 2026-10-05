$ErrorActionPreference = 'Stop'
$archive = 'ackrate-research-source-scout.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/research-source-scout.zip' -OutFile $archive
  node -e "const f='ackrate-research-source-scout.zip',e='90d9f07224d3dd4d9b7ca5efdd2e70b9e9497b2fbe30dadbf3cdc7e292621163',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
