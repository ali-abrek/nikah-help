import {
  getVariantByPublicName,
  type PublicVariant,
} from '@/lib/image-processing/photo-variants'

interface PhotoProps {
  photoId: string
  variant?: PublicVariant
  alt: string
  className?: string
  protected?: boolean
}

export function Photo({
  photoId,
  variant = 'cover',
  alt,
  className,
  protected: protect = true,
}: PhotoProps) {
  const config = getVariantByPublicName(variant)

  const avifSrc = `/api/photos/stream?photoId=${photoId}&variant=${variant}&fmt=avif`
  const webpSrc = `/api/photos/stream?photoId=${photoId}&variant=${variant}&fmt=webp`

  return (
    <picture>
      <source srcSet={avifSrc} type="image/avif" />
      <source srcSet={webpSrc} type="image/webp" />
      <img
        src={webpSrc}
        alt={alt}
        width={config.width}
        height={config.height}
        className={className}
        loading="lazy"
        decoding="async"
        draggable={false}
        onContextMenu={protect ? (e) => e.preventDefault() : undefined}
        style={{ aspectRatio: `${config.aspectRatio.w}/${config.aspectRatio.h}` }}
      />
    </picture>
  )
}
