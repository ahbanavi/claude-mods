import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const ENGINE = { plugin: 'engine', tier: 'core' } as const

const spawnArgs = (subagentType: string, background = false) => ({
  tool_use_id: `t-${subagentType}-${Math.random()}`,
  prompt: 'p',
  description: 'd',
  subagentType,
  provider: ENGINE,
  parentModel: 'claude-opus-5-5',
  background,
  fork: false,
})

// Stands for the engine's hint line: records the tail each draw hands it.
const hintLine = (on: On) => {
  const tails: (string | undefined)[] = []

  on('ui.status', () => ({ value: undefined }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    tails.push(e.props.tail)
    const { Text } = $.ui.resolve(e)
    return Text({ children: e.props.hint })
  })

  return tails
}

const drawHint = ($: Engine) =>
  $.ui.render({
    surface: 'terminal',
    component: 'PromptHint',
    requestId: 'hint',
    props: { isDraft: false, isWorking: true, hint: '← for agents' },
  })

test('hint line tails each running subagent with its model and effort', async ($, on) => {
  const tails = hintLine(on)
  let status = 'running'
  const clock = mock.clock(on)

  on('agent.list', () => ({
    value: [
      { id: 'a1', description: 'find x', type: 'Explore', status },
      { id: 'a2', description: 'plan y', type: 'Plan', status },
    ],
  }))
  on('agent.spawn', (_, e) => ({
    model: e.subagentType === 'Explore' ? 'claude-haiku-4-5-20251001' : 'claude-opus-5-5',
    agentId: e.subagentType === 'Explore' ? 'a1' : 'a2',
  }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  const step = async (agentId: string | undefined, model: string, effort: 'low' | 'high') => {
    for await (const _ of $.turn.step({ turnId: `r-${agentId}`, index: 0, model, effort, messageCount: 1, agentId })) {
      // drain
    }
  }

  await drawHint($)
  expect(tails.at(-1)).toBeUndefined()

  await $.agent.spawn(spawnArgs('Explore'))
  await drawHint($)
  expect(tails.at(-1)).toBe('  Explore haiku-4-5')

  await step('a1', 'claude-haiku-4-5-20251001', 'low')
  await drawHint($)
  expect(tails.at(-1)).toBe('  Explore haiku-4-5/low')

  await $.agent.spawn(spawnArgs('Plan'))
  await step('a2', 'claude-opus-5-5', 'high')
  // Main-loop steps are not subagents.
  await step(undefined, 'claude-sonnet-5-5', 'low')
  await drawHint($)
  expect(tails.at(-1)).toBe('  Explore haiku-4-5/low · Plan opus-5-5/high')

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'r-a1', agentId: 'a1', reason: 'answer' })
  await drawHint($)
  expect(tails.at(-1)).toBe('  Plan opus-5-5/high')

  // An agent killed without a turn.complete is pruned by the timer.
  status = 'killed'
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(5000)
  await drawHint($)
  expect(tails.at(-1)).toBeUndefined()
})

test('identical agents collapse into a count', async ($, on) => {
  const tails = hintLine(on)
  let n = 0

  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: `a${++n}` }))

  await $.agent.spawn(spawnArgs('Explore', true))
  await $.agent.spawn(spawnArgs('Explore', true))
  await drawHint($)

  expect(tails.at(-1)).toBe('  2× Explore haiku-4-5')
})
