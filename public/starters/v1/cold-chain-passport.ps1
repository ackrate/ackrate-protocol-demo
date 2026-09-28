$ErrorActionPreference = 'Stop'
$archive = 'ackrate-cold-chain-passport.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/cold-chain-passport.zip' -OutFile $archive
  node -e "const f='ackrate-cold-chain-passport.zip',e='980357ee0ca28da1606dd87146bf891800c688550cd2cb27b3988f672a1b2d8e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
