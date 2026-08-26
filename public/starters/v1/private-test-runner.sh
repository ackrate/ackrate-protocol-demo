#!/bin/sh
set -eu
archive='ackrate-private-test-runner.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/private-test-runner.zip'
node -e "const f='ackrate-private-test-runner.zip',e='bb5457c7878afd1ef2cc0b151e57bf18d4bfab445a41dfcb623ae4f7ff40fb2a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
