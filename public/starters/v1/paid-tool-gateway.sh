#!/bin/sh
set -eu
archive='reapp-paid-tool-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/paid-tool-gateway.zip'
node -e "const f='reapp-paid-tool-gateway.zip',e='ae0571b90b4cc9da80667d71fe8a994931ae48423b7c8e0008847812d96fd35a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
