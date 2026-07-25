#!/bin/sh
set -eu
archive='reapp-private-test-runner.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/private-test-runner.zip'
node -e "const f='reapp-private-test-runner.zip',e='e5c63c2a6d5a1921400aa60905e5648c014ebbfb798465d6a8cf57ed21f3bc40',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
