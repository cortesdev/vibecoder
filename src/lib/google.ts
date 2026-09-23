import { env } from "./env";

export const google = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
};

export const googleEnabled = Boolean(google.clientId && google.clientSecret);

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const SCOPES = "openid email profile";

export function redirectUri(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: redirectUri(env.siteUrl),
    response_type: "code",
    scope: SCOPES,
    state,
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
}

export async function exchangeCode(code: string): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    code,
    client_id: google.clientId,
    client_secret: google.clientSecret,
    redirect_uri: redirectUri(env.siteUrl),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  const token = data.access_token;
  if (!token) throw new Error("no access_token in token response");
  return { accessToken: token };
}

export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!data.sub || !data.email) throw new Error("userinfo missing sub/email");
  return {
    sub: data.sub,
    email: data.email,
    emailVerified: data.email_verified ?? false,
    name: data.name ?? "",
    picture: data.picture ?? "",
  };
}