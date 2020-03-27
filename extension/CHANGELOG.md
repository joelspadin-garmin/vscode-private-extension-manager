# Change Log

## Unreleased

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