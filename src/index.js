export const loadersPlugin = (options = {}) => {
  const onError = options.onError || function ({ error, actionKey, reducerKey, logic }) {
    console.error(`Error in ${actionKey} for ${reducerKey}:`, error)
  }

  return {
    name: 'loaders',

    defaults: () => ({
      loaders: undefined
    }),

    buildSteps: {
      loaders (logic, input) {
        // skip if there are no loaders in the input
        if (!input.loaders) {
          return
        }

        // run the loaders function with the already created logic as an input,
        // so it can do ({ actions, ... }) => ({ ... })
        const loaders = input.loaders(logic)

        Object.entries(loaders).forEach(([reducerKey, actionsObject]) => {
          let defaultValue = logic.defaults[reducerKey]

          if (Array.isArray(actionsObject)) {
            if (typeof defaultValue === 'undefined') {
              defaultValue = actionsObject[0]
            }
            actionsObject = actionsObject[1] || {}
          }

          const { __default, ...realActions } = actionsObject
          if (typeof defaultValue === 'undefined' && typeof __default !== 'undefined') {
            defaultValue = typeof __default === 'function' ? __default() : __default
          }

          if (typeof defaultValue === 'undefined') {
            defaultValue = null
          }

          // extend the logic with these actions
          logic.extend({
            actions: () => {
              const newActions = {}
              Object.entries(realActions).forEach(([actionKey, listener]) => {
                if (typeof logic.actions[`${actionKey}`] === 'undefined') {
                  newActions[`${actionKey}`] = params => params
                }
                if (typeof logic.actions[`${actionKey}Success`] === 'undefined') {
                  newActions[`${actionKey}Success`] = value => ({ [reducerKey]: value })
                }
                if (typeof logic.actions[`${actionKey}Failure`] === 'undefined') {
                  newActions[`${actionKey}Failure`] = error => ({ error })
                }
              })
              return newActions
            },

            reducers: ({ actions }) => {
              const reducerObject = {}
              const reducerLoadingObject = {}

              Object.keys(realActions).forEach(actionKey => {
                reducerObject[actions[`${actionKey}Success`]] = (_, { [reducerKey]: value }) => value

                reducerLoadingObject[actions[`${actionKey}`]] = () => true
                reducerLoadingObject[actions[`${actionKey}Success`]] = () => false
                reducerLoadingObject[actions[`${actionKey}Failure`]] = () => false
              })

              const response = {}
              if (typeof logic.reducers[reducerKey] === 'undefined') {
                response[reducerKey] = [defaultValue, reducerObject]
              }
              if (typeof logic.reducers[`${reducerKey}Loading`] === 'undefined') {
                response[`${reducerKey}Loading`] = [false, reducerLoadingObject]
              }
              return response
            },

            listeners: ({ actions }) => {
              const newListeners = {}
              Object.entries(realActions).forEach(([actionKey, listener]) => {
                newListeners[actions[actionKey]] = (payload, breakpoint, action) => {
                  try {
                    const response = listener(payload, breakpoint, action)

                    if (response && response.then && typeof response.then === 'function') {
                      return response.then(asyncResponse => {
                        actions[`${actionKey}Success`](asyncResponse)
                      }).catch(error => {
                        onError && onError({ error, actionKey, reducerKey, logic })
                        actions[`${actionKey}Failure`](error.message)
                      })
                    } else {
                      actions[`${actionKey}Success`](response)
                    }
                  } catch (error) {
                    onError && onError({ error, actionKey, reducerKey, logic })
                    actions[`${actionKey}Failure`](error.message)
                  }
                }
              })
              return newListeners
            }
          })
        })
      },
    },

    buildOrder: {
      loaders: {after: 'defaults'},
    },
  }
}

