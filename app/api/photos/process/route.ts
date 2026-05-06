import { NextRequest, NextResponse } from 'next/server'
import { processImage } from '@/lib/image-processing/pipeline'
import { PROCESSING, STORAGE } from '@/lib/image-processing/photo-variants'
import { validateUpload } from '@/lib/image-processing/validate-upload'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const { photoId, userId } = await request.json()
    const supabase = createAdminClient()

    // 1. Fetch photo row to get storage_path
    const { data: photo, error: fetchError } = await supabase
      .from('photos')
      .select('id, storage_path, status')
      .eq('id', photoId)
      .single()

    if (fetchError || !photo) {
      throw new AppError('NOT_FOUND', {
        cause: fetchError ?? undefined,
        logContext: { photoId },
      })
    }

    if (!photo.storage_path) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        message: 'Photo has no original file path',
        logContext: { photoId },
      })
    }

    // 2. Download original from Storage
    const { data: file, error: downloadError } = await supabase
      .storage
      .from(STORAGE.bucket)
      .download(photo.storage_path)

    if (downloadError || !file) {
      throw new AppError('PHOTO_DOWNLOAD_FAILED', {
        cause: downloadError ?? undefined,
        logContext: { photoId, userId, path: photo.storage_path },
      })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // 3. Validate
    await validateUpload(buffer)

    // 4. Mark as processing
    await supabase
      .from('photos')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', photoId)

    // 5. Generate all variants
    const result = await processImage(buffer, userId, photoId)

    // 6. Upload all variant files
    for (const f of result.files) {
      const { error: uploadError } = await supabase
        .storage
        .from(STORAGE.bucket)
        .upload(f.path, f.buffer, {
          contentType: f.contentType,
          upsert: true,
        })

      if (uploadError) {
        throw new AppError('PHOTO_UPLOAD_FAILED', {
          cause: uploadError,
          logContext: { photoId, path: f.path },
        })
      }
    }

    // 7. Delete original from Storage
    await supabase
      .storage
      .from(STORAGE.bucket)
      .remove([photo.storage_path])

    // 8. Update photos row
    await supabase
      .from('photos')
      .update({
        status: 'processed',
        variants: result.variantsJsonb,
        storage_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', photoId)

    return NextResponse.json({ success: true, photoId })

  } catch (error) {
    return handleRouteError(error)
  }
}
