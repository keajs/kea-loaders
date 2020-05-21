[![NPM Version](https://img.shields.io/npm/v/kea-loaders.svg)](https://www.npmjs.com/package/kea-loaders)
[![minified](https://badgen.net/bundlephobia/min/kea-loaders)](https://bundlephobia.com/result?p=kea-loaders)
[![minified + gzipped](https://badgen.net/bundlephobia/minzip/kea-loaders)](https://bundlephobia.com/result?p=kea-loaders)
[![Backers on Open Collective](https://opencollective.com/kea/backers/badge.svg)](#backers)
[![Sponsors on Open Collective](https://opencollective.com/kea/sponsors/badge.svg)](#sponsors)

# kea-loaders

Loaders plugin for kea. Works with kea `1.0.0` and up.

## What and why?

Loaders abstract away a "request / success / failure / loading" pattern,
common in web applications.

## Getting started

Add the package:

```sh
yarn add kea-loaders
```

... then add it to kea's plugins list:

```js
import { loadersPlugin } from 'kea-loaders'

resetContext({
  plugins: [loadersPlugin({ ...options })]
})
```

## Sample usage

[Read the documentation](https://kea.js.org/docs/plugins/loaders)
