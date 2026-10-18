## [T___] <task title>

**Task:** `agents/tasks/T___-....md`

### Summary
What the module does, in a few sentences.

### API (what the lead calls)
```ts
// the exported types and functions, with one line each
```

### Tests
- `tests/ext-<feature>.test.ts`: what each test checks
- Key numbers printed by the tests (capacities, times, counts)
- `npm run typecheck`: pass · `npm test`: <n> pass, 0 fail

### Integration notes (for the lead; nothing outside `src/game/ext/` was changed)
- Where it plugs in (the city worker step, the engine tool, the renderer, the save), and what each needs from it
- Data the renderer needs per frame (sizes, how often)
- Performance: the cost per sim step at the task's target scale

### Unsure / not done
- Anything ambiguous in the spec, and the choice made
