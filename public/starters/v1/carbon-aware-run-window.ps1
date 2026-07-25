$ErrorActionPreference = 'Stop'
$archive = 'reapp-carbon-aware-run-window.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/carbon-aware-run-window.zip' -OutFile $archive
  node -e "const f='reapp-carbon-aware-run-window.zip',e='dd8fefae525f2ef3a6f262e3bbcf019fa6ad9b58ebbf913b9a6ed68e95bc5860',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
