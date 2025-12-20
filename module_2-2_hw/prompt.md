
## Initial Prompt

Build an initial baseline version of a collaborative coding interview web app.

**Baseline Scope**

* This is a v0 prototype, build the simplest version satisfying the requirements.
* No authentication is required.
* No testing is required.

**Frontend Requirements**

* A single-page application deployable to a webpage.
* Users can start a new session via a button.
* When a session starts, generate a session link.
* Any user with the session link can join the same session.
* The UI should include:
    - A shared code editor panel.
    - A language selection dropdown.
    - A “Run Code” button.
    - A second panel showing execution output (stdout and errors).
    - An "End Session" button.
* Multiple users can edit the code editor simultaneously.
    - A simple shared text buffer with last-write-wins behavior is acceptable for this baseline.
* All edits should be visible to all connected users in real time.
* Syntax highlighting should update based on the selected language.

**Backend Requirements**

* Provide an API to:
    - Create a new session.
    - Join an existing session by session ID.
* Each session should maintain:
    - A shared text buffer.
    - A selected programming language.
* Sessions are temporary and stored in memory.
* Sessions expire after inactivity (no connected users or edits), set the timeout for 15 minutes.
* Session end or expiry disconnects all users and invalidates session link.
* Real-time synchronization should be implemented using WebSockets.
* Code execution:
    - Support exactly two languages: Python and JavaScript.
    - Execution is triggered by the Run button.
    - Capture stdout and stderr.
    - Return execution results to all connected users.
    - Code execution does not need to be fully sandboxed for this prototype; basic safeguards are sufficient.

**Technical Stack**

* Frontend: React with CodeMirror code editor.
    - use concurrently to provide a command that starts both frontend and backend services.
    - concurrently is intended for development, partition it from the main code.
* Backend: Python with FastAPI
    - Dependency and environment management should be handled using uv.
    - Dependencies should be declared in pyproject.toml.
    - A lockfile should be included to ensure reproducible installs.
    - Instructions should assume developers use uv to run the backend locally.

**Deliverables**

* Basic project structure.
* Clear separation of frontend and backend.
* Instructions for running the app locally.

## Test Creation Prompt

**General Testing Scope**

* Focus on validating core functionality.
* This is a v0 prototype; do not aim for exhaustive coverage.
* Avoid end-to-end browser tests.
* Mock external dependencies where appropriate.

**Backend Tests**

* Use pytest for backend testing.
* Tests may include unit tests and light integration tests using FastAPI’s test client.
* Backend behaviors to test:
    - Session creation returns a valid session ID.
    - Joining an existing session succeeds.
    - Ending or expiring a session removes it from in-memory storage.
* Code execution:
    - Python code executes and returns stdout.
    - JavaScript code executes and returns stdout.
    - Errors during execution are captured and returned.
* Backend testing constraints:
    - Do not test WebSocket concurrency behavior.
    - Do not test performance or security hardening.

**Frontend Tests**

* Use Jest and React Testing Library.
* Focus on component rendering and user interactions.
* Frontend behaviors to test:
    - The app renders without errors.
    - Clicking “Start Session” initiates a session.
    - The code editor component renders.
    - Changing the language dropdown updates application state.
    - Clicking “Run Code” triggers a request to execute code.
    - The output panel displays execution results.
* Frontend testing constraints:
    - Do not test real-time multi-user behavior.
    - Do not test WebSocket internals.
    - Do not perform full end-to-end browser testing.

**Deliverables**
    - Backend test files with clear organization.
    - Frontend test files colocated with components or in a test directory.
    - Instructions for running tests locally - written to README.md