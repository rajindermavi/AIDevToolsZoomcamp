import pytest

from app.main import RunResult, execute_code


@pytest.mark.asyncio
async def test_python_execution_stdout():
    result: RunResult = await execute_code("python", 'print("hello")')
    assert "hello" in result.stdout
    assert result.stderr == ""


@pytest.mark.asyncio
async def test_javascript_execution_stdout():
    result: RunResult = await execute_code("javascript", 'console.log("hi")')
    assert "hi" in result.stdout
    assert result.stderr == ""


@pytest.mark.asyncio
async def test_execution_error_captured():
    result: RunResult = await execute_code("python", 'raise ValueError("boom")')
    assert "boom" in result.stderr
