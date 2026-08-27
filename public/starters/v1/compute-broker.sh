#!/bin/sh
set -eu
archive='ackrate-compute-broker.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/compute-broker.zip'
node -e "const f='ackrate-compute-broker.zip',e='80c8ad5226817b4ee8191208b210c8f5be918de79827d70f0f54394fe43f8a8a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
