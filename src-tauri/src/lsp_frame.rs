use std::io::{self, BufRead, Write};

pub fn read_message<R: BufRead>(r: &mut R) -> io::Result<Option<String>> {
    let mut content_length: Option<usize> = None;
    let mut read_any = false;

    loop {
        let mut line = String::new();
        let bytes_read = r.read_line(&mut line)?;
        if bytes_read == 0 {
            if !read_any {
                return Ok(None);
            } else {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "Unexpected EOF while reading LSP headers",
                ));
            }
        }
        read_any = true;

        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            // End of headers
            break;
        }

        if let Some((name, value)) = trimmed.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") {
                let len = value
                    .trim()
                    .parse::<usize>()
                    .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
                content_length = Some(len);
            }
        }
    }

    let len = content_length.ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidData, "Missing Content-Length header")
    })?;

    if len > 64 * 1024 * 1024 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Content-Length exceeds 64MB limit",
        ));
    }

    let mut body_buf = vec![0u8; len];
    r.read_exact(&mut body_buf)?;

    let body = String::from_utf8(body_buf)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    Ok(Some(body))
}

pub fn write_message<W: Write>(w: &mut W, body: &str) -> io::Result<()> {
    let bytes = body.as_bytes();
    write!(w, "Content-Length: {}\r\n\r\n", bytes.len())?;
    w.write_all(bytes)?;
    w.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn reads_two_back_to_back() {
        let mut r = Cursor::new(b"Content-Length: 2\r\n\r\n{}Content-Length: 4\r\n\r\nnull".to_vec());
        assert_eq!(read_message(&mut r).unwrap(), Some("{}".into()));
        assert_eq!(read_message(&mut r).unwrap(), Some("null".into()));
        assert_eq!(read_message(&mut r).unwrap(), None);
    }

    #[test]
    fn length_is_bytes_not_chars() {
        let body = "\"งาน\""; // 11 bytes, 5 chars
        let mut out = Vec::new();
        write_message(&mut out, body).unwrap();
        assert!(out.starts_with(b"Content-Length: 11\r\n\r\n"));
        assert_eq!(read_message(&mut Cursor::new(out)).unwrap(), Some(body.into()));
    }

    #[test]
    fn ignores_other_headers_and_case() {
        let mut r = Cursor::new(b"Content-Type: x\r\ncontent-length: 2\r\n\r\n{}".to_vec());
        assert_eq!(read_message(&mut r).unwrap(), Some("{}".into()));
    }

    #[test]
    fn truncated_body_is_an_error() {
        let mut r = Cursor::new(b"Content-Length: 10\r\n\r\n{}".to_vec());
        assert!(read_message(&mut r).is_err());
    }

    #[test]
    fn missing_length_is_an_error() {
        let mut r = Cursor::new(b"Content-Type: x\r\n\r\n{}".to_vec());
        assert!(read_message(&mut r).is_err());
    }

    #[test]
    fn oversized_length_is_rejected() {
        let mut r = Cursor::new(b"Content-Length: 100000000\r\n\r\n{}".to_vec());
        assert!(read_message(&mut r).is_err());
    }
}
