#!/bin/sh
set -eu
archive='ackrate-research-source-scout.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/research-source-scout.zip'
node -e "const f='ackrate-research-source-scout.zip',e='f6e7e65d4ac11ad82430a3d63e6c72cdd1d700f56d2d7e9935544e0fa28f5bd7',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
