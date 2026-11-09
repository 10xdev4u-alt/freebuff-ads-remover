# Threat Model — Loop → Feed → Launcher

Assets:
- Feed signing key (root + intermediate)
- Promotion gate (corpus + red-team corpus)
- Launcher rule executor
- Truth-pass ledger and receipts

Adversaries:
- Forged feed entry (invalid signature)
- Compromised CI (stolen signing key)
- Malicious promoted rule (protected route collision)
- Replay / downgrade of an old manifest
- Sandbox escape via rule execution

Mitigations:
- Ed25519 signatures; launcher pins the root public key and verifies the chain.
- Key rotation with an offline root and a short-lived intermediate.
- Red-team corpus in CI: forged signals must not promote.
- Capability allowlist in the launcher; no eval of rule data.
- Truth-pass ledger requires provenance and a matching receipt hash.

Non-goals: full SLSA L3, custom HSM, dashboard.
