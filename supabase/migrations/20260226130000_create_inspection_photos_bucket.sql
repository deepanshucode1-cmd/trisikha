-- Create the private storage bucket for return inspection photos.
-- The bucket is private (public = false) — photos are only accessible
-- via signed URLs generated server-side with the service role key.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'return-inspection-photos',
  'return-inspection-photos',
  false,
  5242880,  -- 5 MB, matches MAX_FILE_SIZE in lib/return-inspection-storage.ts
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: deny all direct public access.
-- The service role (used in uploadInspectionPhoto / getInspectionPhotoUrl)
-- bypasses RLS, so no additional policy is needed for server-side operations.
CREATE POLICY "No public access to inspection photos"
  ON storage.objects
  FOR ALL
  TO public
  USING (bucket_id = 'return-inspection-photos' AND false);
