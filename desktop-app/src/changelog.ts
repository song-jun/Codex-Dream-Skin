import changelogMarkdown from "../CHANGELOG.md?raw";

export type ChangelogEntry = {
  version: string
  date: string
  title: string
  changes: readonly string[]
}

function parseChangelog(markdown: string): readonly ChangelogEntry[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((section): ChangelogEntry | null => {
      const header = section.match(/^\[([^\]]+)\] - ([^\r\n]+)/)
      const title = section.match(/^### ([^\r\n]+)/m)
      if (!header || !title) return null
      return {
        version: header[1],
        date: header[2],
        title: title[1],
        changes: section.split(/\r?\n/).filter((line) => line.startsWith("- ")).map((line) => line.slice(2)),
      }
    })
    .filter((entry): entry is ChangelogEntry => entry !== null)
}

export const changelog = parseChangelog(changelogMarkdown)
