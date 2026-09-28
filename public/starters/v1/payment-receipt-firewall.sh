#!/bin/sh
set -eu
archive='ackrate-payment-receipt-firewall.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/payment-receipt-firewall.zip'
node -e "const f='ackrate-payment-receipt-firewall.zip',e='faa82bf30d4cd6cf41d083e7993d78a326c831eb65f2fd71d6a86d66f5b00877',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
