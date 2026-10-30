## v1.0.0

- New GitHub action that waits until QA Wolf has tested a deployment, then passes or fails the step on the result. It takes the `deployment-id` output of `qawolf/notify-qawolf-on-deploy-action`, sets the `outcome`, `run-urls` and `verdict` outputs, and writes a job summary with a link to each run. `on-not-tested`, `on-superseded` and `on-needs-review` decide the outcomes that are not a plain pass or fail.
