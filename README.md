# Fern

Real-time chat and team collaboration app.

**Stack:** React (Vite), Zustand, Tailwind, Socket.io, Node, Express, MongoDB, Redis.
## Google sign-in and sign-up

Both auth pages use Google Identity Services. New Google users get an account;
returning users sign in to the same Fern account. Existing password users must
enter their Fern password once to link Google. Their password continues to work.

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project.
2. Configure Google Auth Platform branding, audience and consent screen. While in
   testing, add the Google accounts you will test with as test users.
3. Create an OAuth client with application type **Web application**. Add
   `http://localhost:5173` to **Authorized JavaScript origins**. Add your exact
   deployed frontend origin when deploying. This popup flow needs no redirect URI
   and no client secret.
4. Put the same client ID in `server/.env` as `GOOGLE_CLIENT_ID` and in
   `client/.env` as `VITE_GOOGLE_CLIENT_ID`. Keep the existing environment values;
   `.env.example` files show the additional configuration. Restart both dev servers.
5. Run `npm install` in `server` and `client`, then `npm run dev` in each.

Use HTTPS in production. Rebuild the client after changing Vite environment values.
If Google reports an origin mismatch, check the scheme, hostname and port against
Authorized JavaScript origins. If the popup is blocked, allow popups for the app.

Verify with a new Google account, sign out and return using the same account,
then try an existing password account and its one-time linking password. Confirm
both accounts reach chat and retain their messages after refreshing. Automated
server tests mock Google verification; a live Google popup requires your client ID.

References: [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid),
[server token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
