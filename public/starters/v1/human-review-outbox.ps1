$ErrorActionPreference = 'Stop'
$archive = 'ackrate-human-review-outbox.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/human-review-outbox.zip' -OutFile $archive
  node -e "const f='ackrate-human-review-outbox.zip',e='183fbba7b62a716bf9fa54d0d022bb2e41543054cef61b2180db89e15519c8d3',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
