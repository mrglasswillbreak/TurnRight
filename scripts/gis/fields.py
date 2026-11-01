"""Restricted expressions and validated output field schemas for isolated GIS processing."""

import ast
import math
import operator
import re


def calculate(expression, values):
    """Interpret a small expression tree; never execute Python or access attributes."""
    if not isinstance(expression, str) or len(expression) > 2000:
        raise ValueError("Use an expression of at most 2,000 characters")
    tree = ast.parse(expression, mode="eval")
    if len(list(ast.walk(tree))) > 200:
        raise ValueError("Calculation is too complex")
    binary = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Mod: operator.mod,
    }
    functions = {
        "abs": abs,
        "round": round,
        "min": min,
        "max": max,
        "coalesce": lambda *v: next((x for x in v if x is not None), None),
        "concat": lambda *v: "".join("" if x is None else str(x) for x in v),
        "lower": lambda v: str(v).lower(),
        "upper": lambda v: str(v).upper(),
    }

    def visit(node):
        if isinstance(node, ast.Expression):
            return visit(node.body)
        if isinstance(node, ast.Constant) and isinstance(
            node.value, (str, int, float, bool, type(None))
        ):
            return node.value
        if isinstance(node, ast.Name) and not node.id.startswith("_"):
            if node.id not in values:
                raise ValueError("Unknown field: " + node.id)
            return values[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            value = visit(node.operand)
            if not isinstance(value, (int, float)):
                raise ValueError("Arithmetic needs numeric values")
            return -value if isinstance(node.op, ast.USub) else value
        if isinstance(node, ast.BinOp) and type(node.op) in binary:
            a, b = visit(node.left), visit(node.right)
            if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
                raise ValueError("Arithmetic needs numbers; use concat for text")
            return binary[type(node.op)](a, b)
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in functions
            and not node.keywords
            and len(node.args) <= 20
        ):
            return functions[node.func.id](*(visit(v) for v in node.args))
        raise ValueError(
            "Allowed: fields, constants, arithmetic, abs, round, min, max, coalesce, concat, lower, upper"
        )

    result = visit(tree)
    if isinstance(result, (float, int)) and (
        not math.isfinite(result) or abs(result) > 1e100
    ):
        raise ValueError("Calculation is not a finite number")
    if isinstance(result, str) and len(result) > 10000:
        raise ValueError("Calculated text is too long")
    return result


def infer_schema(features, original):
    present = {k for feature in features for k in feature["properties"]}
    known = {
        f["name"]: dict(f, public=False)
        for f in original.get("fields", [])
        if f["name"] in present
    }
    inferred = {}
    for feature in features:
        for key, value in feature["properties"].items():
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", key) or key in (
                "__proto__",
                "constructor",
                "prototype",
            ):
                raise ValueError(
                    "Rename fields before processing: "
                    + key
                    + " is not a supported output field name"
                )
            if key not in known and value is not None:
                kind = (
                    "boolean"
                    if isinstance(value, bool)
                    else "number"
                    if isinstance(value, (float, int))
                    else "text"
                )
                if key in inferred and inferred[key] != kind:
                    raise ValueError(
                        "Calculated values have inconsistent types: " + key
                    )
                inferred[key] = kind
    for key in sorted(present - known.keys()):
        known[key] = {"name": key, "type": inferred.get(key, "text"), "public": False}
    if len(known) > 100:
        raise ValueError("Result exceeds 100 fields; choose fewer join fields")
    return {"version": 1, "fields": list(known.values())}
