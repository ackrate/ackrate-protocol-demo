#!/bin/sh
set -eu
archive='ackrate-compute-broker.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/compute-broker.zip'
node -e "const f='ackrate-compute-broker.zip',e='e757ba1c1f428ef2101a652fea28d1af4d5fba67c903249c40c48dc74beadd50',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
