#!/usr/bin/env python3
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from api_client import AtlassianGoalsClient

# Credentials live in the vault .env (never in the engine checkout).
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "skills"))
import ozos_vault  # noqa: E402

VAULT_ENV = ozos_vault.vault_dir() / ".env"
load_dotenv(VAULT_ENV)


def _require(name: str) -> str:
    val = os.getenv(name)
    if not val:
        print(f"ERROR: {name} not set. Add it to the vault .env ({VAULT_ENV})", file=sys.stderr)
        sys.exit(1)
    return val


client = AtlassianGoalsClient(
    email=_require("ATLASSIAN_EMAIL"),
    api_token=_require("ATLASSIAN_TOKEN"),
    subdomain=_require("ATLASSIAN_SUBDOMAIN"),
    cloud_id=_require("ATLASSIAN_CLOUD_ID"),
)

mcp = FastMCP("atlassian-goals")


@mcp.tool()
async def list_goals(status: str = None, limit: int = 50) -> str:
    """
    List goals from Atlassian Atlas.

    Args:
        status: Filter by status. One of: on_track, at_risk, off_track, complete, cancelled
        limit: Maximum number of goals to return (default 50)
    """
    return await client.list_goals(status=status, limit=limit)


@mcp.tool()
async def get_goal(goal_id: str) -> str:
    """
    Get full details for a single Atlassian Atlas goal.

    Args:
        goal_id: The goal ID — visible in the Atlas URL or returned by list_goals
    """
    return await client.get_goal(goal_id=goal_id)


@mcp.tool()
async def list_key_results(goal_id: str) -> str:
    """
    List all key results attached to an Atlassian Atlas goal.

    Args:
        goal_id: The goal ID
    """
    return await client.list_key_results(goal_id=goal_id)


@mcp.tool()
async def list_checkins(goal_id: str) -> str:
    """
    List check-ins and updates posted against an Atlassian Atlas goal.

    Args:
        goal_id: The goal ID
    """
    return await client.list_checkins(goal_id=goal_id)


@mcp.tool()
async def update_goal_status(goal_id: str, status: str) -> str:
    """
    Update the status of an Atlassian Atlas goal.

    Args:
        goal_id: The goal ID
        status: New status. Must be one of: on_track, at_risk, off_track, complete, cancelled
    """
    return await client.update_goal_status(goal_id=goal_id, status=status)


@mcp.tool()
async def test_connection() -> str:
    """
    Test that Atlassian API credentials are working correctly.
    Run this first after setup to confirm everything is configured.
    """
    result = await client.test_connection()
    if result.startswith("Error:"):
        return f"Connection FAILED: {result}"
    return "Connection OK — credentials are valid and API is reachable."


if __name__ == "__main__":
    mcp.run()
