// Supabase Storage through the secret-key client (server only).
export function createStorage(supabase) {
  return {
    async upload(bucket, path, body, contentType) {
      const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: false });
      if (error) throw new Error(`storage upload failed: ${error.message}`);
    },
    async signedUrl(bucket, path, expiresInSeconds) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      if (error) throw new Error(`storage signed URL failed: ${error.message}`);
      return data.signedUrl;
    },
    publicUrl(bucket, path) {
      return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },
  };
}
