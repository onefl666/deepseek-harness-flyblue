#!/usr/bin/env node
/**
 * Test driver: boot the gitbash-local + tool-bash Loader composition, execute
 * one real foreground and one real background Git Bash command through the
 * tool registry, and persist the observed model-visible output to
 * `./gitbash-loader-report.json` for the package spec's inspect step.
 */

import { writeFile } from 'node:fs/promises'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { ToolCallId } from '@deepseek-ai/dsh-llm'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('gitbash driver requires a config path')

const ctx = await boot('gitbash-loader-smoke', resolveConfigPath(configPath, undefined))
try {
  const schema = ctx.tools.schemas().find(tool => tool.name === 'bash')
  if (schema === undefined) throw new Error('bash tool not registered by the composition')
  const prompt = (await ctx.systemPrompt.assemble()).sections.find(section => section.name === 'tool:bash')

  const foreground = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('loader-fg'),
    name: 'bash',
    arguments: { command: 'echo loader-ok', description: 'loader foreground' },
  })
  const foregroundText = foreground.content.filter(block => block.type === 'text').map(block => block.text).join('')

  const background = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('loader-bg'),
    name: 'bash',
    arguments: {
      command: 'sleep 0.2; echo loader-bg-ok',
      description: 'loader background',
      run_in_background: true,
    },
  })
  const jobId = (background.value as { jobId: string }).jobId

  // The output delta and the terminal status can land in separate reads, so
  // accumulate both.
  let backgroundText = ''
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const read = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('loader-bg-read'),
      name: 'job_output',
      arguments: { job_id: jobId },
    })
    backgroundText += read.content.filter(block => block.type === 'text').map(block => block.text).join('')
    if (backgroundText.includes('loader-bg-ok') && backgroundText.includes('[status: completed')) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  await writeFile('./gitbash-loader-report.json', JSON.stringify({
    schemaHasRunInBackground: Object.hasOwn(schema.parameters.properties as object, 'run_in_background'),
    promptHasMarkerSection: prompt?.text.includes('Check the [exit code: N] marker on every bash result') === true,
    foregroundText,
    backgroundText,
  }))
} finally {
  await ctx.fiber.dispose()
}
