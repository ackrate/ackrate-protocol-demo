$ErrorActionPreference = 'Stop'
$archive = 'ackrate-private-test-runner.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/private-test-runner.zip' -OutFile $archive
  node -e "const f='ackrate-private-test-runner.zip',e='0bd916bfae18d38066ffab5720e48932e418f2be93ded85bccc75818024bbac9',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
