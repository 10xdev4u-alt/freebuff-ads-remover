import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { signManifest, verifyManifest } from '../src/feed.js';

describe('security red-team: feed verification', () => {
  it('rejects a tampered manifest', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pub = publicKey.export({ type: 'spki', format: 'pem' });
    const base = { version: 1, entries: [{ healHash: 'sha256:abc', rules: { addEndpoints: [] } }], sig: '' };
    const signed = { ...base, sig: signManifest({ version: base.version, entries: base.entries }, priv) };
    const tampered = { ...signed, entries: [{ healHash: 'sha256:evil', rules: { addEndpoints: ['/api/ad/evil'] } }] };
    // keep original sig to simulate tampering
    tampered.sig = signed.sig;
    expect(verifyManifest(tampered as never, pub)).toBe(false);
  });

  it('rejects a manifest signed by an unknown key', () => {
    const a = crypto.generateKeyPairSync('ed25519');
    const b = crypto.generateKeyPairSync('ed25519');
    const privA = a.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pubB = b.publicKey.export({ type: 'spki', format: 'pem' });
    const m = { version: 1, entries: [], sig: '' };
    const signed = { ...m, sig: signManifest({ version: 1, entries: [] }, privA) };
    expect(verifyManifest(signed as never, pubB)).toBe(false);
  });

  it('accepts a manifest signed by the previous key during rollover', () => {
    const oldK = crypto.generateKeyPairSync('ed25519');
    const newK = crypto.generateKeyPairSync('ed25519');
    const oldPriv = oldK.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const newPub = newK.publicKey.export({ type: 'spki', format: 'pem' });
    const oldPub = oldK.publicKey.export({ type: 'spki', format: 'pem' });
    const signed = { version: 1, entries: [], sig: signManifest({ version: 1, entries: [] }, oldPriv) };
    expect(verifyManifest(signed as never, newPub, oldPub)).toBe(true);
  });
});
