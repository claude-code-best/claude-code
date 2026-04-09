import { registerBundledSkill } from '../bundledSkills.js'

const TDD_PROMPT = `You are executing a comprehensive testing workflow to ensure code quality.

---

User Input: $ARGUMENTS

---

## Testing Activity

After coding is complete, proactive testing should be performed as much as possible to ensure code correctness and avoid potential issues caused by changes.

---

## Testing Execution Process

Follow these steps in order, using the \`todowrite\` tool to track progress:

**Step 1: Execute Runnability Verification**

Use the \`@RunAndFix\` agent to verify the project can run/compile:
- The agent will automatically find and execute verification commands
- It will fix any coding issues encountered (syntax errors, type errors, logic bugs, etc.)
- It will exit and report non-coding issues (missing dependencies, environment problems, etc.)
- Wait for verification to complete and review the results

If verification fails with coding issues:
- The agent will have applied fixes automatically
- Proceed to confirm user requirements

If verification reports non-coding issues:
- These require manual resolution (e.g., npm install, environment setup)
- Pause and inform user that non-coding issues need to be resolved first
- Wait for user confirmation before continuing

**Step 2: Confirm User Requirements**

After project is verified to be buildable/runnable:

**If user provided input above ($ARGUMENTS is not empty)**:
- Use the user's input as the primary test scope and requirements
- The input may specify:
  - Specific modules/features to test (e.g., "test the login module")
  - Test types to focus on (e.g., "only unit tests for API layer")
  - Specific files or paths (e.g., "test src/auth/login.ts")
  - Additional context or constraints

**If no user input provided ($ARGUMENTS is empty)**:
1. If the user is using plan mode, search for requirement proposals in '.cospec/plan/changes/'
2. Otherwise, confirm the functional requirements based on the user's recent messages and code changes
3. Clearly identify what functionality needs to be tested

**IMPORTANT: After confirming user requirements, you MUST use the \`question\` tool to get user confirmation before proceeding to Step 3**
- Present the confirmed requirements to the user
- Ask if they want to proceed with test case generation or if they need adjustments

**Step 3: Generate Test Cases**

Use the \`@TestDesign\` agent to generate test cases:
- Input: User requirement description, related code paths
- The agent will design comprehensive test points covering:
  - Normal scenarios
  - Boundary conditions
  - Exception handling
- Output: Test plan document saved to \`.cospec/test-plans/test-plan-*.md\`

Review the generated test plan with the user if needed

**Step 4: Execute Tests and Fix**

Use the \`@TestAndFix\` agent to execute tests and fix failures:
- Input: Test plan document path (optional), test scope
- The agent will:
  - Execute the tests
  - Diagnose failures systematically
  - Apply fixes (prioritizing business code over test code)
  - Re-run tests to verify fixes (max 3 rounds)
- Output: Test execution report with fix details

---

## Progress Tracking

Use the \`todowrite\` tool to manage and track progress through these steps:

1. Create todos at the start:
   - Execute runnability verification with @RunAndFix
   - Confirm user requirements
   - Generate test cases with @TestDesign
   - Execute tests and fix failures with @TestAndFix

2. Update todo status as you complete each step:
   - Mark each step as \`in_progress\` when starting
   - Mark each step as \`completed\` when finished

---

## Important Notes

- Ensure a test guide document (TEST_GUIDE.md or .cospec/TEST_GUIDE.md) exists so agents understand the project's testing mechanisms
- Test plan documents are saved to \`.cospec/test-plans/\` directory
- Automated fixes execute a maximum of 3 rounds; complex issues may require manual intervention
- Always prioritize fixing business code rather than lowering test standards

---

## Execution

Start by confirming the user requirements, then proceed with test case generation and execution. Follow the four-step process systematically, using the \`todowrite\` tool to track progress, to ensure thorough testing and quality code.`

export function registerTddSkill(): void {
  registerBundledSkill({
    name: 'test',
    description:
      'execute comprehensive testing workflow: confirm requirements, generate test cases, and execute tests with automated fixes',
    userInvocable: true,
    async getPromptForCommand(args) {
      const prompt = TDD_PROMPT.replace(/\$ARGUMENTS/g, args || '')
      return [{ type: 'text', text: prompt }]
    },
  })
}
