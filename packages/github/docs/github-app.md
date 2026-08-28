# Chevron GitHub App login

Inbox login is a **GitHub App** user-to-server token via the OAuth
**device flow**. There is no client secret in the editor. Classic PAT
paste remains as a fallback.

## Register the App (once)

1. Open https://github.com/organizations/builtbygio/settings/apps/new
2. Name: **Chevron**
3. Homepage URL: `https://github.com/builtbygio/chevron`
4. Uncheck **Webhook** (desktop client; no hook URL)
5. Permissions:
   - Repository: **Contents** read, **Issues** write, **Pull requests** write, **Metadata** read, **Checks** read, **Commit statuses** read
   - Organization: **Members** read
   - Account: **Email addresses** read
6. Where can this GitHub App be installed? **Any account**
7. After create: **Enable Device Flow**
8. Copy the **Client ID** (not the App ID)

## Point Chevron at the App

Settings → `github.oauthClientId`, or environment:

```
CHEVRON_GITHUB_CLIENT_ID=Iv1.xxxxxxxx
```

Install the App on the user/org that owns the repos you use, then
**Login with GitHub** in the GitHub dock. Authorize, enter the device
code, done.

User tokens start with `ghu_`. They expire (typically 8h); Chevron
stores the `ghr_` refresh token and refreshes automatically.

Fine-grained PATs still fail the classic scope check. Use the App or a
classic PAT (`repo`, `read:org`, `user:email`).
