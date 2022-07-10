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
        core.summary.addHeading(
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
          extra += stripPrefixes(tapEvents[i + 1][1] as string)
          ++i
        }
        if (!tapEvent[1].ok) {
          core.summary.addHeading(`❌ ${stripPrefixes(tapEvent[1].name)}`, 4)
          if (extra) {
            core.summary.addCodeBlock(extra)
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

  await core.summary.write()

  // const payload = JSON.stringify(github.context.payload, undefined, 2)
  // console.log(`The event payload: ${payload}`)

  if (!ok) {
    core.setFailed(`❌ Tests reported failures`)
  }
}

main().catch((e) => core.setFailed(e.message))
