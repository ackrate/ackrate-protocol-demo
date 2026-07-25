#!/bin/sh
set -eu
archive='reapp-page-snapshot-meter.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/page-snapshot-meter.zip'
node -e "const f='reapp-page-snapshot-meter.zip',e='b961d9f5c42266726787f248d8001886f096b95ae7899972ae14248ae48bd10e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
