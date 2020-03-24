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
          // extend the logic with these actions
          logic.extend({
            actions: () => {
              const newActions = {}
              Object.entries(actionsObject).forEach(([actionKey, listener]) => {
                newActions[`${actionKey}`] = true
                newActions[`${actionKey}Success`] = value => ({[reducerKey]: value})
                newActions[`${actionKey}Failure`] = error => ({error})
              })
              return newActions
            },

            reducers: ({actions}) => {
              const reducerObject = {}
              const reducerLoadingObject = {}

              Object.keys(actionsObject).forEach(actionKey => {
                reducerObject[actions[`${actionKey}Success`]] = (_, {[reducerKey]: value}) => value

                reducerLoadingObject[actions[`${actionKey}`]] = () => true
                reducerLoadingObject[actions[`${actionKey}Success`]] = () => false
                reducerLoadingObject[actions[`${actionKey}Failure`]] = () => false
              })

              return {
                [reducerKey]: [null, reducerObject],
                [`${reducerKey}Loading`]: [false, reducerLoadingObject]
              }
            },

            listeners: ({actions}) => {
              const newListeners = {}
              Object.entries(actionsObject).forEach(([actionKey, listener]) => {
                newListeners[actions[actionKey]] = async (payload, breakpoint, action) => {
                  try {
                    const response = await listener(payload, breakpoint, action)
                    actions[`${actionKey}Success`](response)
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
      loaders: {before: 'actionCreators'},
    },
  }
}

