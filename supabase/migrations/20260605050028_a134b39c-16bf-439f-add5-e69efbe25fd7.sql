
DROP POLICY IF EXISTS "Org members can read realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Org members can send realtime" ON realtime.messages;

CREATE POLICY "Authorized topics read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    split_part(realtime.topic(), ':', 1) = 'org'
    AND public.is_org_member(auth.uid(), NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid)
  )
  OR (
    split_part(realtime.topic(), ':', 1) = 'user'
    AND NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid = auth.uid()
  )
);

CREATE POLICY "Authorized topics write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (
    split_part(realtime.topic(), ':', 1) = 'org'
    AND public.is_org_member(auth.uid(), NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid)
  )
  OR (
    split_part(realtime.topic(), ':', 1) = 'user'
    AND NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid = auth.uid()
  )
);
