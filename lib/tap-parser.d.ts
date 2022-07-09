declare module 'tap-parser' {
  type Result = {
    ok: boolean
    id: number
    name: string
    fullname: string
  }

  type Assert = ['assert', Result]
  type Extra = ['extra', string]
  type Comment = ['comment', string]
  type Plan = ['plan', { start: number; end: number }]
  type Complete = [
    'complete',
    {
      ok: boolean
      count: number
      pass: number
      fail: number
      bailout: boolean
      todo: number
      skip: number
      plan: {
        start: number
        end: number
        skipAll: boolean
        skipReason: string
        comment: string
      }
      failures: Result[][]
      time: unknown
    },
  ]

  type Events = Assert | Comment | Extra | Plan | Complete

  class Parser {
    static parse(data: string): Events[]
  }

  export = Parser
}
