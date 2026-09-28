$ErrorActionPreference = 'Stop'
$archive = 'ackrate-api-tollgate.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/api-tollgate.zip' -OutFile $archive
  node -e "const f='ackrate-api-tollgate.zip',e='cc5942849a9cf78efbd3adda2e72b444ff9c0d00c487b50ce054d3c014201b1c',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
