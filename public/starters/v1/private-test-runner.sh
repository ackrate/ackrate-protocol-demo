#!/bin/sh
set -eu
archive='ackrate-private-test-runner.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/private-test-runner.zip'
node -e "const f='ackrate-private-test-runner.zip',e='16e690a2c64f4b8cc71d7a1ab4024503b8fd836863bbe8062cf201c8ec066af5',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
