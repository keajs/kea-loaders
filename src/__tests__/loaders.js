/* global test, expect, beforeEach */
import { resetContext, kea } from 'kea'

import { loadersPlugin } from '../index'

beforeEach(() => {
  resetContext({
    plugins: [loadersPlugin],
  })
})

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

test('loaders work', async () => {
  let otherListenerRan = false
  const logic = kea({
    loaders: {
      users: {
        loadUsersAsync: async () => {
          await delay(2)
          return 'some async data'
        },
        loadUsersSync: ({ id }) => 'some sync data',
      },
    },

    listeners: {
      loadUsersSync: () => {
        otherListenerRan = true
      },
      loadUsersSyncSuccess: ({ users, payload }) => {
        expect(users).toEqual('some sync data')
        expect(payload).toEqual({ id: 42 })
        otherListenerRan = true
      },
    },
  })

  const unmount = logic.mount()

  expect(logic.values.users).toBe(null)
  expect(Object.keys(logic.values)).toEqual(['users', 'usersLoading'])
  expect(Object.keys(logic.actions).sort()).toEqual([
    'loadUsersAsync',
    'loadUsersAsyncFailure',
    'loadUsersAsyncSuccess',
    'loadUsersSync',
    'loadUsersSyncFailure',
    'loadUsersSyncSuccess',
  ])

  logic.actions.loadUsersSync({ id: 42 })
  expect(logic.values.users).toEqual('some sync data')
  expect(otherListenerRan).toBe(true)

  logic.actions.loadUsersAsync()
  expect(logic.values.users).toEqual('some sync data')
  await delay(10)
  expect(logic.values.users).toEqual('some async data')

  unmount()
})

test('defaults via __default', () => {
  const logic = kea({
    loaders: () => ({
      users: {
        __default: 'default',
        loadUsers: () => 'some sync data',
      },
    }),
  })

  const unmount = logic.mount()

  expect(logic.values.users).toBe('default')

  unmount()
})

test('defaults via reducer style [default, {...}]', () => {
  const logic = kea({
    loaders: () => ({
      users: [
        'default',
        {
          loadUsers: () => 'some sync data',
        },
      ],
    }),
  })

  const unmount = logic.mount()

  expect(logic.values.users).toBe('default')

  unmount()
})

test('defaults via defaults', () => {
  const logic = kea({
    defaults: {
      users: 'default',
    },

    loaders: () => ({
      users: {
        loadUsers: () => 'some sync data',
      },
    }),
  })

  const unmount = logic.mount()

  expect(logic.values.users).toBe('default')

  unmount()
})

test('defaults order', () => {
  const logic1 = kea({
    defaults: {
      users: 'default',
    },

    loaders: () => ({
      users: [
        'array',
        {
          __default: 'key',
          loadUsers: () => 'some sync data',
        },
      ],
    }),
  })
  const logic2 = kea({
    loaders: () => ({
      users: [
        'array',
        {
          __default: 'key',
          loadUsers: () => 'some sync data',
        },
      ],
    }),
  })

  const unmount1 = logic1.mount()
  const unmount2 = logic2.mount()

  expect(logic1.values.users).toBe('default')
  expect(logic2.values.users).toBe('array')

  unmount1()
  unmount2()
})

test('can override actions and reducers', () => {
  const logic = kea({
    actions: () => ({
      loadUsers: 'yesyesyes',
    }),

    loaders: () => ({
      users: {
        loadUsers: ({ value }) => value,
      },
    }),
  })

  const unmount = logic.mount()
  logic.actions.loadUsers({ value: 'nonono' })
  expect(logic.values.users).toBe('yesyesyes')

  unmount()
})

test('throwing calls failure', async () => {
  const errorList = []
  resetContext({
    plugins: [loadersPlugin({ onFailure: ({ error }) => errorList.push(error.message) })],
  })

  let asyncListenerRan = null
  let syncListenerRan = null
  const logic = kea({
    loaders: () => ({
      users: {
        loadUsersAsync: async () => {
          await delay(2)
          throw new Error('async nope')
        },
        loadUsersSync: () => {
          throw new Error('sync nope')
        },
      },
    }),

    listeners: () => ({
      loadUsersAsyncFailure: ({ error, errorObject }) => {
        expect(errorObject).toBeInstanceOf(Error)
        expect(errorObject.message).toBe(error)
        asyncListenerRan = error
      },
      loadUsersSyncFailure: ({ error, errorObject }) => {
        expect(errorObject).toBeInstanceOf(Error)
        expect(errorObject.message).toBe(error)
        syncListenerRan = error
      },
    }),
  })

  const unmount = logic.mount()

  logic.actions.loadUsersSync()
  expect(logic.values.users).toEqual(null)
  expect(syncListenerRan).toBe('sync nope')

  expect(errorList).toEqual(['sync nope'])

  logic.actions.loadUsersAsync()
  await delay(10)

  expect(logic.values.users).toEqual(null)
  expect(asyncListenerRan).toBe('async nope')
  expect(errorList).toEqual(['sync nope', 'async nope'])

  unmount()
})

test('onStart, onSucces and onFailure all work', async () => {
  const startList = []
  const successList = []
  const failureList = []

  resetContext({
    plugins: [
      loadersPlugin({
        onStart: () => startList.push(true),
        onSuccess: ({ response }) => successList.push(response),
        onFailure: ({ error }) => failureList.push(error.message),
      }),
    ],
  })

  const logic = kea({
    loaders: () => ({
      users: {
        loadUsersSucceeds: () => {
          return 'yes'
        },
        loadUsersFails: () => {
          throw new Error('sync nope')
        },
      },
    }),
  })

  const unmount = logic.mount()

  logic.actions.loadUsersFails()
  expect(startList).toEqual([true])
  expect(failureList).toEqual(['sync nope'])
  expect(successList).toEqual([])

  logic.actions.loadUsersSucceeds()
  expect(startList).toEqual([true, true])
  expect(failureList).toEqual(['sync nope'])
  expect(successList).toEqual(['yes'])

  unmount()
})

test('breakpoints work', async () => {
  let errors = 0
  let count = 0

  resetContext({
    plugins: [loadersPlugin({ onError: () => errors++ })],
  })

  const logic = kea({
    actions: () => ({
      loadUsers: true,
    }),

    loaders: () => ({
      users: {
        loadUsers: async ({ value }, breakpoint) => {
          await breakpoint(100)
          count += 1
          return value
        },
      },
    }),
  })

  const unmount = logic.mount()
  expect(count).toBe(0)
  logic.actions.loadUsers({ value: 'nonono' })
  await delay(10)
  logic.actions.loadUsers({ value: 'nonono' })
  expect(count).toBe(0)
  await delay(101)
  expect(count).toBe(1)
  expect(errors).toBe(0)

  unmount()
})
