import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')
const changelogPath = path.join(projectRoot, 'CHANGELOG.md')
const packagePath = path.join(projectRoot, 'package.json')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

function git(args) {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function parseEntries(markdown) {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const header = section.match(/^\[([^\]]+)\] - ([^\r\n]+)/)
      const title = section.match(/^### ([^\r\n]+)/m)
      if (!header || !title) return null
      return {
        version: header[1],
        date: header[2],
        title: title[1],
        changes: section.split(/\r?\n/).filter((line) => line.startsWith('- ')).map((line) => line.slice(2)),
      }
    })
    .filter(Boolean)
}

function formatCommit(subject) {
  return subject.replace(/^(feat|fix|refactor|build|chore|docs|perf|test)(\([^)]*\))?!?:\s*/i, '')
}

function readCommits(base) {
  const range = base ? `${base}..HEAD` : 'HEAD'
  const output = git(['log', range, '--format=%ad\t%s', '--date=short', '--', '.'])
  return output
    ? output.split(/\r?\n/).map((line) => {
        const [date, ...subjectParts] = line.split('\t')
        return { date, subject: formatCommit(subjectParts.join('\t')) }
      }).filter((commit) => commit.subject)
    : []
}

function writeOutputs(entries, base) {
  const markdown = [
    '# Changelog',
    '',
    `<!-- changelog:base ${base} -->`,
    '',
    ...entries.flatMap((entry) => [
      `## [${entry.version}] - ${entry.date}`,
      '',
      `### ${entry.title}`,
      '',
      ...entry.changes.map((change) => `- ${change}`),
      '',
    ]),
  ].join('\n')
  writeFileSync(changelogPath, `${markdown.trimEnd()}\n`, 'utf8')
}

const currentVersion = String(packageJson.version)
const currentDate = new Date().toISOString().slice(0, 10)
const existingMarkdown = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : ''
const existingEntries = parseEntries(existingMarkdown)
const base = existingMarkdown.match(/<!-- changelog:base ([0-9a-f]+) -->/)?.[1] ?? ''
const commits = readCommits(base)
const hasCurrentEntry = existingEntries.some((entry) => entry.version === currentVersion)
const shouldCreateEntry = commits.length > 0 || !hasCurrentEntry
const entries = shouldCreateEntry
  ? existingEntries.filter((entry) => entry.version !== currentVersion)
  : existingEntries

if (shouldCreateEntry) {
  entries.unshift({
    version: currentVersion,
    date: commits[0]?.date || currentDate,
    title: '桌面端更新',
    changes: commits.length > 0 ? commits.map((commit) => commit.subject) : ['版本号更新。'],
  })
}

writeOutputs(entries, git(['rev-parse', 'HEAD']) || base || 'unknown')
console.log(`Generated ${path.relative(process.cwd(), changelogPath)}`)
