-- Align existing default cheque templates with the reference 80 mm receipt.
UPDATE "ChequeSettings"
SET
  "fontSize" = 14,
  "itemDividers" = true,
  "footerMessage" = CASE
    WHEN btrim("footerMessage") = '' THEN 'Спасибо за вашу покупку'
    ELSE "footerMessage"
  END,
  "blocks" = (
    SELECT jsonb_agg(
      CASE
        WHEN block->>'key' IN ('working_hours', 'contacts', 'item_count', 'branding')
          THEN jsonb_set(block, '{isActive}', 'true'::jsonb)
        WHEN block->>'key' = 'client_phone'
          THEN jsonb_set(block, '{isActive}', 'false'::jsonb)
        ELSE block
      END
      ORDER BY position
    )
    FROM jsonb_array_elements("ChequeSettings"."blocks") WITH ORDINALITY AS entries(block, position)
  )
WHERE "isDefault" = true;

-- QR used to be incorrectly stored as an information block. The renderer
-- reads it from the lower block, where it belongs visually and in settings.
UPDATE "ChequeSettings"
SET "blocks" = (
  SELECT jsonb_agg(
    CASE
      WHEN block->>'key' = 'qr_code' THEN
        jsonb_set(
          jsonb_set(
            jsonb_set(block, '{blockType}', '"lower_block"'::jsonb),
            '{name}',
            '"QR-код со ссылкой"'::jsonb
          ),
          '{sequenceNumber}',
          '355'::jsonb
        )
      ELSE block
    END
    ORDER BY position
  )
  FROM jsonb_array_elements("ChequeSettings"."blocks") WITH ORDINALITY AS entries(block, position)
);
