#!/bin/sh
set -eu
archive='reapp-research-source-scout.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/research-source-scout.zip'
node -e "const f='reapp-research-source-scout.zip',e='d2d3ad6db8ea23830395c557a1ffef3319ee2406ba5b6a286079a3cf2b89fe6e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
