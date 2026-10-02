# claude-mods

[Claude Code mods](https://claude.com/blog/claude-code-mods) by ahbanavi.

## subagent-models

Shows the model and effort each running subagent actually uses, at the end of the
`← for agents` hint line, right above the agent list:

```
⏵⏵ auto mode on (shift+tab to cycle) · ← for agents · 2× Explore haiku-4-5 · Plan sonnet-5-5/medium · general-purpose opus-5-5/xhigh
● main
○ Explore          find the config loader
○ Explore          map the test suite
○ Plan             plan the migration
○ general-purpose  apply the fix
```

- Values come from each request the subagent sends (`turn.step`), so the effort is the one
  the request really carries, after any downgrade for the model. Nothing is guessed: until a
  subagent's first request the entry shows its model alone.
- Models that take no effort setting show no effort.
- Identical agents collapse into `2× …`; finished agents leave the line, killed ones within 5s.
- Terminal only for now: other surfaces don't draw the hint line's tail yet.

### Install

```
/plugin marketplace add ahbanavi/claude-mods
/plugin install subagent-models@claude-mods
/reload-plugins
```

### Develop

```
claude plugin validate ./subagent-models
claude plugin test ./subagent-models
claude --plugin-dir ./subagent-models
```
