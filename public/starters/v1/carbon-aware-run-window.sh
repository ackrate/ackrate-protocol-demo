#!/bin/sh
set -eu
archive='ackrate-carbon-aware-run-window.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/carbon-aware-run-window.zip'
node -e "const f='ackrate-carbon-aware-run-window.zip',e='0e7a14d294e223795dd4aa4f0bc03428d24d37cef6b0254a4f58ac30378ada6b',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
