use reqwest::Response;

/// Bound both advertised and streamed sizes before parsing an untrusted response.
pub async fn bounded_body(mut response: Response, limit_bytes: usize) -> Option<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > limit_bytes as u64)
    {
        return None;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if chunk.len() > limit_bytes - body.len() {
            return None;
        }
        body.extend_from_slice(&chunk);
    }
    Some(body)
}
