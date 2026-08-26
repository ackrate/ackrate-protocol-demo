#!/bin/sh
set -eu
archive='ackrate-page-snapshot-meter.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/page-snapshot-meter.zip'
node -e "const f='ackrate-page-snapshot-meter.zip',e='59ceb152d0c2f73085aecf9be8dff411b5c4c5ab674abbf84c299b560611452f',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
