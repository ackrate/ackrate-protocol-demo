#!/bin/sh
set -eu
archive='ackrate-payment-receipt-firewall.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/payment-receipt-firewall.zip'
node -e "const f='ackrate-payment-receipt-firewall.zip',e='84fecbf8ce1edb6b3f652b2cce7c07376734aea615c577d7574015026a2e2c90',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
