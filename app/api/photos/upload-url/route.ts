import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/ratelimit/with-rate-limit'
import { PHOTO_UPLOAD } from '@/lib/ratelimit/presets'
import { handleRouteError } from '@/lib/errors/handler'
import { AppError } from '@/lib/errors/app-error'

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) throw new AppError('AUTH_UNAUTHORIZED')

    const body = (await request.json().catch(() => ({}))) as {
      filename?: string
      position?: number
    }
    const filename = body.filename
    const position = body.position

    if (!filename || typeof filename !== 'string') {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        message: 'filename is required',
      })
    }

    if (typeof position !== 'number' || position < 1 || position > 6) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        message: 'position must be a number between 1 and 6',
      })
    }

    const ext = filename.split('.').pop()?.toLowerCase()
    const validExts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif']
    if (!ext || !validExts.includes(ext)) {
      throw new AppError('VALIDATION_INVALID_INPUT', {
        message: `Invalid file type: ${ext}`,
      })
    }

    const supabase = await createServerSupabase()
    const storagePath = `${userId}/${position}_${Date.now()}.${ext}`

    const { data, error } = await supabase.storage
      .from('profile-photos')
      .createSignedUploadUrl(storagePath, { upsert: true })

    if (error || !data) throw error ?? new Error('Failed to create signed URL')

    return NextResponse.json({
      signedUrl: data.signedUrl,
      path: storagePath,
      token: data.token,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}, PHOTO_UPLOAD)
