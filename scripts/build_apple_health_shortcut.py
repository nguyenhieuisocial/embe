"""Build the unsigned EmBe Apple Health Shortcut from a reviewed public base."""

from __future__ import annotations

import json
import plistlib
import sys
import urllib.request
from pathlib import Path


BASE_SHORTCUT_ID = "1617296a8c8546b49be47740be2550b3"
INGEST_URL = "https://embe.hieu.asia/api/pregnancy/iphone-health"
HEALTH_TYPES = [
    "Steps",
    "Active Calories",
    "Basal Energy Burned",
    "Sleep",
    "Weight",
    "Height",
    "Walking + Running Distance",
    "Water",
    "Heart Rate",
    "Resting Heart Rate",
    "Respiratory Rate",
    "Blood Oxygen",
    "Body Temperature",
    "Wrist Temperature",
    "Heart Rate Variability",
    "Exercise Time",
    "Mindful Minutes",
    "Blood Pressure Systolic",
    "Blood Pressure Diastolic",
]


def download_base() -> dict:
    record_url = f"https://www.icloud.com/shortcuts/api/records/{BASE_SHORTCUT_ID}"
    with urllib.request.urlopen(record_url, timeout=30) as response:
        record = json.load(response)
    download_url = record["fields"]["shortcut"]["value"]["downloadURL"].replace("${f}", "shortcut")
    with urllib.request.urlopen(download_url, timeout=30) as response:
        return plistlib.loads(response.read())


def token_text(prefix: str = "") -> dict:
    return {
        "Value": {
            "string": f"{prefix}\ufffc",
            "attachmentsByRange": {
                f"{{{len(prefix)}, 1}}": {"VariableName": "Shortcut Input", "Type": "Variable"}
            },
        },
        "WFSerializationType": "WFTextTokenString",
    }


def build(output: Path) -> None:
    workflow = download_base()
    actions = workflow["WFWorkflowActions"]
    list_action = next(action for action in actions if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.list")
    list_action["WFWorkflowActionParameters"]["WFItems"] = HEALTH_TYPES

    url_action = next(action for action in actions if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.url")
    url_action["WFWorkflowActionParameters"]["WFURLActionURL"] = INGEST_URL

    request_action = next(action for action in actions if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl")
    request_action["WFWorkflowActionParameters"]["WFHTTPHeaders"] = {
        "Value": {
            "WFDictionaryFieldValueItems": [
                {
                    "WFKey": {"Value": {"string": "Content-Type", "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"},
                    "WFItemType": 0,
                    "WFValue": {"Value": {"string": "application/json", "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"},
                },
                {
                    "WFKey": {"Value": {"string": "Authorization", "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"},
                    "WFItemType": 0,
                    "WFValue": token_text("Bearer "),
                },
            ]
        },
        "WFSerializationType": "WFDictionaryFieldValue",
    }
    workflow["WFWorkflowTypes"] = []
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY, sort_keys=False))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: build_apple_health_shortcut.py OUTPUT")
    build(Path(sys.argv[1]))
