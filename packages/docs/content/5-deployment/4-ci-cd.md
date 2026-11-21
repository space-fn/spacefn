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
2. Add the permissions for what the app uses: **D1**, **Queues**, **Workers R2 Storage** and **Workers KV Storage**, all **Edit**.
3. Store it as `CLOUDFLARE_API_TOKEN` in the CI's secrets, and your account's ID (on the dashboard's overview) as `CLOUDFLARE_ACCOUNT_ID`.

Alchemy keeps the deploy state in the account too, so CI and your machine see the same deploys and either can deploy next.

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
