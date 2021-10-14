import { BuiltLogic, isBreakpoint, KeaPlugin, ListenerFunction, Logic } from 'kea'

export type KeaLoadersOptions = {
  onStart: ({ actionKey, reducerKey, logic }: { actionKey: string; reducerKey: string; logic: Logic }) => void
  onSuccess: ({
    response,
    actionKey,
    reducerKey,
    logic,
  }: {
    actionKey: string
    reducerKey: string
    logic: BuiltLogic
    response: any
  }) => void
  onFailure: ({
    error,
    actionKey,
    reducerKey,
    logic,
  }: {
    actionKey: string
    reducerKey: string
    logic: BuiltLogic
    error: Error
  }) => void
}

export const loadersPlugin = (options: Partial<KeaLoadersOptions> = {}): KeaPlugin => {
  const onStart =
    options.onStart ||
    (() => {
      /* noop */
    })
  const onSuccess =
    options.onSuccess ||
    (() => {
      /* noop */
    })
  const onFailure =
    options.onFailure ||
    function ({ error, actionKey, reducerKey, logic }) {
      console.error(`Error in ${actionKey} for ${reducerKey}:`, error)
    }

  return {
    name: 'loaders',

    defaults: () => ({
      loaders: undefined,
    }),

    buildSteps: {
      loaders(logic, input) {
        // skip if there are no loaders in the input
        if (!input.loaders) {
          return
        }

        // run the loaders function with the already created logic as an input,
        // so it can do ({ actions, ... }) => ({ ... })
        const loaders = typeof input.loaders === 'function' ? input.loaders(logic) : input.loaders

        Object.entries(loaders).forEach(([reducerKey, actionsObject]) => {
          let defaultValue = logic.defaults[reducerKey]

          if (Array.isArray(actionsObject)) {
            if (typeof defaultValue === 'undefined') {
              defaultValue = actionsObject[0]
            }
            actionsObject = actionsObject[1] || {}
          }

          const { __default, ...realActions } = actionsObject as typeof actionsObject & { __default: any }
          if (typeof defaultValue === 'undefined' && typeof __default !== 'undefined') {
            defaultValue = typeof __default === 'function' ? __default() : __default
          }

          if (typeof defaultValue === 'undefined') {
            defaultValue = null
          }

          // extend the logic with these actions
          logic.extend({
            actions: () => {
              const newActions: Record<string, (...args: any[]) => any> = {}
              Object.entries(realActions).forEach(([actionKey, listener]) => {
                if (typeof logic.actions[`${actionKey}`] === 'undefined') {
                  newActions[`${actionKey}`] = (params) => params
                }
                if (typeof logic.actions[`${actionKey}Success`] === 'undefined') {
                  newActions[`${actionKey}Success`] = (value, payload) => ({ payload, [reducerKey]: value })
                }
                if (typeof logic.actions[`${actionKey}Failure`] === 'undefined') {
                  newActions[`${actionKey}Failure`] = (error, errorObject) => ({ error, errorObject })
                }
              })
              return newActions
            },

            reducers: ({ actions }) => {
              const reducerObject: Record<string, (state: any, payload: any) => any> = {}
              const reducerLoadingObject: Record<string, () => any> = {}

              Object.keys(realActions).forEach((actionKey) => {
                reducerObject[actions[`${actionKey}Success`]] = (_, { [reducerKey]: value }) => value

                reducerLoadingObject[actions[`${actionKey}`]] = () => true
                reducerLoadingObject[actions[`${actionKey}Success`]] = () => false
                reducerLoadingObject[actions[`${actionKey}Failure`]] = () => false
              })

              const response: Record<string, [any, any]> = {}
              if (typeof logic.reducers[reducerKey] === 'undefined') {
                response[reducerKey] = [defaultValue, reducerObject]
              }
              if (typeof logic.reducers[`${reducerKey}Loading`] === 'undefined') {
                response[`${reducerKey}Loading`] = [false, reducerLoadingObject]
              }
              return response
            },

            listeners: ({ actions }) => {
              const newListeners: Record<string, ListenerFunction> = {}
              Object.entries(realActions).forEach(([actionKey, listener]) => {
                newListeners[actions[actionKey]] = (payload, breakpoint, action) => {
                  try {
                    onStart && onStart({ actionKey, reducerKey, logic })
                    const response = listener(payload, breakpoint, action)

                    if (response && response.then && typeof response.then === 'function') {
                      return response
                        .then((asyncResponse: any) => {
                          onSuccess && onSuccess({ response, actionKey, reducerKey, logic })
                          actions[`${actionKey}Success`](asyncResponse)
                        })
                        .catch((error: Error) => {
                          if (!isBreakpoint(error)) {
                            onFailure && onFailure({ error, actionKey, reducerKey, logic })
                            actions[`${actionKey}Failure`](error.message, error)
                          }
                        })
                    } else {
                      onSuccess && onSuccess({ response, actionKey, reducerKey, logic })
                      actions[`${actionKey}Success`](response, payload)
                    }
                  } catch (error) {
                    if (!isBreakpoint(error)) {
                      onFailure && onFailure({ error, actionKey, reducerKey, logic })
                      actions[`${actionKey}Failure`](error.message, error)
                    }
                  }
                }
              })
              return newListeners
            },
          })
        })
      },
    },

    buildOrder: {
      loaders: { after: 'defaults' },
    },
  }
}
