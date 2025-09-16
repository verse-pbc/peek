Update task completion status in the current feature's tasks.md file.

This command manages task state during implementation, maintaining proper TDD flow and parallel execution tracking.

When invoked with task IDs (e.g., "T001,T004,T007" or "T001-T005"), do this:

1. **Validate feature context:**
   - Run `scripts/get-feature-paths.sh` to get TASKS path
   - If not on feature branch or tasks.md missing, report error
   - Read current tasks.md file

2. **Parse task identifiers from arguments:**
   - Single task: "T001"
   - Multiple tasks: "T001,T004,T007"
   - Range: "T001-T005"
   - Special: "current" (finds first unchecked task)
   - Special: "next" (finds next task respecting dependencies)

3. **For each task to update:**
   - Find the task line by ID (e.g., "T001")
   - Change `- [ ]` to `- [x]` to mark complete
   - **KEEP the [P] marker** - it documents that the task was parallelizable
   - Format: `- [x] T001 [P] Task description` (completed parallel task)
   - Format: `- [x] T001 Task description` (completed sequential task)

4. **Validate TDD compliance:**
   - For implementation tasks, check that corresponding test tasks are marked complete
   - If test not complete: ERROR "Test T00X must be completed before implementation T00Y (TDD violation)"
   - Exception: Setup and documentation tasks don't require tests

5. **Check dependencies:**
   - Verify all dependency tasks are complete before marking dependent task
   - If dependency not met: ERROR "Task T00X depends on T00Y which is not complete"

6. **Update task phases:**
   - If all tasks in a phase are complete, add phase completion marker:
     ```
     ## Phase 3.2: Tests First ✓ COMPLETE
     ```

7. **Write updated tasks.md:**
   - Preserve all content except checkbox states
   - Maintain formatting and [P] markers
   - Add completion timestamp comment if requested

8. **Report results:**
   ```
   Updated tasks in specs/XXX-feature/tasks.md:
   ✓ T001 [P] Create project structure
   ✓ T004 [P] Contract test POST /api/users

   Progress: 5/23 tasks complete (22%)
   Current Phase: Tests First (3/4 complete)
   Next suggested tasks: T005, T006 (can run in parallel)
   ```

## Task State Rules:
- `- [ ]` = Not started
- `- [x]` = Complete
- [P] marker STAYS after completion (historical record of parallelizability)
- Tests must be complete before their implementation tasks (TDD)
- Dependencies must be respected

## Arguments:
- Task IDs: $ARGUMENTS (e.g., "T001", "T001,T004", "T001-T005", "current", "next")
- Optional flags:
  - `--check`: Dry run, show what would change
  - `--force`: Skip TDD and dependency checks (NOT RECOMMENDED)
  - `--timestamp`: Add completion timestamp as comment

## Examples:
```
/task-update T001
/task-update T004,T005,T006
/task-update T001-T007
/task-update current
/task-update next
/task-update T008 --check
```

Note: This command enforces TDD by default. Tests must be written and marked complete before implementation tasks can be marked complete.
