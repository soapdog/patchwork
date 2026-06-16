const path = require('path')
const fs = require('fs/promises')
const homedir = require('os').homedir();
const _ = require('lodash')

function extractDepjectFields(module) {
    return {
        needs: module.needs,
        gives: module.gives,
        create: module.create
    }
}

function loadPlugins(pluginPath, pluginDirectoryNames) {    
    const pluginDepjectModules = pluginDirectoryNames
        .map(pluginFolder => require(path.resolve(path.resolve(pluginPath, pluginFolder), 'index.js')))
        
    const modules = pluginDepjectModules.map(extractDepjectFields)
    const allModules = _.reduce(modules, _.merge, {})

    return allModules
}

module.exports = async () => {
    const pluginPath = path.resolve(homedir, '.poncho-external-plugins');

    return fs.readdir(pluginPath, 'UTF-8')
        .then(directories => loadPlugins(pluginPath, directories))
        .catch(error => {
            console.log(`Error while loading external plugin: ${error}`)
            return {}
        })
}