#!/bin/sh
set -eu
archive='ackrate-private-test-runner.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/private-test-runner.zip'
node -e "const f='ackrate-private-test-runner.zip',e='ae89a3c64e50b611ab1ee3e759f9fc3300ed5584e5e90a75152b4c4016370d0b',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
