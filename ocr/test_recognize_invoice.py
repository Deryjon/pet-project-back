import unittest

from recognize_invoice import invoice_items, number


def row(*texts):
    return [
        {"text": text, "x": index * 100, "y": 0, "h": 20}
        for index, text in enumerate(texts)
    ]


class InvoiceParserTest(unittest.TestCase):
    def test_numbers_inside_names_are_not_values(self):
        self.assertIsNone(number("ADAPTER 3PIN 20W (FOXCONN)"))
        self.assertIsNone(number("SAMSUNG T2510 25W"))
        self.assertEqual(number("2 X"), 2)
        self.assertEqual(number("190 080"), 190080)

    def test_parses_multiline_megastar_receipt(self):
        rows = [
            row("НАИМЕНОВАНИЕ", "КОЛ X", "ЦЕНА"),
            row("1", "USB CABLE IPHONE 15 KARO", "2 X", "77 220"),
            row("BKA ORIGINAL"),
            row("2", "ADAPTER 3PIN 20W (FOXCONN", "2 X", "190 080"),
            row("N ORIGINAL)"),
            row("3", "ADAPTER 2PIN 20W (FOXCONN", "4 X", "190 080"),
            row("N ORIGINAL)"),
            row("4", "ADAPTER SAMSUNG T2510 25", "2 X", "77 220"),
            row("W 2-PIN (ORG 100%) BLACK"),
            row("5", "ADAPTER SAMSUNG T2510 25", "1 X", "77 220"),
            row("W 2-PIN (ORG 100%) WHITE"),
            row("6", "USB SAMSUNG TC-TC 5A 1M", "3 X", "49 504"),
            row("(ORG 100%) BLACK"),
            row("ИТОГО:", "1 675 091,88"),
        ]

        items = invoice_items(rows)

        self.assertEqual(len(items), 6)
        self.assertEqual([item["quantity"] for item in items], [2, 2, 4, 2, 1, 3])
        self.assertEqual(
            [item["supplyPrice"] for item in items],
            [77220, 190080, 190080, 77220, 77220, 49504],
        )
        self.assertIn("BKA ORIGINAL", items[0]["rawName"])
        self.assertIn("N ORIGINAL", items[1]["rawName"])
        self.assertIn("BLACK", items[3]["rawName"])

    def test_parses_first_item_when_line_number_is_missing(self):
        rows = [
            row("НАИМЕНОВАНИЕ", "КОЛ X", "ЦЕНА"),
            row("USB CABLE IPHONE 15 KARO", "2 X", "77 220"),
            row("BKA ORIGINAL"),
            row("2", "ADAPTER 3PIN 20W", "2 X", "190 080"),
            row("N ORIGINAL"),
            row("ИТОГО:", "534 600"),
        ]

        items = invoice_items(rows)

        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["quantity"], 2)
        self.assertEqual(items[0]["supplyPrice"], 77220)
        self.assertIn("IPHONE 15", items[0]["rawName"])


if __name__ == "__main__":
    unittest.main()
