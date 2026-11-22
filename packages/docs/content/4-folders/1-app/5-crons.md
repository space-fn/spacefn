---
title: crons/
icon: clock
---

# app/crons/

One scheduled job per file. The default export is `cron(schedule, job)`:

```txt
app/crons/
├── nightly.ts         0 3 * * *
└── hourly-sync.ts     0 * * * *
```

```ts [app/crons/nightly.ts]
import { cron } from "spacefn";

import * as Sessions from "#modules/accounts/sessions.ts";

export default cron("0 3 * * *", Sessions.deleteExpired);
```

The schedule is five fields in UTC: minute, hour, day of month, month, day of week, with lists (`1,15`), ranges (`9-17`), steps (`*/5`) and names (`MON-FRI`). Write it as a string literal: the infra reads it from the file without running it, and `space gen` stops on one it can't read.

Only files directly in the folder count, named in lowercase letters, digits and `-`. Jobs on the same schedule run at once; one failing is logged and doesn't stop the others.

On Cloudflare each schedule is a Cron Trigger on the Worker. On Bun the cron process runs them at the start of each matching minute, so run one cron process only.

Read more in [Queues and crons](../../6-guides/7-jobs.md#crons).
