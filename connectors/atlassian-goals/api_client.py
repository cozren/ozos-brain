import base64
import json
from typing import Optional

import httpx

VALID_STATUSES = {"on_track", "at_risk", "off_track", "complete", "cancelled", "pending"}

_LIST_GOALS = """
query ListGoals($containerId: ID!, $first: Int) {
  goals_search(containerId: $containerId, first: $first) {
    edges {
      node {
        id
        name
        status { value }
        progress { percentage }
        owner { accountId name }
        targetDate { label }
        startDate
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
"""

_GET_GOAL = """
query GetGoal($goalId: ID!) {
  goals_byId(goalId: $goalId) {
    id name
    status { value }
    description
    progress { percentage }
    owner { accountId name }
    targetDate { label }
    startDate
    creationDate
    metricTargets {
      edges {
        node { id metric { name type } startValue targetValue snapshotValue { value } }
      }
    }
    updates(first: 10) @optIn(to: "Townsquare") {
      edges {
        node {
          id summary creationDate
          newState { label }
          creator { accountId name }
        }
      }
    }
  }
}
"""

_LIST_KEY_RESULTS = """
query ListKeyResults($goalId: ID!) {
  goals_byId(goalId: $goalId) {
    id name
    metricTargets {
      edges {
        node {
          id
          metric { name type }
          startValue
          targetValue
          snapshotValue { value }
        }
      }
    }
  }
}
"""

_LIST_CHECKINS = """
query ListCheckins($goalId: ID!, $first: Int) {
  goals_byId(goalId: $goalId) {
    id name
    updates(first: $first) @optIn(to: "Townsquare") {
      edges {
        node {
          id summary creationDate
          newState { label }
          creator { accountId name }
        }
      }
    }
  }
}
"""

_UPDATE_STATUS = """
mutation UpdateGoalStatus($input: TownsquareGoalsCreateUpdateInput!) {
  goals_createUpdate(input: $input) {
    ... on TownsquareGoalUpdate {
      id
      newState { label }
      goal { id name status { value } }
    }
  }
}
"""


class AtlassianGoalsClient:
    def __init__(self, email: str, api_token: str, subdomain: str, cloud_id: str):
        self.container_id = f"ari:cloud:townsquare::site/{cloud_id}"
        self.endpoint = f"https://{subdomain}.atlassian.net/gateway/api/graphql"
        encoded = base64.b64encode(f"{email}:{api_token}".encode()).decode()
        self.headers = {
            "Authorization": f"Basic {encoded}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def list_goals(self, status: Optional[str] = None, limit: int = 50) -> str:
        result = await self._gql(_LIST_GOALS, {"containerId": self.container_id, "first": limit})
        if _is_error(result):
            return result
        data = json.loads(result)
        goals = [edge["node"] for edge in data["goals_search"]["edges"]]
        if status:
            goals = [g for g in goals if g.get("status", {}).get("value") == status]
        return json.dumps(goals, indent=2)

    async def get_goal(self, goal_id: str) -> str:
        result = await self._gql(_GET_GOAL, {"goalId": goal_id})
        if _is_error(result):
            return result
        data = json.loads(result)
        return json.dumps(data["goals_byId"], indent=2)

    async def list_key_results(self, goal_id: str) -> str:
        result = await self._gql(_LIST_KEY_RESULTS, {"goalId": goal_id})
        if _is_error(result):
            return result
        data = json.loads(result)
        goal = data["goals_byId"]
        krs = [edge["node"] for edge in goal["metricTargets"]["edges"]]
        return json.dumps(
            {"goalId": goal["id"], "goalName": goal["name"], "keyResults": krs}, indent=2
        )

    async def list_checkins(self, goal_id: str, limit: int = 20) -> str:
        result = await self._gql(_LIST_CHECKINS, {"goalId": goal_id, "first": limit})
        if _is_error(result):
            return result
        data = json.loads(result)
        goal = data["goals_byId"]
        updates = [edge["node"] for edge in goal["updates"]["edges"]]
        return json.dumps(
            {"goalId": goal["id"], "goalName": goal["name"], "checkins": updates}, indent=2
        )

    async def update_goal_status(
        self, goal_id: str, status: str, summary: Optional[str] = None
    ) -> str:
        if status not in VALID_STATUSES:
            valid = ", ".join(sorted(VALID_STATUSES))
            return f"Invalid status '{status}'. Valid values: {valid}"
        inp: dict = {"goalId": goal_id, "status": status}
        if summary:
            inp["summary"] = summary
        return await self._gql(_UPDATE_STATUS, {"input": inp})

    async def test_connection(self) -> str:
        return await self._gql(_LIST_GOALS, {"containerId": self.container_id, "first": 1})

    async def _gql(self, query: str, variables: Optional[dict] = None) -> str:
        payload: dict = {"query": query}
        if variables:
            payload["variables"] = variables
        try:
            async with httpx.AsyncClient() as http:
                resp = await http.post(
                    self.endpoint, headers=self.headers, json=payload, timeout=15
                )
                return _handle_response(resp)
        except httpx.RequestError as e:
            return f"Error: Network error: {e}"


def _is_error(result: str) -> bool:
    return result.startswith("Error:")


def _handle_response(resp: httpx.Response) -> str:
    if resp.status_code == 401:
        return "Error: Authentication failed — check ATLASSIAN_EMAIL and ATLASSIAN_TOKEN in .env"
    if not resp.is_success:
        return f"Error: API error {resp.status_code}: {resp.text}"
    try:
        data = resp.json()
    except Exception:
        return resp.text
    if "errors" in data and data["errors"]:
        msgs = [e.get("message", str(e)) for e in data["errors"]]
        return f"Error: GraphQL errors: {'; '.join(msgs)}"
    return json.dumps(data.get("data", data), indent=2)
