#!/bin/sh
set -eu
archive='ackrate-paid-tool-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/paid-tool-gateway.zip'
node -e "const f='ackrate-paid-tool-gateway.zip',e='bce929cb608f41c04f22f18750ca74def3d7caac901a0a28378216dd7a42b523',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
