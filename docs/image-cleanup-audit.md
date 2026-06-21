# Image Cleanup Audit

RunMate AI now treats uploaded images as temporary by default. Images are sent to AI for analysis, then only structured Report data should be saved.

This document is audit-only. Do not delete storage objects or database fields automatically until counts are reviewed.

## Storage Buckets To Inspect

Check these Supabase Storage buckets for older objects:

- `sleep-images`
- `meal-images`
- `run-images`
- `workout-images`
- `body-images`

Record:

- bucket name
- object count
- oldest object date
- newest object date
- total size if available

## SQL Audit For Old Image References

Run these checks in Supabase SQL Editor.

```sql
select
  type,
  count(*) as rows_with_image_refs
from public.history_items
where
  data::text ilike '%imageUrl%' or
  data::text ilike '%imageUrls%' or
  data::text ilike '%imagePath%' or
  data::text ilike '%storagePath%' or
  data::text ilike '%thumbnailUrl%' or
  data::text ilike '%imageDataUrl%' or
  data::text ilike '%base64%'
group by type
order by rows_with_image_refs desc;
```

For sampling only:

```sql
select
  id,
  user_id,
  type,
  created_at,
  data
from public.history_items
where
  data::text ilike '%imageUrl%' or
  data::text ilike '%imageUrls%' or
  data::text ilike '%imagePath%' or
  data::text ilike '%storagePath%' or
  data::text ilike '%thumbnailUrl%' or
  data::text ilike '%imageDataUrl%' or
  data::text ilike '%base64%'
limit 20;
```

Inspect the sampled `data` JSON manually and record which image reference fields appear.

## Expected Current Behavior

- Upload page sends image data to AI only for the current request.
- Coach Chat image preview uses session-only browser blob URLs.
- `history_items.data` should not save `imageUrl`, `imageUrls`, `imagePath`, `storagePath`, `thumbnailUrl`, `imageDataUrl`, or `base64`.
- Existing old storage objects may still remain until a separate reviewed cleanup task.

## Cleanup Decision Checklist

Before deleting anything, confirm:

- recent uploads no longer create storage objects
- Report still displays correctly without image references
- no active feature depends on old stored images
- user has exported or accepted removal of old image objects
- cleanup script has a dry-run mode and logs counts first
