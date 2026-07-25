$ErrorActionPreference = 'Stop'
$archive = 'reapp-research-source-scout.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/research-source-scout.zip' -OutFile $archive
  node -e "const f='reapp-research-source-scout.zip',e='d2d3ad6db8ea23830395c557a1ffef3319ee2406ba5b6a286079a3cf2b89fe6e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
