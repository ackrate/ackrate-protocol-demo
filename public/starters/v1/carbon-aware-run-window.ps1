$ErrorActionPreference = 'Stop'
$archive = 'ackrate-carbon-aware-run-window.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/carbon-aware-run-window.zip' -OutFile $archive
  node -e "const f='ackrate-carbon-aware-run-window.zip',e='0e7a14d294e223795dd4aa4f0bc03428d24d37cef6b0254a4f58ac30378ada6b',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
