#!/bin/sh
set -eu
archive='ackrate-compute-broker.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/compute-broker.zip'
node -e "const f='ackrate-compute-broker.zip',e='a14f9dc5fe5994a073bdb02b8b895dfd93bda9fe9fd08b878614f34f17d3bc04',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
