$ErrorActionPreference = 'Stop'
$archive = 'reapp-api-tollgate.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/api-tollgate.zip' -OutFile $archive
  node -e "const f='reapp-api-tollgate.zip',e='e4ceaf5563eeeee2ddf6159fd1d4712a0bf333f63a8340017738ba02ed5753ca',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
