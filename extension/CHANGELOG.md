# Change Log

## Unreleased

- Renamed **Private Extensions: Clean NPM Cache** to **Private Extensions: Garbage Collect NPM Cache**.
- Added a **Private Extensions: Delete NPM Cache** command to completely delete the cache.

## 1.3.0-beta.0

- Upgraded [npm-registry-fetch](https://github.com/npm/npm-registry-fetch#-fetch-options) again
  now that the issues with it are fixed.
- Changed recommended extensions to not be hidden when installed. Fixed "no recommended extensions found"
  message when there are recommended extensions, but they are all installed.

## 1.2.0

- Temporarily reverted npm-registry-fetch to the previous version, as it wasn't working with some registries.
- Added welcome views for when no registries are configured.
- Cache cleaning slowed startup down too much and is no longer automatic. It can
  now be run manually with the **Private Extensions: Clean NPM Cache** command.

## 1.1.0

- **Breaking change**: [npm-registry-fetch](https://github.com/npm/npm-registry-fetch#-fetch-options)
  has removed several option aliases. If you use any registry options other than
  `name`, `registry`, and `query`, double check your option names.
- Added `enablePagination` option to work around servers that don't properly handle pagination options.
- A warning is now shown if a server returns too many results instead of continuing to make requests forever.
- NPM cache is now cleaned to free up disk space that's no longer needed.

## 1.0.0

- Changes for marketplace release
- Added support for tracking channels
- Fixed sort order for "Install Another Version" command
- Updated theme to match VS Code version 1.42

## 0.9.0-beta.0

- Initial release