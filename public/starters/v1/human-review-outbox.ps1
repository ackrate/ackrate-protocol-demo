$ErrorActionPreference = 'Stop'
$archive = 'reapp-human-review-outbox.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/human-review-outbox.zip' -OutFile $archive
  node -e "const f='reapp-human-review-outbox.zip',e='4916715620a257dc44f7264bb16f58d79b30c76607a0adc7a65fb6466b528fde',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
  if ($LASTEXITCODE -ne 0) { throw 'Starter integrity verification failed' }
  Expand-Archive -LiteralPath $archive -DestinationPath '.' -Force
  Remove-Item -LiteralPath $archive
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
  Write-Host ''
  Write-Host 'REAPP starter installed. Run: npm run demo'
} finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
