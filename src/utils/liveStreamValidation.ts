// YouTube URL/stream-key validation, used by the streaming dashboard before
// accepting a stream source. Accepts either a full YouTube watch/live URL
// or a raw RTMP stream key/URL (for users streaming via OBS or similar).
export const validateStreamSource = (input: string): { valid: boolean; type: 'youtube' | 'rtmp' | null; error?: string } => {
  const trimmed = (input || '').trim();
  if (!trimmed) return { valid: false, type: null, error: 'Please enter a stream URL or key' };

  // YouTube watch/live URL patterns
  const ytPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|live\/)|youtu\.be\/)[\w-]+/i;
  if (ytPattern.test(trimmed)) {
    return { valid: true, type: 'youtube' };
  }

  // RTMP stream URL/key (e.g. rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx-xxxx)
  const rtmpPattern = /^rtmp:\/\/.+/i;
  if (rtmpPattern.test(trimmed)) {
    return { valid: true, type: 'rtmp' };
  }

  return { valid: false, type: null, error: 'Enter a valid YouTube URL or RTMP stream key' };
};