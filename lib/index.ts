import * as core from '@actions/core'
// import * as github from '@actions/github'
import * as fs from 'fs/promises'
import tapParser from 'tap-parser'

function assertNever(value: never, message: string): never {
  throw new Error(`${message}: ${value}`)
}

function stripPrefixes(str: string): string {
  if (str.startsWith('● ') || str.startsWith('- ')) {
    return str.substring(2)
  } else if (str.startsWith('#')) {
    return str.substring(1)
  } else {
    return str
  }
}

function leadingWhitepsace(str: string): number {
  for (let i = 0; i < str.length; ++i) {
    if (str[i] !== ' ') {
      return i
    }
  }
  // the string was all whitespace, so indicate it is infinite whitespace
  return Number.MAX_SAFE_INTEGER
}

function removeLeadingWhitespace(str: string): string {
  const lines = str.split('\n')
  let leading = Math.min(...lines.map(leadingWhitepsace))
  if (leading === 0) {
    return str
  }
  return lines.map((l) => l.substring(leading)).join('\n')
}

class Summary {
  #buffer = ''

  public addHeading(text: string, level = 1): this {
    this.#buffer += '#'.repeat(level) + ' ' + text + '\n'
    return this
  }

  public addCodeBlock(text: string): this {
    this.#buffer += '```\n'
    this.#buffer += text + '\n'
    this.#buffer += '```\n\n'
    return this
  }

  async write(): Promise<void> {
    const filePath = process.env['GITHUB_STEP_SUMMARY']
    if (!filePath) {
      throw new Error(
        `Unable to find environment variable for GITHUB_STEP_SUMMARY. Check if your runtime environment supports job summaries.`,
      )
    }
    await fs.writeFile(filePath, this.#buffer, { encoding: 'utf8' })
  }
}

const summary = new Summary()

async function main() {
  const tapPaths = core.getInput('tap-paths')

  // MSED - consider using @actions/glob to convert tapPaths wildcards to useful information
  const tapData = await fs.readFile(tapPaths, { encoding: 'utf8' })
  const tapEvents = tapParser.parse(tapData)

  let ok = false
  for (const tapEvent of tapEvents) {
    switch (tapEvent[0]) {
      case 'complete':
        ok = tapEvent[1].ok
        summary.addHeading(
          `${tapEvent[1].count} run, ${tapEvent[1].skip} skipped, ${tapEvent[1].fail} failed.`,
        )
        break
      default:
        break
    }
  }

  for (let i = 0; i < tapEvents.length; ++i) {
    const tapEvent = tapEvents[i]
    switch (tapEvent[0]) {
      case 'assert':
        let extra = ''
        while (tapEvents[i + 1][0] === 'extra' || tapEvents[i + 1][0] === 'comment') {
          extra += stripPrefixes(String(tapEvents[i + 1][1]).trim()) + '\n'
          ++i
        }
        if (!tapEvent[1].ok) {
          summary.addHeading(`❌ ${stripPrefixes(tapEvent[1].name)}`, 4)
          if (extra) {
            summary.addCodeBlock(removeLeadingWhitespace(extra).trim())
          }
        }
        break
      case 'extra':
      case 'comment':
      case 'plan':
      case 'complete':
        break
      default:
        assertNever(tapEvent[0], `Unknown tap event`)
    }
  }

  await summary.write()

  // const payload = JSON.stringify(github.context.payload, undefined, 2)
  // console.log(`The event payload: ${payload}`)

  if (!ok) {
    core.setFailed(`❌ Tests reported failures`)
  }
}

main().catch((e) => core.setFailed(e.message))
