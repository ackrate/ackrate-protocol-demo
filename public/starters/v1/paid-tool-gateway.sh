#!/bin/sh
set -eu
archive='ackrate-paid-tool-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/paid-tool-gateway.zip'
node -e "const f='ackrate-paid-tool-gateway.zip',e='7fef24677456430696100985f492a29ab46faa7be0103806cd2d62bd8e514569',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
