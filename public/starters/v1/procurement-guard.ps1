$ErrorActionPreference = 'Stop'
$archive = 'reapp-procurement-guard.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/procurement-guard.zip' -OutFile $archive
  node -e "const f='reapp-procurement-guard.zip',e='33acc269babd8a293ab23fff130b72c299b82fac04ac4bd087f7db862e6c47c3',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
