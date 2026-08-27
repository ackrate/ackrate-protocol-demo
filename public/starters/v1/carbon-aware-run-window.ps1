$ErrorActionPreference = 'Stop'
$archive = 'ackrate-carbon-aware-run-window.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/carbon-aware-run-window.zip' -OutFile $archive
  node -e "const f='ackrate-carbon-aware-run-window.zip',e='4b72055ba674167994c086fe9dd51a587353cf118c4d7ee6f662ed8c41fa69cf',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
