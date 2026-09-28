$ErrorActionPreference = 'Stop'
$archive = 'ackrate-paid-tool-gateway.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/paid-tool-gateway.zip' -OutFile $archive
  node -e "const f='ackrate-paid-tool-gateway.zip',e='c6a22a8287ee3b744747d7a37414a31d2ce5341d3dda12a2bc2eb0ffa7545e64',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
