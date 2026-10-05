$ErrorActionPreference = 'Stop'
$archive = 'ackrate-private-test-runner.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/private-test-runner.zip' -OutFile $archive
  node -e "const f='ackrate-private-test-runner.zip',e='23930ebc7f6dbd6521f61d5efb3b4ca5bef8b3e489264f10788541cd2286dde5',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
