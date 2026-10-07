$ErrorActionPreference = 'Stop'
$archive = 'ackrate-multi-agent-workflow.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/multi-agent-workflow.zip' -OutFile $archive
  node -e "const f='ackrate-multi-agent-workflow.zip',e='4dac6654a61f8a572c62fdc019ac8cd736cfa3e99cf2e0a6301c9c8a50448be5',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
