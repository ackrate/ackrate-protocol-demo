$ErrorActionPreference = 'Stop'
$archive = 'ackrate-human-review-outbox.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/human-review-outbox.zip' -OutFile $archive
  node -e "const f='ackrate-human-review-outbox.zip',e='7b3259178a8f19038c54db9c89aac0003ec73d4f321ea700afd2ebfd00148535',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
