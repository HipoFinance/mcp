# AGENTS.md

## What this is

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deploy

### After you push: move the pin in `operation`

A push to `main` here builds one image, tagged `sha-<short commit>`
(`.github/workflows/build.yml`). The deployment lives in
[`HipoFinance/operation`](https://github.com/HipoFinance/operation), which pins that tag in
`stack/mcp.yaml`.

**Publishing an image changes nothing on the servers.** Moving the pin is a second step, and a
person deploys after it. The procedure is the `team:release` skill of the team plugin
(`/team:release`). In a session without the plugin, read the same text at
<https://github.com/HipoFinance/claude-team/blob/main/plugins/team/skills/release/SKILL.md>
(`gh api repos/HipoFinance/claude-team/contents/plugins/team/skills/release/SKILL.md -H "Accept: application/vnd.github.raw"`)
and follow it.
