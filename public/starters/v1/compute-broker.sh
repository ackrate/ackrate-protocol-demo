#!/bin/sh
set -eu
archive='reapp-compute-broker.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/compute-broker.zip'
node -e "const f='reapp-compute-broker.zip',e='40b920ce0594f16a5e3732b8d2547bc1a4068dab6c88f3a7845a3b9160843a6a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
