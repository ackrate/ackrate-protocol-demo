#!/bin/sh
set -eu
archive='ackrate-page-snapshot-meter.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/page-snapshot-meter.zip'
node -e "const f='ackrate-page-snapshot-meter.zip',e='c5f81b8870af2b1ffc5f5fe8b56a611a93b9a39cf5cd7ec97f01d927bc3c2f97',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
