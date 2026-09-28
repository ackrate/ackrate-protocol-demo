$ErrorActionPreference = 'Stop'
$archive = 'ackrate-human-review-outbox.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/human-review-outbox.zip' -OutFile $archive
  node -e "const f='ackrate-human-review-outbox.zip',e='4b60c7b8f779ec8e965823467c17b811be16c93ec5ad2f05d8543ab64409262a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
