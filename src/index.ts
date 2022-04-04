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
  reducers,
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
  }) => void
}

export const loadersPlugin = (options: Partial<KeaLoadersOptions> = {}): KeaPlugin => {
  return {
    name: 'loaders',

    defaults: () => ({
      loaders: undefined,
    }),

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
      legacyBuild: (logic, input) => {
        'loaders' in input && input.loaders && loaders(input.loaders)(logic)
      },
    },
  }
}

export function loaders<L extends Logic = Logic>(
  input: LoaderDefinitions<Logic> | ((logic: Logic) => LoaderDefinitions<Logic>),
): LogicBuilder<L> {
  return (logic) => {
    const loaders = typeof input === 'function' ? input(logic) : input

    Object.entries(loaders).forEach(([reducerKey, actionsObject]) => {
      let defaultValue = logic.defaults[reducerKey]

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

      // add the actions
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
      actions<L>(newActions)(logic)

      // add the reducers
      const reducerObject: Record<string, (state: any, payload: any) => any> = {}
      const reducerLoadingObject: Record<string, () => any> = {}
      Object.keys(loaderActions).forEach((actionKey) => {
        reducerObject[`${actionKey}Success`] = (_, { [reducerKey]: value }) => value
        reducerLoadingObject[`${actionKey}`] = () => true
        reducerLoadingObject[`${actionKey}Success`] = () => false
        reducerLoadingObject[`${actionKey}Failure`] = () => false
      })
      const newReducers: Record<string, [any, any]> = {}
      if (typeof logic.reducers[reducerKey] === 'undefined') {
        newReducers[reducerKey] = [defaultValue, reducerObject]
      }
      if (typeof logic.reducers[`${reducerKey}Loading`] === 'undefined') {
        newReducers[`${reducerKey}Loading`] = [false, reducerLoadingObject]
      }
      reducers<L>(newReducers)(logic)

      // add the listener
      const newListeners: Record<string, ListenerFunction> = {}
      Object.entries(loaderActions).forEach(([actionKey, listener]) => {
        newListeners[actionKey] = (payload, breakpoint, action) => {
          const { onStart, onSuccess, onFailure } = getPluginContext<KeaLoadersOptions>('loaders')
          try {
            onStart && onStart({ actionKey, reducerKey, logic })
            const response = listener(payload, breakpoint, action)

            if (response && response.then && typeof response.then === 'function') {
              return response
                .then((asyncResponse: any) => {
                  onSuccess && onSuccess({ response, actionKey, reducerKey, logic })
                  logic.actions[`${actionKey}Success`](asyncResponse, payload)
                })
                .catch((error: Error) => {
                  if (!isBreakpoint(error)) {
                    onFailure && onFailure({ error, actionKey, reducerKey, logic })
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
      listeners(newListeners)(logic)
    })
  }
}
