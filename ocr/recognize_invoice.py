#!/usr/bin/env python3
import json
import re
import sys

def number(value):
    # Do not turn digits embedded in product names (20W, T2510, 5A, 1M)
    # into quantities or prices. Receipt quantities may have an X suffix.
    value = str(value).strip()
    if not re.fullmatch(r"[+-]?\d[\d\s]*(?:[.,]\d+)?(?:\s*[xх×])?", value, re.IGNORECASE):
        return None
    cleaned = re.sub(r"[xх×]\s*$", "", value, flags=re.IGNORECASE)
    cleaned = cleaned.replace(" ", "")
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
    blocks = []
    current = None
    for cells in rows:
        row_text = " ".join(cell["text"] for cell in cells).strip()
        if re.search(r"\b(ИТОГО|JAMI|TOTAL)\b", row_text, re.IGNORECASE):
            if current:
                blocks.append(current)
                current = None
            break
        first = cells[0]["text"].strip() if cells else ""
        starts_item = len(cells) > 1 and re.fullmatch(r"\d{1,3}[.)]?", first)
        if starts_item:
            if current:
                blocks.append(current)
            current = [cells]
        elif current:
            current.append(cells)
    if current:
        blocks.append(current)

    for block in blocks:
        cells = [cell for row in block for cell in row]
        # The first number is the line index, not a product value.
        cells = cells[1:]
        numeric = [(cell, number(cell["text"])) for cell in cells]
        numeric = [(cell, value) for cell, value in numeric if value is not None]
        if len(numeric) < 2:
            continue
        quantity = numeric[-2][1]
        supply_price = numeric[-1][1]
        numeric_cells = {id(numeric[-2][0]), id(numeric[-1][0])}
        name_parts = [
            cell["text"]
            for cell in cells
            if id(cell) not in numeric_cells and number(cell["text"]) is None
        ]
        raw_name = " ".join(name_parts).strip(" -|")
        if not raw_name or quantity <= 0 or supply_price < 0:
            continue
        items.append({"rawName": raw_name, "sku": None, "barcode": None, "quantity": quantity, "supplyPrice": supply_price, "totalPrice": quantity * supply_price})
    return items


def main():
    if len(sys.argv) < 2:
        raise SystemExit("At least one file is required")
    from paddleocr import PaddleOCR

    ocr = PaddleOCR(lang="ru", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
    rows = []
    for path in sys.argv[1:]:
        for result in ocr.predict(path):
            rows.extend(rows_from_result(result))
    print(json.dumps({"invoiceNumber": None, "invoiceDate": None, "items": invoice_items(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
