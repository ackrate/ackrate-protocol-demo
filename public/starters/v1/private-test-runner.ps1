$ErrorActionPreference = 'Stop'
$archive = 'ackrate-private-test-runner.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/private-test-runner.zip' -OutFile $archive
  node -e "const f='ackrate-private-test-runner.zip',e='bb5457c7878afd1ef2cc0b151e57bf18d4bfab445a41dfcb623ae4f7ff40fb2a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
