"""Canonical cached-source encoding and complete OSM validation."""

from datetime import datetime, timezone
from defusedxml import ElementTree as ET
import json


def UTC():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def validate_osm(raw):
    tree = ET.fromstring(raw)
    if tree.tag != "osm" or tree.find("remark") is not None:
        raise ValueError("Overpass returned an error or an incomplete extract")
    records = [e for e in tree if e.tag in ("node", "way", "relation")]
    elements = {(e.tag, e.attrib["id"]): e for e in records}
    if len(elements) != len(records):
        raise ValueError("Duplicated OSM identity")
    for e in elements.values():
        references = [("node", n.attrib["ref"]) for n in e.findall("nd")]
        references += [(m.attrib["type"], m.attrib["ref"]) for m in e.findall("member")]
        for key in references:
            if key not in elements:
                raise ValueError(
                    f"Incomplete OSM reference: {e.tag}/{e.attrib['id']} -> {key}"
                )
    return tree, elements
