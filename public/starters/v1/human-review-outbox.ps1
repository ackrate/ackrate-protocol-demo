$ErrorActionPreference = 'Stop'
$archive = 'ackrate-human-review-outbox.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/human-review-outbox.zip' -OutFile $archive
  node -e "const f='ackrate-human-review-outbox.zip',e='b8907da94abc29b8942d91a1db1251df37667d5b00e9cfde96fe8b177674bda1',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
