# Style

### General
- Use LF for newlines, never CR-LF unless technically unavoidable.

### Typescript imports
- One line per `import` statement, e.g. `import type { Commit, DeltaCommit, ReadonlyVersionControl, Steps, VersionControlChange } from "./VersionControl.svelte";`. Don't pretty-print. One rarely actually reads inside them.
- Organize imports roughly in the following order:
  - helpers/utilities, including I18n and `zod`, whether 3rd-party or not;
  - other non-component source files in project, grouped by folder, preferring `$lib` etc over too many `..`s, and files closer to the current directory towards the end;
  - 3rd party imports that are related to the logic;
  - Svelte components, including 3rd-party ones.
- For files with many lines of import you can add blank lines between groups, but don't do this excessively.

### Linting
- Rust: Use clippy `--pedentic` and clean up all warnings. Some are impossible to fix, e.g. tauri commands require some parameters to be passed by value (but note that `&str` is ok), so you can add an `#[allow]`.
- TypeScript: Use `eslint` if present in the project. If not present, stick to common sense (eg. prefer `const` when possible).

### Comments
- Keep comments short at 1-2 lines long, except for places that are extremely confusing or important.
- Comments don't have to be in formal, complete sentences. Just convey your meaning clearly.
- Comments that aren't complete sentences shouldn't be capitalized and shouldn't end with a period.
- Use cases of comments:
  - To explain logic that is confusing or difficult to understand.
  - To serve as navigational aid in long functions that shows what this part is doing. This is often important to have, but don't overuse.
  - (docstrings) To document the meaning and usage of fields, methods etc. Focus on non-obvious aspects only. For self-evident identifiers, don't add docstrings or only add a minimal oneliner.
  - (TODO, FIXME etc) To remind us that something is not done or questionable although we don't plan to change it immediately.

### TypeScript
- Prefer using the same names for `zod` schemas and their types. TypeScript will merge them. The only exception is when you need to name another object after the type (for the typical case see below).
- For utility functions tied to a specific `type`, use a namespace with the same name as the type. TypeScript will merge them. For example, if `RichText` is defined using `export type = ...`, put related functions in `export namespace RichText`, which feels more object-oriented.

# Architecture

- Prefer generating TypeScript type bindings with the `ts-rs` crate; generate them into `src/lib/bindings/`.
  - Add `TS_RS_EXPORT_DIR = { value = "../path/to/bindings/", relative = true }`  to the `env` section of `src-tauri/.cargo/config.toml`.
- Value conciseness, elegance and DRY. Before adding something, think about if it's really needed for what you want to do.
- If possible, prefer making invalid states unrepresentable.

# Tooling

- Always use `pnpm` instead of `npm`
- Always use `rg` instead of `grep`
- If you use python to do something remember to use `uv` and not pollute the global environment
- If you need temporary files, just put them somewhere inside the working directory and delete later. This avoids the harness waiting for me to approve the path access.
- If you want to look at git history, don't just read the first lines of commit messages. I often commit multiple unrelated changes together because my brain just seems to work in parallel.

# Reporting

Put your notes and reports etc in `documents/`. However, when consulting that folder, which you normally doesn't need to, keep in mind that the contents may well be outdated.

# Miscellaneous

Sometimes the user modifies things between turns. If you notice, don't wonder, just silently reread the affected files. If (and only if) the modification is relevant to what you're doing, it might be useful to interpret that as a hint of what direction to take.

Don't automatically commit by default, but sometimes you'll be asked to do so.
