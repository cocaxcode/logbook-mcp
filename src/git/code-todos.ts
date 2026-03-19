import { execFileSync } from 'node:child_process'
import type { CodeTodo } from '../types.js'

const TAG_TO_TOPIC: Record<string, string> = {
  TODO: 'feature',
  FIXME: 'fix',
  BUG: 'fix',
  HACK: 'chore',
}

export function scanCodeTodos(repoPath: string): CodeTodo[] {
  try {
    const output = execFileSync(
      'git',
      ['-C', repoPath, 'grep', '-n', '-E', '(TODO|FIXME|HACK|BUG):', '--no-color'],
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    return parseGitGrepOutput(output)
  } catch {
    // git grep returns exit code 1 when no matches found
    return []
  }
}

export function parseGitGrepOutput(output: string): CodeTodo[] {
  if (!output.trim()) return []

  const regex = /^(.+?):(\d+):.*?\b(TODO|FIXME|HACK|BUG):\s*(.+)$/
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const match = line.match(regex)
      if (!match) return null
      const [, file, lineNum, tag, content] = match
      return {
        content: content.trim(),
        source: 'code' as const,
        file,
        line: parseInt(lineNum, 10),
        tag: tag as CodeTodo['tag'],
        topic_name: TAG_TO_TOPIC[tag] ?? 'chore',
      }
    })
    .filter((item): item is CodeTodo => item !== null)
}
