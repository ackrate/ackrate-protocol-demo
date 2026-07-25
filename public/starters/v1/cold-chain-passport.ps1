$ErrorActionPreference = 'Stop'
$archive = 'reapp-cold-chain-passport.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/cold-chain-passport.zip' -OutFile $archive
  node -e "const f='reapp-cold-chain-passport.zip',e='1556db2ab6786838e0921c3bcbf259ccb96953f62043b7647c9c16aa99b0ab6a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
