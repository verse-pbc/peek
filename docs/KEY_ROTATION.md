# Validation Service Key Rotation Guide

## Overview
The validation service uses Nostr keypairs for NIP-59 gift wrap communication. This guide explains how to rotate these keys when needed.

## When to Rotate Keys
- If the private key is compromised
- During regular security audits (recommended: every 6 months)
- When deploying to production for the first time

## Key Rotation Process

### 1. Generate New Keypair
From the PWA client directory:
```bash
cd packages/pwa-client
npm run generate-keypair
```

Save the output - you'll need:
- `nsec` for the validation service
- `Public key (hex)` for the PWA client

### 2. Update Validation Service
Edit `packages/validation-service/.env`:
```env
SERVICE_NSEC=nsec1... # New nsec from step 1
SERVICE_NPUB=npub1... # New npub from step 1
```

### 3. Update PWA Client
Edit `packages/pwa-client/.env`:
```env
VITE_VALIDATION_SERVICE_PUBKEY=... # New public key (hex) from step 1
```

### 4. Restart Services
```bash
# Stop both services
# Then restart:
npm run dev
```

### 5. Test the New Keys
1. Open the PWA in a browser
2. Try joining a community with location validation
3. Check logs for successful gift wrap communication

## Security Best Practices

1. **Never commit private keys**: Always use .env files (which are gitignored)
2. **Use environment variables in production**: Don't hardcode keys
3. **Store production keys securely**: Use a secrets manager like AWS Secrets Manager or HashiCorp Vault
4. **Rotate regularly**: Set up a schedule for key rotation
5. **Keep backups**: Store encrypted backups of production keys

## Troubleshooting

If validation fails after rotation:
1. Check that the public key in PWA matches the service's actual public key
2. Verify the service can decrypt gift wraps (check logs)
3. Ensure both services were restarted after key changes
4. Test with `curl` to verify the service is running

## Production Deployment

For production:
1. Generate production-specific keypairs
2. Store private key in secure secrets manager
3. Configure CI/CD to inject secrets at deploy time
4. Never use the development keys in production