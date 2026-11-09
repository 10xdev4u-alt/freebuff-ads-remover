#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
const dir = process.argv[2] || '/tmp/keys';
fs.mkdirSync(dir, { recursive: true });
const root = crypto.generateKeyPairSync('ed25519');
const inter = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(dir + '/root-private.pem', root.privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync(dir + '/root-public.pem', root.publicKey.export({ type: 'spki', format: 'pem' }));
fs.writeFileSync(dir + '/intermediate-private.pem', inter.privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync(dir + '/intermediate-public.pem', inter.publicKey.export({ type: 'spki', format: 'pem' }));
// root signs intermediate public key
const sig = crypto.sign(null, Buffer.from(inter.publicKey.export({ type: 'spki', format: 'pem' })), root.privateKey);
fs.writeFileSync(dir + '/intermediate.sig', sig.toString('base64'));
console.log(JSON.stringify({ dir, rootPublic: root.publicKey.export({ type: 'spki', format: 'pem' }).toString().trim(), intermediatePublic: inter.publicKey.export({ type: 'spki', format: 'pem' }).toString().trim() }, null, 2));
