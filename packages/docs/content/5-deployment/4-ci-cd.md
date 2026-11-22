---
title: CI/CD
icon: cloud-upload
---

# CI/CD

A deploy from CI is the same command as from your machine, without the questions:

```sh
npm ci                                  # also runs space gen
npm test
npx space deploy --stage prod --yes
```

`--yes` approves Alchemy's plan without asking. The app's variables come from the CI's environment, so no `.env.<stage>` file is needed: set each field of `configs/env.ts` as a CI variable, its secrets as CI secrets.

## Cloudflare credentials

On your machine, the first deploy signs you in through the browser. CI can't, so give it an API token:

1. In the Cloudflare dashboard, **My Profile → API Tokens → Create Token**, start from the **Edit Cloudflare Workers** template.
2. Keep what the template has, and add:

   | Permission                        | For                                                    |
   | --------------------------------- | ------------------------------------------------------ |
   | Account → **Secrets Store: Edit** | every app: the key to Alchemy's deploy state           |
   | Account → **D1: Edit**            | D1 databases, as the scaffolded app has                |
   | Account → **Queues: Edit**        | `app/queues/`                                          |
   | Zone → **Zone: Read**             | a [domain](1-cloudflare.md#a-domain), to find its zone |

   Secrets Store needs **Edit** even to read the key: Alchemy reads it through a temporary Worker bound to it.

3. Under **Account Resources** pick the account, and under **Zone Resources** its zones.
4. Store the token as `CLOUDFLARE_API_TOKEN` in the CI's secrets, and your account's ID (on the **Workers & Pages** overview) as `CLOUDFLARE_ACCOUNT_ID`.

Alchemy keeps the deploy state in the account too, so CI and your machine see the same deploys and either can deploy next.

## Cloudflare dashboard

[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) deploys on every push to a branch, from a repository you link in the dashboard. The app needs no Wrangler file: you replace the default `npx wrangler deploy` with `space deploy`.

1. Deploy once from your machine, with the production values in `.env.prod`, so the Worker exists:

   ```sh
   npx space deploy --stage prod
   ```

2. In **Workers & Pages**, open that Worker, named like `<app>-worker-prod-<id>`, then **Settings → Builds → Connect**, and pick the repository. Don't use **Create application**: Alchemy names the Worker itself, so you'd get a second, unused one.

3. Set the build:

   | Setting            | Value                                                                                                          |
   | ------------------ | -------------------------------------------------------------------------------------------------------------- |
   | **Git branch**     | `main`                                                                                                         |
   | **Build command**  | `npm test`, or empty: the deploy builds the app                                                                |
   | **Deploy command** | `npx space deploy --stage prod --yes`                                                                          |
   | **Preview builds** | off: their default, `wrangler preview`, needs a Wrangler file                                                  |
   | **Root directory** | the app's folder, if it isn't the repository's root                                                            |
   | **API token**      | the token from [Cloudflare credentials](#cloudflare-credentials), not a generated one, which lacks permissions |

4. Under **Build variables and secrets**, add:

   - `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` as a secret, with the same token;
   - what `.env.prod` has, as it isn't committed: the fields of `configs/env.ts`, and any `DB_<NAME>_*` and `OTEL_*` variables, with secrets as secrets.

5. Push to `main`. The build installs the dependencies, which runs `space gen`, then runs the two commands.

> [!WARNING]
> Change the app's variables in **Build variables and secrets**, then deploy again. A deploy doesn't read the Worker's own **Variables and Secrets**, and replaces the plain variables set there.

For another stage, such as `staging`, do the same with that stage's Worker, its branch and `--stage staging`. For a stage per pull request, use [GitHub Actions](#a-stage-per-pull-request): Workers Builds has no step to destroy a stage when the pull request closes.

Workers Builds has its own default versions of Node and the package managers. If installing fails there but works on your machine, pin yours with `packageManager` in `package.json` and a `.node-version` file.

## GitHub

Deploy `main` to `prod` after the tests pass:

```yaml [.github/workflows/deploy.yml]
name: Deploy

on:
  push:
    branches: [main]

concurrency: deploy-prod

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npx space deploy --stage prod --yes
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          # configs/env.ts's fields:
          SITE_URL: ${{ vars.SITE_URL }}
          STRIPE_KEY: ${{ secrets.STRIPE_KEY }}
```

`concurrency` keeps two deploys of the same stage from running at once.

### A stage per pull request

Each pull request gets its own copy of the app, and loses it when it closes:

```yaml [.github/workflows/preview.yml]
name: Preview

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

concurrency: preview-${{ github.event.number }}

jobs:
  preview:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      SITE_URL: https://pr-${{ github.event.number }}.example.com
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - if: github.event.action != 'closed'
        run: npx space deploy --stage pr-${{ github.event.number }} --yes
      - if: github.event.action == 'closed'
        run: npx space destroy --stage pr-${{ github.event.number }} --yes
```

## GitLab

```yaml [.gitlab-ci.yml]
default:
  image: node:22
  cache:
    paths: [.npm/]
  before_script:
    - npm ci --cache .npm --prefer-offline

stages: [test, deploy]

test:
  stage: test
  script:
    - npm test

deploy:
  stage: deploy
  resource_group: prod
  script:
    - npx space deploy --stage prod --yes
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

Set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and the app's variables in **Settings → CI/CD → Variables**, masked and protected for the secrets. `resource_group` keeps two deploys of the stage from running at once.

## A Bun app from CI

A Bun deploy builds a Docker image and runs it, so CI needs Docker and a way to reach the server:

- Give the stack a Docker context over SSH to the server, as in [Bun](2-bun.md#on-a-server), and give CI the SSH key.
- Move the deploy state off the runner, which is thrown away after each job: use a shared store such as `Cloudflare.state()` in place of `Alchemy.localState()` in `configs/infra.ts`.

Then the same `npx space deploy --stage prod --yes` runs from the job.
