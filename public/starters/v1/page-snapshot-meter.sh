#!/bin/sh
set -eu
archive='ackrate-page-snapshot-meter.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/page-snapshot-meter.zip'
node -e "const f='ackrate-page-snapshot-meter.zip',e='d1aa85af914b3ad41d1fce0f51cef1771824ce0c71bb36eea3ae816e851d5cba',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
