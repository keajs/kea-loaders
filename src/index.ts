import {
  actions,
  BreakPointFunction,
  BuiltLogic,
  getPluginContext,
  isBreakpoint,
  KeaPlugin,
  ListenerFunction,
  listeners,
  Logic,
  LogicBuilder,
  reducers, selectors,
} from 'kea'

export type LoaderFunctions<LogicType extends Logic, ReducerReturnType> = {
  [K in keyof LogicType['actionCreators']]?: (
    payload: ReturnType<LogicType['actionCreators'][K]>['payload'],
    breakpoint: BreakPointFunction,
    action: ReturnType<LogicType['actionCreators'][K]>,
  ) => ReducerReturnType | Promise<ReducerReturnType>
}

export type LoaderDefinitions<LogicType extends Logic> = {
  [K in keyof LogicType['reducers']]?:
    | (
        | LoaderFunctions<LogicType, ReturnType<LogicType['reducers'][K]>>
        | {
            __default: ReturnType<LogicType['reducers'][K]>
          }
      )
    | [ReturnType<LogicType['reducers'][K]>, LoaderFunctions<LogicType, ReturnType<LogicType['reducers'][K]>>]
}

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
    response?: any
  }) => void
}

export interface LoaderOpts {
  lazy?: boolean
}

export const loadersPlugin = (options: Partial<KeaLoadersOptions> = {}): KeaPlugin => {
  return {
    name: 'loaders',
    events: {
      afterPlugin: () => {
        const pluginContext = getPluginContext<KeaLoadersOptions>('loaders')
        pluginContext.onStart = options.onStart ?? (() => {})
        pluginContext.onSuccess = options.onSuccess ?? (() => {})
        pluginContext.onFailure =
          options.onFailure ??
          function ({ error, actionKey, reducerKey, logic }) {
            console.error(`Error in ${actionKey} for ${reducerKey}:`, error)
          }
      },
      legacyBuildAfterDefaults: (logic, input) => {
        'loaders' in input && input.loaders && loaders(input.loaders)(logic)
      },
    },
  }
}

export function loaders<L extends Logic = Logic>(
  input: LoaderDefinitions<L> | ((logic: L) => LoaderDefinitions<L>),
  opts?: LoaderOpts
): LogicBuilder<L> {
  const lazy = opts?.lazy ?? false
  return (logic) => {
    const loaders = typeof input === 'function' ? input(logic) : input

    for (const [reducerKey, actionsInput] of Object.entries(loaders)) {
      let defaultValue = logic.defaults[reducerKey]

      let actionsObject = actionsInput
      if (Array.isArray(actionsObject)) {
        if (typeof defaultValue === 'undefined') {
          defaultValue = actionsObject[0]
        }
        actionsObject = actionsObject[1] || {}
      }

      const { __default, ...loaderActions } = actionsObject as typeof actionsObject & { __default: any }
      if (typeof defaultValue === 'undefined' && typeof __default !== 'undefined') {
        defaultValue = typeof __default === 'function' ? __default() : __default
      }
      if (typeof defaultValue === 'undefined') {
        defaultValue = null
      }

      const newActions: Record<string, any> = {}
      Object.keys(loaderActions).forEach((actionKey) => {
        if (typeof logic.actions[`${actionKey}`] === 'undefined') {
          newActions[`${actionKey}`] = (params: any) => params
        }
        if (typeof logic.actions[`${actionKey}Success`] === 'undefined') {
          newActions[`${actionKey}Success`] = (value: any, payload: any) => ({ payload, [reducerKey]: value })
        }
        if (typeof logic.actions[`${actionKey}Failure`] === 'undefined') {
          newActions[`${actionKey}Failure`] = (error: any, errorObject: any) => ({ error, errorObject })
        }
      })

      const newReducers: Record<string, [any, any] | any> = {}
      const reducerObject: Record<string, (state: any, payload: any) => any> = {}
      const reducerLoadingObject: Record<string, () => any> = {}
      let firstActionKey: string | undefined = undefined
      Object.keys(loaderActions).forEach((actionKey) => {
        if (!firstActionKey) {
          firstActionKey = actionKey
        }
        reducerObject[`${actionKey}Success`] = (_, { [reducerKey]: value }) => value
        reducerLoadingObject[`${actionKey}`] = () => true
        reducerLoadingObject[`${actionKey}Success`] = () => false
        reducerLoadingObject[`${actionKey}Failure`] = () => false
      })

      const baseReducerName = lazy ? `${reducerKey}Source` : reducerKey
      if (typeof logic.reducers[reducerKey] === 'undefined') {
        newReducers[baseReducerName] = [defaultValue, reducerObject]
      } else {
        newReducers[baseReducerName] = reducerObject
      }

      if (typeof logic.reducers[`${reducerKey}Loading`] === 'undefined') {
        newReducers[`${reducerKey}Loading`] = [false, reducerLoadingObject]
      }

      const newSelectors: Record<string, [any, any] | any> = {}
      if (lazy && firstActionKey) {
        newSelectors[reducerKey] = [
          (s: any)=> [s[baseReducerName]],
          (value: any) => {
            if (!logic.cache[`lazyLoaderCalled-${firstActionKey}`]) {
              try {
                setTimeout(() => firstActionKey && logic.actions[firstActionKey]?.(), 0)
              } catch (e) {
                console.error('[KEA-LAZY-LOADERS]', reducerKey, e)
              }
              logic.cache[`lazyLoaderCalled-${firstActionKey}`] = true
            }
            return value
          }
        ]
      }

      const newListeners: Record<string, ListenerFunction> = {}
      Object.entries(loaderActions).forEach(([actionKey, listener]) => {
        newListeners[actionKey] = (payload, breakpoint, action) => {
          const { onStart, onSuccess, onFailure } = getPluginContext<KeaLoadersOptions>('loaders')
          try {
            onStart && onStart({ actionKey, reducerKey, logic })
            // @ts-ignore
            const response = listener(payload, breakpoint, action)

            if (response && response.then && typeof response.then === 'function') {
              return response
                .then((asyncResponse: any) => {
                  onSuccess && onSuccess({ response: asyncResponse, actionKey, reducerKey, logic })
                  logic.actions[`${actionKey}Success`](asyncResponse, payload)
                })
                .catch((error: Error) => {
                  if (!isBreakpoint(error)) {
                    onFailure && onFailure({ error, actionKey, reducerKey, logic, response })
                    logic.actions[`${actionKey}Failure`](error.message, error)
                  }
                })
            } else {
              onSuccess && onSuccess({ response, actionKey, reducerKey, logic })
              logic.actions[`${actionKey}Success`](response, payload)
            }
          } catch (error: any) {
            if (!isBreakpoint(error)) {
              onFailure && onFailure({ error, actionKey, reducerKey, logic })
              logic.actions[`${actionKey}Failure`](error.message, error)
            }
          }
        }
      })

      // @ts-ignore
      actions<L>(newActions)(logic)
      reducers<L>(newReducers)(logic)
      if (lazy) {
          selectors<L>(newSelectors)(logic)
      }
      listeners(newListeners)(logic)
    }
  }
}

export function lazyLoaders<L extends Logic = Logic>(
  input: LoaderDefinitions<L> | ((logic: L) => LoaderDefinitions<L>)
): LogicBuilder<L> {
  return loaders(input, { lazy: true })
}