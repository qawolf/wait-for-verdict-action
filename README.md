# Wait for QA Wolf verdict

## Introduction

This action waits until QA Wolf has tested a deployment, then passes or fails the step on the result. Put it in its own job after the job that reports the deployment, and make your release jobs depend on it, so nothing ships before QA Wolf says the deployment is good.

It takes the deployment id that [`qawolf/notify-qawolf-on-deploy-action`](https://github.com/qawolf/notify-qawolf-on-deploy-action) outputs, works out which runs QA Wolf started for that deployment, and waits for them. While it waits it logs each change, and when it ends it writes a job summary with the outcome and a link to each run. This action uses [the `@qawolf/ci-sdk` package](https://www.npmjs.com/package/@qawolf/ci-sdk).

`passed` means QA Wolf found no open blocking bug after triaging the run, not that every flow is green. A flow that failed for a reason QA Wolf triaged as non-blocking, or as test maintenance, does not fail the deployment.

## Quick start

Report the deployment in one job and wait for the verdict in the next one:

```yml
name: Deploy staging
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    outputs:
      qawolf-deployment-id: ${{ steps.notify.outputs.deployment-id }}
    steps:
      # ... deploy, and wait until the deployment is live
      - name: Notify QA Wolf
        id: notify
        uses: qawolf/notify-qawolf-on-deploy-action@v3
        with:
          qawolf-api-key: ${{ secrets.QAWOLF_API_KEY }}
          environment: staging
          deployment-url: https://staging.example.com

  qa-wolf-gate:
    needs: deploy
    runs-on: ubuntu-latest
    timeout-minutes: 150
    steps:
      - name: Wait for QA Wolf verdict
        id: wait
        uses: qawolf/wait-for-verdict-action@v1
        with:
          qawolf-api-key: ${{ secrets.QAWOLF_API_KEY }}
          deployment-id: ${{ needs.deploy.outputs.qawolf-deployment-id }}

  promote:
    needs: qa-wolf-gate
    runs-on: ubuntu-latest
    steps:
      - run: echo "Promote the build that QA Wolf tested"
```

Set the job's `timeout-minutes` above the action's `timeout` (2 hours by default), so the step ends with a summary and run links instead of being killed.

If you report the deployment with `@qawolf/ci-sdk` instead of the notify action, pass the deployment id `deployment.reportStatus` returned, for example from a script step's output.

## Inputs

### `qawolf-api-key`

**Required**. The QA Wolf API key, which you can find on the application's workspace settings page. Any kind of key works; the deployment id already says which workspace it belongs to.

### `deployment-id`

**Required**. The id of the QA Wolf deployment to wait on: the `deployment-id` **output** of `qawolf/notify-qawolf-on-deploy-action`, or the deployment id `deployment.reportStatus` of `@qawolf/ci-sdk` returned.

This is not the `deployment-id` _input_ you may pass to the notify action. That one is your own id for the deployment, and QA Wolf does not know a deployment by it.

### `timeout`

How long to wait in total, such as `2h`, `90m`, `5400s` or `1h30m`. Defaults to `2h`. Keep it below the job's `timeout-minutes`, so the step ends with run links instead of being killed. When the time runs out, the step fails with the outcome `timed-out`.

### `on-not-tested`

What the step does when nothing tested the deployment, because no trigger matched it, or a trigger matched it and started no run: `fail` or `pass`. Defaults to `fail`, because a gate that passes when nothing ran lets untested code through, for example when the step is added before the trigger exists. The summary lists why each trigger did not run.

Set `pass` when some deployments are expected to match no trigger, for example with a branch filter on the trigger.

### `on-superseded`

What the step does when a newer deployment to the same branch and environment replaced the run before it finished: `fail` or `pass`. Defaults to `fail`. A superseded deployment has no verdict, and the run that replaced it may be testing a later commit.

Use `pass` only when the step is a status check, where a failed check on a replaced deployment is noise. Never use `pass` when a later job ships this commit, since it would ship a commit QA Wolf never finished testing.

### `on-needs-review`

What the step does when the run's failures wait for a person to answer on the run page: `fail` or `wait`. Defaults to `fail`.

- `fail` ends the step at once with a link to the run. Answer on the run page, then [re-run the wait job](#re-running-the-wait).
- `wait` keeps the step waiting until someone answers and the run settles to `passed` or `failed`, within `timeout`. It checks again every 30 seconds.

### `qawolf-base-url`

The base URL of the QA Wolf API. Defaults to `https://app.qawolf.com`.

## Outputs

### `outcome`

The verdict's outcome, such as `passed`, `failed` or `not-tested` (see [Outcomes](#outcomes)). Set whenever the action asked QA Wolf for the verdict, even when the step fails, so a later step can branch on it with `if: always() && steps.wait.outputs.outcome == 'superseded'`. Empty when an input is invalid or the action hits an internal error, and the step then fails. The job summary says why.

### `run-urls`

The URLs of the runs QA Wolf started for the deployment, one per line. Empty when there are none, for example on `not-tested`.

### `verdict`

The full verdict as JSON, in the shape of `deploymentVerdictSchema` from `@qawolf/api-contracts`. Read any field with `fromJSON`, such as `fromJSON(steps.wait.outputs.verdict).blockingBugCount` on `failed`, or `fromJSON(steps.wait.outputs.verdict).supersededBy.url` on `superseded`.

## Outcomes

| Outcome                                                                                                    | Meaning                                                                                             | Step                        |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------- |
| `passed`                                                                                                   | QA Wolf found no open blocking bug.                                                                 | Passes                      |
| `failed`                                                                                                   | QA Wolf found at least one open blocking bug.                                                       | Fails                       |
| `not-tested`                                                                                               | No trigger matched the deployment, or one matched and started no run.                               | `on-not-tested` decides     |
| `superseded`                                                                                               | A newer deployment replaced the run before it finished, so this deployment has no verdict.          | `on-superseded` decides     |
| `needs-review`                                                                                             | The run's failures wait for a person on the run page, so there is no verdict yet.                   | Fails, or waits with `wait` |
| `run-canceled`                                                                                             | The run was canceled, so there is no verdict.                                                       | Fails                       |
| `timed-out`                                                                                                | `timeout` ran out before QA Wolf answered.                                                          | Fails                       |
| `canceled-by-caller`                                                                                       | The job was canceled while waiting. The summary still lists the runs the step knew about.           | Fails                       |
| `unauthorized`, `not-found`, `server-error`, `unexpected-status`, `network-error`, `invalid-response-body` | The step could not get an answer from QA Wolf. `not-found` usually means the wrong `deployment-id`. | Fails                       |

The step is a gate, so it never passes on an answer it could not get. To make it warn instead of block, see [Warn without blocking](#warn-without-blocking).

## Re-running the wait

When the step fails on `needs-review` or `timed-out`, you don't need to deploy again. Answer the questions on the run page if there are any, then use **Re-run failed jobs** on the workflow run. GitHub re-runs the wait job and the jobs that depend on it, not the deploy job, with the same `deployment-id` output from the deploy job, and the step picks up the run QA Wolf already started and answers its settled verdict.

## Warn without blocking

Set `continue-on-error: true` on the step. The job then succeeds whatever QA Wolf answers, and the `outcome` output still tells later steps what happened:

```yml
- name: Wait for QA Wolf verdict
  id: wait
  continue-on-error: true
  uses: qawolf/wait-for-verdict-action@v1
  with:
    qawolf-api-key: ${{ secrets.QAWOLF_API_KEY }}
    deployment-id: ${{ needs.deploy.outputs.qawolf-deployment-id }}
- name: Warn on a failed verdict
  if: steps.wait.outputs.outcome != 'passed'
  run: echo "::warning::QA Wolf verdict is ${{ steps.wait.outputs.outcome }}"
```

## Deploying from a matrix

Give each leg its own deployment id, as the notify action's README describes, then wait in the same leg, or fan out a wait job over the ids. One step waits on one deployment.

## Superseded deployments and concurrency

A deployment is `superseded` when a newer one to the same branch and environment replaces its run. If the workflow uses `concurrency` with `cancel-in-progress: true`, GitHub cancels the older wait job before QA Wolf supersedes its run, so you mostly see `superseded` without `cancel-in-progress`, or when the wait runs in another workflow.
