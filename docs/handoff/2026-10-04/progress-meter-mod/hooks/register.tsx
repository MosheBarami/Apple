import type { EngineInterface, Register } from 'claude-code'

// #37 Progress meter: the owner's fixed formula (25% agent, 20% knowledge & library, 15% visual, 10% UI,
// 10% sound/animation/FX, 20% website) read from ~/.claude/apple-meter.json, which the agent updates when a
// benchmark result lands. A pane with a large total, a segmented bar per domain (measured vs estimated), a
// scanning shimmer, and the live bench progress; the status line carries the compact version. `/meter` opens it.
const PANE = 'apple-meter'
const WIDTH = 40

type Domain = { id: string; name: string; weight: number; value: number; basis: 'measured' | 'estimated' }
type Meter = { updatedAt: string; note?: string; domains: Domain[]; live?: { label: string; done: number; total: number; credits: number; budget: number } }

let meter: Meter | null = null
let frame = 0
let problem = ''

const total = (m: Meter) => m.domains.reduce((n, d) => n + (d.weight * d.value) / 100, 0)
const bar = (pct: number, width: number, shimmerAt: number) => {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return Array.from({ length: width }, (_, i) => (i < filled ? (i === shimmerAt % Math.max(1, filled) ? '▓' : '█') : '░')).join('')
}
const heat = (pct: number) => (pct >= 90 ? '#3ddc97' : pct >= 60 ? '#7ee787' : pct >= 35 ? '#f2cc60' : pct >= 15 ? '#ff9e64' : '#ff6b81')

async function load($: EngineInterface) {
  const home = await $.env.get('HOME')
  try {
    meter = JSON.parse(await $.fs.read(`${home}/.claude/apple-meter.json`)) as Meter
    problem = ''
  } catch (err) {
    problem = `no meter file yet (${String(err).slice(0, 60)})`
  }
  if (meter) {
    const t = total(meter)
    $.ui.status(`APPLE ${t.toFixed(1)}% ${bar(t, 12, -1)}${meter.live ? ` · bench ${meter.live.done}/${meter.live.total}` : ''}`)
  }
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'meter', description: "Show Apple's completion out of 100% (the owner's meter)" })
    const started = await next(e)
    await load($)
    $.clock.every(30_000, () => void load($))
    $.clock.every(250, () => {
      frame += 1
      $.ui.invalidate('ui.render')
    })
    void $.ui.open({ id: PANE, title: 'APPLE · COMPLETION' })
    return started
  })

  on('command.run', { command: 'meter' }, async $ => {
    await load($)
    await $.ui.open({ id: PANE, title: 'APPLE · COMPLETION' })
    return { text: meter ? `Apple is ${total(meter).toFixed(1)}% complete by the fixed meter.` : problem }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (!meter) return <Box><Text dimColor>{problem || 'loading…'}</Text></Box>
    const t = total(meter)
    const width = Math.max(16, Math.min(WIDTH, (e.viewport?.columns ?? 60) - 22))
    const ticks = '▏' + Array.from({ length: 10 }, (_, i) => `${(i + 1) * 10}`.padStart(Math.round(width / 10), '·')).join('')
    const scan = '·'.repeat(frame % (width + 1)) + '◆' + '·'.repeat(Math.max(0, width - (frame % (width + 1))))
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text bold color={heat(t)}>{t.toFixed(1)}%</Text>
          <Text dimColor>of 100 · product completion · fixed formula</Text>
        </Box>
        <Text color={heat(t)}>{bar(t, width, frame)}</Text>
        <Text dimColor>{ticks.slice(0, width + 1)}</Text>
        <Text color="#4fc3f7" dimColor>{scan.slice(0, width + 1)}</Text>
        <Text> </Text>
        {meter.domains.map(d => (
          <Box key={d.id} flexDirection="column">
            <Box gap={1}>
              <Text bold>{d.name}</Text>
              <Text dimColor>w{d.weight}% · {d.basis === 'measured' ? '● measured' : '○ estimated'}</Text>
            </Box>
            <Box gap={1}>
              <Text color={heat(d.value)}>{bar(d.value, width - 8, frame + d.weight)}</Text>
              <Text color={heat(d.value)}>{d.value.toFixed(1).padStart(5)}%</Text>
            </Box>
          </Box>
        ))}
        <Text> </Text>
        {meter.live && (
          <Box gap={1}>
            <Text color="#4fc3f7">▶ {meter.live.label}</Text>
            <Text dimColor>{meter.live.done}/{meter.live.total} items · {meter.live.credits}/{meter.live.budget} credits</Text>
          </Box>
        )}
        {meter.live && <Text color="#4fc3f7">{bar((100 * meter.live.done) / Math.max(1, meter.live.total), width, frame)}</Text>}
        {meter.note && <Text dimColor wrap="wrap">{meter.note}</Text>}
        <Text dimColor>updated {new Date(meter.updatedAt).toLocaleString()}</Text>
      </Box>
    )
  })
}
