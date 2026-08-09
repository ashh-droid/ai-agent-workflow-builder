# Deployment Checklist

The final assignment needs a hosted Nhost backend and a hosted Next.js frontend. Do this after GitHub CI is green.

## A. Nhost backend

1. Create a **new Nhost project** dedicated to this assignment.
2. Connect `ashh-droid/ai-agent-workflow-builder` as the deployment source, or use the Nhost CLI/Git deployment flow to apply this repository.
3. Configure strong Nhost/Hasura secrets and add `GEMINI_API_KEY` as a Nhost secret. Never copy the example values into production.
4. Deploy so Nhost applies `nhost/nhost.toml`, `nhost/migrations/default`, `nhost/metadata`, and `functions`.
5. Open Nhost/Hasura and verify metadata is consistent and all Event/Cron triggers are active.
6. Record the project subdomain, region, and GraphQL URL.
7. Create the four demo Auth users described in the README and run `npm run seed:demo` from a trusted terminal with the admin secret.
8. Before recording, set the final frontend URL in Nhost Auth's allowed client/redirection URLs.

## B. Vercel frontend — manual deployment

1. In Vercel choose **Add New → Project**.
2. Import `ashh-droid/ai-agent-workflow-builder`.
3. Keep the detected Next.js build settings.
4. Add only these browser-safe values:

```text
NEXT_PUBLIC_NHOST_SUBDOMAIN=<Nhost project subdomain>
NEXT_PUBLIC_NHOST_REGION=<Nhost project region>
NEXT_PUBLIC_NHOST_GRAPHQL_URL=https://<subdomain>.graphql.<region>.nhost.run/v1
```

5. Do **not** expose the Hasura admin secret, Gemini API key, webhook secrets, or notification credentials with `NEXT_PUBLIC_` names.
6. Deploy, add the Vercel origin to Nhost Auth's allowed URLs, and verify hosted sign-in.

## C. Hosted acceptance pass

Before recording, verify: owner can save the reviewer workflow; editor cannot add/change/remove owner-only nodes; viewer has no Run/save path; manual run streams without refresh; approval pauses/resumes; Gemini + HTTP succeed; DB result is persisted; webhook starts another run; at least one scheduled/database-event run works; quota settles; and Org B known-ID read/trigger/approve attempts fail.

## D. Submission

Submit the GitHub repository URL, Vercel URL, and short recording link. `WRITEUP.md`, migrations/metadata, the security smoke test, and the exact recording script are already versioned in this repository.
