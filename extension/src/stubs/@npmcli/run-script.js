const runScript = (options) => {
    console.warn('Ignoring NPM script:', options);
    return Promise.resolve({ code: 0, signal: null });
};

module.exports = runScript;
