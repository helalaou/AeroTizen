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

pub(super) fn sdb_json(raw: &str, max_body: usize) -> Option<serde_json::Value> {
    let (header, body) = raw.split_once("\r\n\r\n")?;
    if !header.starts_with("HTTP/1.0 ") && !header.starts_with("HTTP/1.1 ") {
        return None;
    }
    let status = header.lines().next()?.split_whitespace().nth(1)?;
    if status != "200" {
        return None;
    }
    let mut length = None;
    let mut chunked = false;
    for line in header.lines().skip(1) {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("transfer-encoding") {
            if chunked || !value.trim().eq_ignore_ascii_case("chunked") {
                return None;
            }
            chunked = true;
        }
        if name.eq_ignore_ascii_case("content-length") {
            if length.is_some() {
                return None;
            }
            length = Some(value.trim().parse::<usize>().ok()?);
        }
    }
    if chunked && length.is_some() {
        return None;
    }
    let decoded;
    let body = if chunked {
        decoded = chunks(body.as_bytes())?;
        std::str::from_utf8(&decoded).ok()?
    } else {
        match length {
            Some(length) => body.get(..length)?,
            None => body,
        }
    };
    if body.len() > max_body {
        return None;
    }
    serde_json::from_str(body).ok()
}

fn chunks(mut input: &[u8]) -> Option<Vec<u8>> {
    let mut output = Vec::new();
    loop {
        let line_end = input.windows(2).position(|w| w == b"\r\n")?;
        let length = std::str::from_utf8(&input[..line_end])
            .ok()?
            .split(';')
            .next()?;
        if length.is_empty() || length.len() > 8 || !length.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let length = usize::from_str_radix(length, 16).ok()?;
        input = &input[line_end + 2..];
        if length == 0 {
            return Some(output);
        }
        let chunk = input.get(..length)?;
        if input.get(length..length.checked_add(2)?)? != b"\r\n" {
            return None;
        }
        output.extend_from_slice(chunk);
        input = &input[length + 2..];
    }
}
