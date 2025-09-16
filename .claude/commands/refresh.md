Refresh context by re-reading the spec, plan, and tasks for the current feature.

This command helps restore Claude's context during long implementation sessions by re-reading all relevant documentation in the proper order.

When invoked, do this:

1. **Identify current feature context using existing scripts:**
   - Run `scripts/get-feature-paths.sh` from repo root to get all paths
   - Parse output for: REPO_ROOT, BRANCH, FEATURE_DIR, FEATURE_SPEC, IMPL_PLAN, TASKS
   - If script fails (not on feature branch), report error and suggest using `/specify` first

2. **Read foundational documents in sequence:**
   - Read `$REPO_ROOT/memory/constitution.md` for project guidelines and constraints:
     * Simplicity principles (max 3 projects, no wrapper classes)
     * TDD requirements (RED-GREEN-Refactor mandatory)
     * Architecture patterns (libraries over direct app code)
   - Read `$FEATURE_SPEC` (from step 1) to understand:
     * Feature description and business value from Input section
     * User scenarios and acceptance criteria
     * Functional requirements (FR-XXX items)
     * Key entities and their relationships
     * Review checklist status

3. **Read implementation planning documents:**
   - Read `$IMPL_PLAN` to understand:
     * Technical Context: Language, Framework, Storage, Testing tools
     * Constitution Check results (any violations and justifications)
     * Project Structure decision (Single/Web/Mobile)
     * Phase completion status from Progress Tracking section
     * Complexity tracking if deviations exist

4. **Check which supporting documents exist using scripts:**
   - Run `scripts/check-task-prerequisites.sh --json` to get AVAILABLE_DOCS list
   - For each available document, read and extract:
     * `research.md`: Technology decisions, alternatives considered, rationale
     * `data-model.md`: Entities, fields, relationships, validation rules
     * `contracts/`: OpenAPI/GraphQL schemas, endpoint definitions
     * `quickstart.md`: Manual testing steps, validation procedures
   - Note: Not all features have all documents (e.g., CLI tools may lack contracts)

5. **Read task breakdown and progress:**
   - Read `$TASKS` file to understand:
     * Task phases (Setup, Tests First, Core Implementation, Integration, Polish)
     * [P] markers indicating parallel execution opportunities
     * Specific file paths for each task
     * Dependencies between tasks
     * TDD enforcement (tests MUST be written and fail before implementation)
   - Count completed tasks (marked with [x]) vs total
   - Note: [P] markers remain after completion as documentation
   - Identify current phase based on task completion pattern
   - Check TDD compliance: Are test tasks complete before implementation?
   - Note any blocked tasks due to dependencies

6. **Check current implementation state:**
   - Run `git status --porcelain` to see modified/new files
   - Check if test files exist and their state:
     * Contract tests in `tests/contract/`
     * Integration tests in `tests/integration/`
     * Unit tests in `tests/unit/`
   - For web apps, check both `backend/` and `frontend/` directories
   - Run `git log --oneline -10` to see recent commits and TDD compliance

7. **Provide comprehensive context summary:**
   ```
   === FEATURE CONTEXT RESTORED ===
   Branch: [branch-name]
   Feature: [feature name from spec]
   Status: [Phase X.Y from tasks.md]

   SUMMARY:
   [2-3 sentence description from spec.md Summary section]

   TECH STACK:
   - Language: [from plan.md]
   - Framework: [from plan.md]
   - Testing: [from plan.md]
   - Structure: [Single/Web/Mobile from plan.md]

   CONSTITUTION COMPLIANCE:
   - TDD Status: [check if tests exist before implementation]
   - Simplicity: [note any complexity violations from plan.md]
   - Architecture: [library-first approach status]

   PROGRESS:
   - Completed: [X/Y tasks]
   - Current Phase: [Setup/Tests/Implementation/Integration/Polish]
   - Next Tasks: [list unchecked tasks with no blocking dependencies]
   - Blocked Tasks: [list tasks waiting on dependencies]

   MODIFIED FILES:
   [list from git status]

   RECENT COMMITS:
   [last 3 commits showing TDD pattern]

   RECOMMENDED NEXT ACTIONS:
   1. [specific next task from tasks.md]
   2. [parallel tasks that can be done together]
   3. [any failing tests to fix]
   ```

8. **Optional context enhancement (if arguments provided):**
   - If user provides specific focus area:
     * "tests" - List all test files and their pass/fail status
     * "api" or "backend" - Focus on contracts and backend implementation
     * "frontend" - Focus on UI components and pages
     * "tdd" - Verify RED-GREEN-Refactor compliance for each task
   - If user provides "verbose" flag:
     * Include full Technical Context from plan.md
     * List all tasks with their exact descriptions
     * Show complete file tree of modified files
   - If user provides "check" flag:
     * Run constitution compliance checks
     * Verify TDD is being followed
     * Check for architecture violations

Context focus (optional): $ARGUMENTS

This command acts as a "context restore point" allowing Claude to quickly regain understanding of the entire feature implementation state without forgetting important details from earlier in the session. Use this whenever you feel Claude has lost track of what it was doing or when resuming work after a break.

## Error Handling
- If not on feature branch: "ERROR: Not on feature branch. Run /specify first"
- If spec missing: "ERROR: No spec.md found. Run /specify to create specification"
- If plan missing: "ERROR: No plan.md found. Run /plan to create implementation plan"
- If tasks missing: "WARNING: No tasks.md found. Run /tasks to generate task list"

## Integration with spec-kit workflow
- Uses existing bash scripts for path resolution (DRY principle)
- Follows same error patterns as other commands
- Complements the specify→plan→tasks workflow by providing context restoration
- Does not modify any files (read-only operation)

Note: This command is read-only and makes no modifications. It's safe to run at any time to refresh understanding of the current feature state.
