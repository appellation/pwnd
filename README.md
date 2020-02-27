# pwnd

A P2P secret manager.

- [x] CLI application
- [ ] Browser plugin
- [ ] Desktop application

Core in Rust, compiled to WASM for targeting browser plugins and desktop (Electron).

## Encryption

AES256 at rest, ECC256 (X25519 curve) for asymmetric encryption over the wire.

Private key is randomly generated at first start and stored physically on the device. User creates
a master passphrase to decrypt this key.

Private key is used for at-rest and network encryption.

## Synchronization

Secrets are exchanged between clients using WebRTC. Connections will be one-time and last as long
as possible. No effort will be made to persist connections forever.

Client B decrypts a secret from Client A using Client A's public key. Public keys are exchanged
using physical proof such as QR code or physical device.

## Glossary

- Key: a public/private key-pair
- Secret: a value the user would like to keep protected from the bad people
- Client: a supported device owned by the user that is running the application
