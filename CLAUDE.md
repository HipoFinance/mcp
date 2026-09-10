# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## After you push: bump the pin in `operation`

A push to `main` here builds one image, tagged `sha-<short commit>`
(`.github/workflows/build.yml`). The deployment lives in
[`HipoFinance/operation`](https://github.com/HipoFinance/operation), which pins that tag in
`stack/mcp.yaml`.

**Publishing an image changes nothing on the servers.** The stack file still names the previous
tag until it is bumped, and rolling a service out is still a person running
`docker stack deploy` — so a bad image cannot reach production while nobody is looking.

`operation` cannot be written from here. A workflow's `GITHUB_TOKEN` is scoped to the repository
it runs in, so this build cannot edit that one, and putting a long-lived cross-repository token
in every image repository is exactly what that arrangement avoids. Instead `operation` reads
GHCR and repins itself, on dispatch:

```sh
# 1. wait for this repo's image to be published
gh run watch "$(gh run list -w build.yml -L1 --json databaseId -q '.[0].databaseId')" --exit-status

# 2. repin operation, and watch that too
gh workflow run pin-images.yml -R HipoFinance/operation
gh run watch "$(gh run list -w pin-images.yml -R HipoFinance/operation -L1 --json databaseId -q '.[0].databaseId')" --exit-status
```

Order matters. Dispatch step 2 only once step 1 has finished, or it reads the tag that was
already there and reports `Every pin is already current.` — which looks like success.

Step 2 commits the moved pin to `operation`'s `main`. It does **not** deploy; tell whoever is
deploying that the pin has moved. `./bump.sh` in `operation`, with no arguments, prints every
pin against the newest published tag, one line each — that report is the check to run before any
deploy.

`pin-images` ran on a two-hourly cron until 2026-09-10 and is now dispatch-only, so **nothing
moves the pin unless someone asks it to.**
