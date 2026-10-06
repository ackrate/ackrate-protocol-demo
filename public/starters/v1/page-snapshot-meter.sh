#!/bin/sh
set -eu
archive='ackrate-page-snapshot-meter.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/page-snapshot-meter.zip'
node -e "const f='ackrate-page-snapshot-meter.zip',e='672c7e7f0d9a0b245ccc3974169112b9af6768499081b58641673ab5213c3bee',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
