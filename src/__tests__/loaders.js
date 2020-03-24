import { resetContext } from 'kea'

import { loadersPlugin } from '../index'

beforeEach(() => {
  resetContext({
    plugins: [loadersPlugin],
    createStore: { middleware: [] }
  })
})

test('TODO! Add tests!', () => {
  expect(true).toBe(true)
})
