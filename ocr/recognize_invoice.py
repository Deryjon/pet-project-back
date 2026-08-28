#!/usr/bin/env python3
import json
import re
import sys

from paddleocr import PaddleOCR


def number(value):
    cleaned = re.sub(r"[^0-9,.-]", "", value).replace(" ", "")
    if cleaned.count(",") == 1 and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    else:
        cleaned = cleaned.replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def result_data(result):
    value = getattr(result, "json", result)
    if callable(value):
        value = value()
    if isinstance(value, str):
        value = json.loads(value)
    return value.get("res", value)


def rows_from_result(result):
    data = result_data(result)
    texts = data.get("rec_texts", [])
    boxes = data.get("rec_boxes", [])
    cells = []
    for text, box in zip(texts, boxes):
        if not str(text).strip() or len(box) < 4:
            continue
        cells.append({"text": str(text).strip(), "x": float(box[0]), "y": (float(box[1]) + float(box[3])) / 2, "h": max(1, float(box[3]) - float(box[1]))})
    cells.sort(key=lambda cell: (cell["y"], cell["x"]))
    rows = []
    for cell in cells:
        row = next((candidate for candidate in reversed(rows[-4:]) if abs(candidate["y"] - cell["y"]) <= max(candidate["h"], cell["h"]) * 0.65), None)
        if row is None:
            row = {"y": cell["y"], "h": cell["h"], "cells": []}
            rows.append(row)
        row["cells"].append(cell)
    return [sorted(row["cells"], key=lambda cell: cell["x"]) for row in rows]


def invoice_items(rows):
    items = []
    for cells in rows:
        values = [cell["text"] for cell in cells]
        numeric = [(index, number(value)) for index, value in enumerate(values)]
        numeric = [(index, value) for index, value in numeric if value is not None]
        if len(numeric) < 2:
            continue
        # Typical right side: quantity, unit price, total. With only two numbers,
        # total is derived and the row remains reviewable in CRM.
        tail = numeric[-3:]
        if len(tail) >= 3:
            quantity, supply_price, total_price = tail[-3][1], tail[-2][1], tail[-1][1]
            name_end = tail[-3][0]
        else:
            quantity, supply_price = tail[-2][1], tail[-1][1]
            total_price = quantity * supply_price
            name_end = tail[-2][0]
        name_parts = values[:name_end]
        if name_parts and re.fullmatch(r"\d+[.)]?", name_parts[0]):
            name_parts = name_parts[1:]
        raw_name = " ".join(name_parts).strip(" -|")
        if not raw_name or quantity <= 0 or supply_price < 0:
            continue
        items.append({"rawName": raw_name, "sku": None, "barcode": None, "quantity": quantity, "supplyPrice": supply_price, "totalPrice": total_price})
    return items


def main():
    if len(sys.argv) < 2:
        raise SystemExit("At least one file is required")
    ocr = PaddleOCR(lang="ru", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
    rows = []
    for path in sys.argv[1:]:
        for result in ocr.predict(path):
            rows.extend(rows_from_result(result))
    print(json.dumps({"invoiceNumber": None, "invoiceDate": None, "items": invoice_items(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
