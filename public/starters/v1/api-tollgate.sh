#!/bin/sh
set -eu
archive='reapp-api-tollgate.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/api-tollgate.zip'
node -e "const f='reapp-api-tollgate.zip',e='e4ceaf5563eeeee2ddf6159fd1d4712a0bf333f63a8340017738ba02ed5753ca',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
