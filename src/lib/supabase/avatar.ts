import { supabase } from '@/src/lib/supabase/client';

export const AVATAR_BUCKET_NAME = 'avatars';
const AVATAR_PUBLIC_URL_MARKER = `/storage/v1/object/public/${AVATAR_BUCKET_NAME}/`;

export function extractAvatarStoragePath(pathOrUrl: string | null): string | null {
  if (!pathOrUrl) {
    return null;
  }

  const trimmed = pathOrUrl.trim();
  const markerIndex = trimmed.indexOf(AVATAR_PUBLIC_URL_MARKER);

  if (markerIndex === -1) {
    return trimmed;
  }

  const rawPath = trimmed.slice(markerIndex + AVATAR_PUBLIC_URL_MARKER.length).split('?')[0];
  return decodeURIComponent(rawPath);
}

export function getAvatarPublicUrl(pathOrUrl: string | null): string | null {
  const avatarPath = extractAvatarStoragePath(pathOrUrl);
  if (!avatarPath) {
    return null;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET_NAME).getPublicUrl(avatarPath);
  return data.publicUrl;
}
