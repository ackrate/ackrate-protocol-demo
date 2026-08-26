$ErrorActionPreference = 'Stop'
$archive = 'ackrate-cold-chain-passport.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/cold-chain-passport.zip' -OutFile $archive
  node -e "const f='ackrate-cold-chain-passport.zip',e='952e904a4457755150a60ba85cfd5aaf0125fe5413288f241bbe3e06971abfe1',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
