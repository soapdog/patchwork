const features = new Map()

const enableFeature = (key) => {
  console.log(`= ENABLING FEATURE: ${key}`)
  features.set(key, true)
}

const disableFeature = (key) => {
  console.log(`= DISABLING FEATURE: ${key}`)
  features.set(key, false)
}

const isFeatureEnabled = (key) => {
  const is = features.get(key)

  if (is === undefined) {
    return false
  }
  return is
}

module.exports = {
  enableFeature,
  disableFeature,
  isFeatureEnabled
}
