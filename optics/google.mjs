import { createPublicKey, randomBytes, verify } from 'node:crypto';

export const random = (bytes = 32) => randomBytes(bytes).toString('base64url');
const issuer = 'https://accounts.google.com';

export function googleAuthorization(config, state, nonce, challenge) {
  return issuer + '/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callback,
    scope: 'openid email profile',
    response_type: 'code',
    prompt: 'select_account',
    state, nonce, code_challenge: challenge, code_challenge_method: 'S256'
  });
}

async function json(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Google authentication request failed');
  return response.json();
}

export async function googleIdentity(config, code, nonce, verifier) {
  const { id_token: token } = await json('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.callback,
      grant_type: 'authorization_code',
      code, code_verifier: verifier
    })
  });
  const [header, claims, signature] = token.split('.');
  const read = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  const metadata = read(header);
  const identity = read(claims);
  if (metadata.alg !== 'RS256' || ![issuer, 'accounts.google.com'].includes(identity.iss) ||
      identity.aud !== config.clientId || !(identity.exp > Date.now() / 1000) ||
      identity.nonce !== nonce || identity.email_verified !== true || !identity.email || !identity.sub) {
    throw new Error('Invalid Google ID token');
  }
  const { keys } = await json('https://www.googleapis.com/oauth2/v3/certs');
  const key = keys.find(key => key.kid === metadata.kid && key.kty === 'RSA');
  if (!key || !verify('RSA-SHA256', Buffer.from(header + '.' + claims),
    createPublicKey({ key, format: 'jwk' }), Buffer.from(signature, 'base64url'))) {
    throw new Error('Invalid Google signature');
  }
  return identity;
}
