---
title: workflows/
icon: git-branch
---

# app/workflows/

Your [Workflows](https://developers.cloudflare.com/workflows/), on Cloudflare only: durable, multi-step jobs that survive restarts and retry each step. Each file's default export is a `WorkflowEntrypoint` class, named after the file:

```txt
app/workflows/
└── onboarding.ts      class Onboarding, binding WF_ONBOARDING
```

spacefn exports each class from the Worker, and the scaffolded `configs/infra.ts` creates the workflow and binds it. Only files directly in the folder count, named in lowercase letters, digits and `-`. On Bun, a file here stops `space gen`; use a queue there instead.

```ts [app/workflows/onboarding.ts]
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

export default class Onboarding extends WorkflowEntrypoint<unknown, { email: string }> {
	override async run(event: WorkflowEvent<{ email: string }>, step: WorkflowStep) {
		await step.do("send the welcome email", async () => {
			/* ... */
		});
		await step.sleep("wait a day", "1 day");
		await step.do("send the tips email", async () => {
			/* ... */
		});
	}
}
```

Start one from your code through `CloudflareEnv`:

```ts [modules/accounts/onboarding.ts]
import { Effect } from "effect";
import { CloudflareEnv } from "spacefn/cloudflare";

export const startOnboarding = (email: string) =>
	Effect.gen(function* () {
		const { WF_ONBOARDING } = (yield* CloudflareEnv) as { WF_ONBOARDING: Workflow };
		yield* Effect.promise(() => WF_ONBOARDING.create({ params: { email } }));
	});
```

A workflow runs outside spacefn's request handling, so it doesn't get the entry's services. Keep each step's work in `modules/`, as plain functions or Effects run with a runtime of their own, as in [`durable-objects/`](7-durable-objects.md).
