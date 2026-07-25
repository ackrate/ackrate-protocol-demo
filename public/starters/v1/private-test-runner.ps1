$ErrorActionPreference = 'Stop'
$archive = 'reapp-private-test-runner.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/private-test-runner.zip' -OutFile $archive
  node -e "const f='reapp-private-test-runner.zip',e='e5c63c2a6d5a1921400aa60905e5648c014ebbfb798465d6a8cf57ed21f3bc40',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
