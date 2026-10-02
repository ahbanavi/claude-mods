import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SubagentRow } from '../types'

type Running = Record<string, SubagentRow>

const running = atom({ plugin: 'subagent-models', key: 'running' } as const, {} as Running)

const FINISHED = new Set(['completed', 'failed', 'killed'])

// claude-haiku-4-5-20251001 -> haiku-4-5, claude-opus-5-5[1m] -> opus-5-5[1m]
export const shortModel = (id: string) =>
  id.replace(/^claude-/, '').replace(/-\d{8}(?=$|\[)/, '')

export const summary = (rows: readonly SubagentRow[]) => {
  if (rows.length === 0) {
    return undefined
  }

  const counts = new Map<string, number>()
  for (const { label, model, effort } of rows) {
    const text = `${label} ${model}${effort === undefined ? '' : `/${effort}`}`
    counts.set(text, (counts.get(text) ?? 0) + 1)
  }

  const parts = [...counts].map(([text, n]) => (n === 1 ? text : `${n}× ${text}`))

  return `  ${parts.join(' · ')}`
}

const put = async ($: EngineInterface, id: string, row: SubagentRow) => {
  await update($, running, all => ({ ...all, [id]: row }))
}

const drop = async ($: EngineInterface, ids: readonly string[]) => {
  await update($, running, all =>
    Object.fromEntries(Object.entries(all).filter(([id]) => !ids.includes(id))),
  )
}

// Agents killed without a turn.complete (a /clear, a TaskStop) leave the line here.
const prune = async ($: EngineInterface) => {
  const ids = Object.keys(await read($, running))
  if (ids.length === 0) {
    return
  }

  const agents = await $.agent.list()
  const stale = ids.filter(id => {
    const agent = agents.find(a => a.id === id)
    return agent === undefined || FINISHED.has(agent.status)
  })

  if (stale.length > 0) {
    await drop($, stale)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // Clears the status line an earlier version of this mod pinned.
    $.ui.status(undefined)
    $.clock.every(5000, () => void prune($))

    return started
  })

  // Shows the agent as soon as it starts, before its first request names an effort.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)

    if (started.deny === undefined && started.agentId !== undefined) {
      await put($, started.agentId, {
        label: e.name ?? e.subagentType,
        model: shortModel(started.model),
      })
    }

    return started
  })

  // Every request a subagent makes names the model and effort it really runs on.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      const known = (await read($, running))[e.agentId]
      const model = shortModel(e.model)
      const effort = e.effort === undefined ? undefined : String(e.effort)

      if (known === undefined) {
        // Compaction and memory forks carry ids $.agent.list() never names.
        const agent = (await $.agent.list()).find(a => a.id === e.agentId)
        if (agent !== undefined && !FINISHED.has(agent.status)) {
          await put($, e.agentId, { label: agent.name ?? agent.type, model, effort })
        }
      } else if (known.model !== model || known.effort !== effort) {
        await put($, e.agentId, { ...known, model, effort })
      }
    }

    return yield* next(e)
  })

  // The dim `← for agents` line sits right above the agent list; the tail rides
  // its end, so the engine's own line and pills stay live. Writes to `running`
  // redraw it, since the read here subscribes the line.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const tail = summary(Object.values(await read($, running)))

    return next(tail === undefined ? e : { ...e, props: { ...e.props, tail } })
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined && (await read($, running))[e.agentId] !== undefined) {
      await drop($, [e.agentId])
    }

    return next(e)
  })
}
