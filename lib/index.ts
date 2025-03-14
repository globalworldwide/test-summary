import * as core from '@actions/core'
// import * as github from '@actions/github'
import * as fs from 'fs/promises'
import { Parser as TapParser } from 'tap-parser'

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
    core.info(text)
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

    // avoid $GITHUB_STEP_SUMMARY upload aborted, supports content up to a size of 1024k, got 1051k.
    // For more information see: https://docs.github.com/actions/using-workflows/workflow-commands-for-github-actions#adding-a-markdown-summary
    const maxLength = 1024 * 1024

    const buffer = Buffer.from(this.#buffer, 'utf8')
    if (buffer.length > maxLength) {
      await fs.writeFile(
        filePath,
        Buffer.concat([
          buffer.subarray(0, maxLength - 512),
          Buffer.from('\n\n\n...summary truncated...', 'utf8'),
        ]),
      )
    } else {
      await fs.writeFile(filePath, buffer)
    }
  }
}

const summary = new Summary()

async function main() {
  let version = 12
  const title = core.getInput('title')
  const tapPaths = core.getInput('tap-paths')

  // MSED - consider using @actions/glob to convert tapPaths wildcards to useful information
  const tapData = await fs.readFile(tapPaths, { encoding: 'utf8' })
  const tapEvents = TapParser.parse(tapData)

  let ok = false
  let count = 0
  for (const tapEvent of tapEvents) {
    switch (tapEvent[0]) {
      case 'complete':
        ok = tapEvent[1].ok
        count = tapEvent[1].count
        summary.addHeading(
          `${title ? `${title}: ` : ''}${tapEvent[1].count} run, ${tapEvent[1].skip} skipped, ${
            tapEvent[1].fail
          } failed.`,
        )
        break
      case 'version':
        version = tapEvent[1]
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
        if (version === 12) {
          while (tapEvents[i + 1][0] === 'extra' || tapEvents[i + 1][0] === 'comment') {
            extra += stripPrefixes(String(tapEvents[i + 1][1]).trim()) + '\n'
            ++i
          }
        }
        if (!tapEvent[1].ok) {
          summary.addHeading(`❌ ${stripPrefixes(tapEvent[1].name)}`, 4)
          if (version >= 13) {
            if (tapEvent[1].diag?.message) {
              extra += stripPrefixes(tapEvent[1].diag.message.trim()) + '\n'
            }
            if (tapEvent[1].diag?.stack) {
              extra += stripPrefixes(tapEvent[1].diag.stack.trim()) + '\n'
            }
            if (tapEvent[1].diag?.details && typeof tapEvent[1].diag?.details === 'object') {
              for (const [key, value] of Object.entries(tapEvent[1].diag.details)) {
                extra += `${key}: ${value}\n`
              }
            }
            for (const err of tapEvent[1].diag?.errors ?? []) {
              if (err.errMsg) {
                extra += stripPrefixes(err.errMsg.trim()) + '\n'
              }
            }
          }

          if (extra) {
            summary.addCodeBlock(removeLeadingWhitespace(extra).trim())
          }
        }
        break
      case 'version':
      case 'extra':
      case 'comment':
      case 'plan':
      case 'complete':
      case 'close':
      case 'finish':
        break
      default:
        throw new Error(`${tapEvent[0]}: Unknown tap event`)
    }
  }

  await summary.write()

  // const payload = JSON.stringify(github.context.payload, undefined, 2)
  // console.log(`The event payload: ${payload}`)

  if (!ok) {
    core.setFailed(`❌ Tests reported failures`)
  }
  if (count === 0) {
    core.setFailed(`❌ No tests found in the report`)
  }
}

main().catch((e) => core.setFailed(e.message))
