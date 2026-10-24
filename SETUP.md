# Setting up Jo-CHF (one time)

The website is already live in demo mode on GitHub Pages. These steps switch on the real backend.

## 1. Cloudflare account and token
1. Create a free account at https://dash.cloudflare.com (or use the existing one).
2. Copy your **Account ID** (right side of the account home page).
3. Go to **My Profile → API Tokens → Create Token → Create Custom Token**:
   - Permissions: `Account · Workers Scripts · Edit` and `Account · D1 · Edit`
   - Account resources: your account
4. Create the token and copy it (it is shown once).

## 2. GitHub repository secrets
In the repository: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 1 |
| `PII_KEY` | a long random text (at least 24 characters). **Keep a copy in a safe place. If it is lost, encrypted identifiers and backups cannot be read.** |

Optional, for password-reset emails: `BREVO_API_KEY` and set `MAIL_FROM` in `worker/wrangler.toml`.

## 3. Deploy
**Actions → Deploy backend → Run workflow.** The workflow:
- creates the D1 database `jo-chf` if it does not exist and creates the tables,
- deploys the Worker and its secrets,
- checks `/health`,
- writes the backend address into `config.js` and commits it, so the website switches to live mode.

## 4. First administrator
Open the website. Because the registry has no administrator yet, it shows **Create the first administrator**. Do this immediately. After that the screen disappears for everyone.

Then:
1. **Centers & targets**: add each center (code + name + target).
2. **Study settings**: confirm window start, target doses, KCCQ text.
3. Send the guide link to the site teams: `https://aymankatwa-png.github.io/jo-chf/guide/`.
4. Approve their requests in **Users**.

## Backups
- Cloudflare D1 keeps a 30-day point-in-time history (Time Travel): `npx wrangler d1 time-travel restore jo-chf --timestamp=<ISO time>`.
- **Daily backup** workflow saves an encrypted copy (AES-256 with `PII_KEY`) as a workflow artifact for 90 days.
  To restore: download the artifact, then
  `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in jochf-DATE.sql.gz.enc -out jochf.sql.gz -pass pass:<PII_KEY>`
  `gunzip jochf.sql.gz && npx wrangler d1 execute jo-chf --remote --file=jochf.sql`

## Cost and limits
Everything above runs on free plans for a pilot. For the full registry (1,000 patients, many users), the **Cloudflare Workers Paid plan (5 USD per month)** is recommended: it removes the 10 ms CPU limit per request that larger analytics requests can reach.

## Custom domain (optional)
To use, for example, `jochf.example.org`: add it in the repository Pages settings, add the DNS record, and add the address to `ALLOWED_ORIGINS` in `worker/wrangler.toml`.
