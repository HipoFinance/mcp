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

## Risk and money paths

Risk: `none`. No code here computes, moves or records an amount; a code change gets one code review.
The list is `.claude/money-map.txt`, read by the team's review (`team:risk-review`); how it works is
in `specs/review-depth.md` of the `claude-team` repo. Add a line there when you add a new way to pay or a new
balance.

## Review focus

The angles a code review takes here.

- Answers about the chain: units and rounding of every amount returned, read from the chain itself.
