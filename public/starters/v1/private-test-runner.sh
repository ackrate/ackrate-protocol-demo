#!/bin/sh
set -eu
archive='ackrate-private-test-runner.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/private-test-runner.zip'
node -e "const f='ackrate-private-test-runner.zip',e='51fa8948509999876630044d763a31951f9aa3555501517cae505f2cecaffb47',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
