use base64::Engine;
use hmac::{Hmac, Mac};
use md5::Md5;
use rand::Rng;
use serde::Serialize;
use serde_json::{json, Value};
use sha1::Sha1;
use sha2::{Digest, Sha256, Sha512};
use std::collections::HashMap;

pub fn text_stats(text: &str) -> Value {
    let chars_with_spaces = text.chars().count();
    let chars_without_spaces = text
        .chars()
        .filter(|c| !c.is_whitespace())
        .count();
    let lines = text.split('\n').count();
    let words = text.split_whitespace().count();
    json!({
        "success": true,
        "chars_with_spaces": chars_with_spaces,
        "chars_without_spaces": chars_without_spaces,
        "lines": lines,
        "words": words,
        "bytes": text.len(),
    })
}

pub fn hash_text(text: &str, algorithm: &str) -> Result<Value, String> {
    let digest = match algorithm {
        "md5" => hex::encode(Md5::digest(text.as_bytes())),
        "sha1" => hex::encode(Sha1::digest(text.as_bytes())),
        "sha256" => hex::encode(Sha256::digest(text.as_bytes())),
        "sha512" => hex::encode(Sha512::digest(text.as_bytes())),
        _ => return Err("不支持的哈希算法".to_string()),
    };
    Ok(json!({
        "success": true,
        "hash": digest,
        "algorithm": algorithm,
    }))
}

pub fn generate_token(
    length: i64,
    uppercase: bool,
    lowercase: bool,
    numbers: bool,
    symbols: bool,
) -> Result<Value, String> {
    if !(1..=512).contains(&length) {
        return Err("长度必须在1-512之间".to_string());
    }
    let mut alphabet = String::new();
    if uppercase {
        alphabet.push_str("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }
    if lowercase {
        alphabet.push_str("abcdefghijklmnopqrstuvwxyz");
    }
    if numbers {
        alphabet.push_str("0123456789");
    }
    if symbols {
        alphabet.push_str("!@#$%^&*()_+-=[]{}|;:,.<>?");
    }
    if alphabet.is_empty() {
        alphabet.push_str("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789");
    }
    let chars: Vec<char> = alphabet.chars().collect();
    let mut rng = rand::rng();
    let token: String = (0..length)
        .map(|_| chars[rng.random_range(0..chars.len())])
        .collect();
    Ok(json!({
        "success": true,
        "token": token,
        "length": length,
    }))
}

pub fn json_yaml_convert(text: &str, direction: &str) -> Result<Value, String> {
    if direction == "json-to-yaml" {
        let value: Value =
            serde_json::from_str(text).map_err(|e| format!("JSON 解析失败: {e}"))?;
        let result = serde_yaml::to_string(&value).map_err(|e| format!("YAML 生成失败: {e}"))?;
        Ok(json!({ "success": true, "result": result, "direction": direction }))
    } else {
        let value: Value =
            serde_yaml::from_str(text).map_err(|e| format!("YAML 解析失败: {e}"))?;
        let result = serde_json::to_string_pretty(&value)
            .map_err(|e| format!("JSON 生成失败: {e}"))?;
        Ok(json!({ "success": true, "result": result, "direction": direction }))
    }
}

pub fn bcrypt_hash(text: &str, rounds: u32) -> Result<Value, String> {
    if !(4..=31).contains(&rounds) {
        return Err("加密轮数必须在4-31之间".to_string());
    }
    let hash = bcrypt::hash(text, rounds).map_err(|e| format!("加密失败: {e}"))?;
    Ok(json!({
        "success": true,
        "hash": hash,
        "rounds": rounds,
    }))
}

pub fn encrypt_text(text: &str, key: &str, action: &str) -> Result<Value, String> {
    let digest = Sha256::digest(key.as_bytes());
    let result = if action == "encrypt" {
        fernet_encrypt(&digest, text.as_bytes())
    } else {
        let plain = fernet_decrypt(&digest, text)?;
        String::from_utf8(plain).map_err(|_| "解密结果不是有效的 UTF-8 文本".to_string())?
    };

    Ok(json!({ "success": true, "result": result, "action": action }))
}

fn fernet_split_key(key: &[u8]) -> (&[u8], &[u8]) {
    (&key[..16], &key[16..32])
}

fn fernet_mac(signing_key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(signing_key).expect("valid HMAC key");
    mac.update(data);
    mac.finalize().into_bytes().into()
}

fn fernet_encrypt(key: &[u8], plaintext: &[u8]) -> String {
    use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
    use rand::RngCore;

    let (signing_key, encryption_key) = fernet_split_key(key);
    let mut iv = [0u8; 16];
    rand::rng().fill_bytes(&mut iv);

    let ciphertext = cbc::Encryptor::<aes::Aes128>::new(encryption_key.into(), &iv.into())
        .encrypt_padded_vec_mut::<Pkcs7>(plaintext);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    let mut token = Vec::with_capacity(1 + 8 + 16 + ciphertext.len() + 32);
    token.push(0x80);
    token.extend_from_slice(&timestamp.to_be_bytes());
    token.extend_from_slice(&iv);
    token.extend_from_slice(&ciphertext);
    let mac = fernet_mac(signing_key, &token);
    token.extend_from_slice(&mac);

    base64::engine::general_purpose::URL_SAFE.encode(token)
}

fn fernet_decrypt(key: &[u8], token: &str) -> Result<Vec<u8>, String> {
    use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};

    let raw = base64::engine::general_purpose::URL_SAFE
        .decode(token.trim())
        .map_err(|_| "密文格式无效".to_string())?;
    if raw.len() < 1 + 8 + 16 + 16 + 32 {
        return Err("密文长度无效".to_string());
    }
    if raw[0] != 0x80 {
        return Err("不支持的密文版本".to_string());
    }

    let (signing_key, encryption_key) = fernet_split_key(key);
    let (signed, mac) = raw.split_at(raw.len() - 32);
    let mut verifier = Hmac::<Sha256>::new_from_slice(signing_key).expect("valid HMAC key");
    verifier.update(signed);
    verifier
        .verify_slice(mac)
        .map_err(|_| "密文校验失败，密钥不匹配或内容已被修改".to_string())?;

    let iv = &signed[9..25];
    let ciphertext = &signed[25..];
    cbc::Decryptor::<aes::Aes128>::new(encryption_key.into(), iv.into())
        .decrypt_padded_vec_mut::<Pkcs7>(ciphertext)
        .map_err(|_| "解密失败".to_string())
}

pub fn hmac_generate(text: &str, key: &str, algorithm: &str) -> Result<Value, String> {
    macro_rules! run {
        ($digest:ty) => {{
            let mut mac = <Hmac<$digest>>::new_from_slice(key.as_bytes())
                .map_err(|e| format!("HMAC 初始化失败: {e}"))?;
            mac.update(text.as_bytes());
            hex::encode(mac.finalize().into_bytes())
        }};
    }
    let result = match algorithm {
        "sha256" => run!(Sha256),
        "sha1" => run!(Sha1),
        "md5" => run!(Md5),
        _ => return Err("不支持的算法".to_string()),
    };
    Ok(json!({ "success": true, "hmac": result, "algorithm": algorithm }))
}

pub fn bip39_generate(strength: i64) -> Result<Value, String> {
    use bip39::{Language, Mnemonic, WordCount};
    let word_count = match strength {
        128 => WordCount::Words12,
        160 => WordCount::Words15,
        192 => WordCount::Words18,
        224 => WordCount::Words21,
        256 => WordCount::Words24,
        _ => return Err("强度必须是 128、160、192、224 或 256".to_string()),
    };
    let mnemonic = Mnemonic::generate_in(Language::English, word_count)
        .map_err(|e| format!("生成助记词失败: {e}"))?;
    let phrase = mnemonic.to_string();
    let count = phrase.split_whitespace().count();
    Ok(json!({
        "success": true,
        "mnemonic": phrase,
        "word_count": count,
    }))
}

pub fn generate_uuid(version: &str, count: i64) -> Result<Value, String> {
    if !(1..=100).contains(&count) {
        return Err("数量必须在1-100之间".to_string());
    }
    let mut values = Vec::new();
    for _ in 0..count {
        let value = match version {
            "v1" => uuid::Uuid::now_v1(&[0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]).to_string(),
            "v4" => uuid::Uuid::new_v4().to_string(),
            _ => return Err("不支持的版本".to_string()),
        };
        values.push(value);
    }
    Ok(json!({ "success": true, "uuids": values, "version": version }))
}

pub fn generate_ulid(count: i64) -> Result<Value, String> {
    if !(1..=100).contains(&count) {
        return Err("数量必须在1-100之间".to_string());
    }
    let values: Vec<String> = (0..count).map(|_| ulid::Ulid::generate().to_string()).collect();
    Ok(json!({ "success": true, "ulids": values }))
}

pub fn boolean_logic(expression: &str) -> Result<Value, String> {
    let mut parser = BoolParser::new(expression);
    let result = parser.parse_or()?;
    parser.skip_whitespace();
    if !parser.at_end() {
        return Err("表达式存在无法解析的内容".to_string());
    }
    Ok(json!({
        "success": true,
        "result": result,
        "expression": expression,
    }))
}

struct BoolParser {
    chars: Vec<char>,
    pos: usize,
}

impl BoolParser {
    fn new(text: &str) -> Self {
        BoolParser {
            chars: text.chars().collect(),
            pos: 0,
        }
    }

    fn at_end(&self) -> bool {
        self.pos >= self.chars.len()
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn skip_whitespace(&mut self) {
        while self.peek().is_some_and(char::is_whitespace) {
            self.pos += 1;
        }
    }

    fn consume_str(&mut self, value: &str) -> bool {
        let chars: Vec<char> = value.chars().collect();
        if self.chars[self.pos..].starts_with(&chars) {
            self.pos += chars.len();
            true
        } else {
            false
        }
    }

    fn consume_word(&mut self, word: &str) -> bool {
        self.skip_whitespace();
        let remaining = &self.chars[self.pos..];
        if remaining.len() < word.len() {
            return false;
        }
        if !remaining[..word.len()]
            .iter()
            .zip(word.chars())
            .all(|(a, b)| a.eq_ignore_ascii_case(&b))
        {
            return false;
        }
        if remaining
            .get(word.len())
            .is_some_and(|c| c.is_alphanumeric() || *c == '_')
        {
            return false;
        }
        self.pos += word.len();
        true
    }

    fn parse_or(&mut self) -> Result<bool, String> {
        let mut value = self.parse_and()?;
        loop {
            self.skip_whitespace();
            let matched = self.consume_str("||") || self.consume_word("or");
            if !matched {
                break;
            }
            let right = self.parse_and()?;
            value = value || right;
        }
        Ok(value)
    }

    fn parse_and(&mut self) -> Result<bool, String> {
        let mut value = self.parse_not()?;
        loop {
            self.skip_whitespace();
            let matched = self.consume_str("&&") || self.consume_word("and");
            if !matched {
                break;
            }
            let right = self.parse_not()?;
            value = value && right;
        }
        Ok(value)
    }

    fn parse_not(&mut self) -> Result<bool, String> {
        self.skip_whitespace();
        if self.peek() == Some('!') && self.chars.get(self.pos + 1) != Some(&'=') {
            self.pos += 1;
            return Ok(!self.parse_not()?);
        }
        if self.consume_word("not") {
            return Ok(!self.parse_not()?);
        }
        self.parse_atom()
    }

    fn parse_atom(&mut self) -> Result<bool, String> {
        self.skip_whitespace();
        if self.peek() == Some('(') {
            self.pos += 1;
            let value = self.parse_or()?;
            self.skip_whitespace();
            if self.peek() != Some(')') {
                return Err("缺少右括号".to_string());
            }
            self.pos += 1;
            return Ok(value);
        }
        if self.consume_word("true") {
            return Ok(true);
        }
        if self.consume_word("false") {
            return Ok(false);
        }
        Err(format!(
            "无法识别的布尔值，位置 {}",
            self.pos + 1
        ))
    }
}

pub fn url_params_parse(url: &str) -> Result<Value, String> {
    if let Ok(parsed) = url::Url::parse(url) {
        let mut netloc = parsed.host_str().unwrap_or("").to_string();
        if let Some(port) = parsed.port() {
            netloc.push_str(&format!(":{port}"));
        }
        let params = query_params(parsed.query().unwrap_or(""));
        return Ok(json!({
            "success": true,
            "scheme": parsed.scheme(),
            "netloc": netloc,
            "path": parsed.path(),
            "params": "",
            "query": parsed.query().unwrap_or(""),
            "fragment": parsed.fragment().unwrap_or(""),
            "query_params": params,
        }));
    }

    // urlparse() accepts relative URLs; mirror that behavior.
    let (before_fragment, fragment) = url.split_once('#').unwrap_or((url, ""));
    let (path, query) = before_fragment
        .split_once('?')
        .unwrap_or((before_fragment, ""));
    Ok(json!({
        "success": true,
        "scheme": "",
        "netloc": "",
        "path": path,
        "params": "",
        "query": query,
        "fragment": fragment,
        "query_params": query_params(query),
    }))
}

fn query_params(query: &str) -> Value {
    let mut grouped: HashMap<String, Vec<String>> = HashMap::new();
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        grouped
            .entry(key.into_owned())
            .or_default()
            .push(value.into_owned());
    }
    let mut map = serde_json::Map::new();
    for (key, values) in grouped {
        if values.len() == 1 {
            map.insert(key, Value::String(values[0].clone()));
        } else {
            map.insert(
                key,
                Value::Array(values.into_iter().map(Value::String).collect()),
            );
        }
    }
    Value::Object(map)
}

pub fn url_params_build(base_url: &str, params: &Value) -> Result<Value, String> {
    if base_url.trim().is_empty() {
        return Err("基础URL不能为空".to_string());
    }
    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    if let Value::Object(map) = params {
        for (key, value) in map {
            match value {
                Value::Array(values) => {
                    for item in values {
                        serializer.append_pair(key, &value_to_string(item));
                    }
                }
                Value::Null => {
                    serializer.append_pair(key, "");
                }
                other => {
                    serializer.append_pair(key, &value_to_string(other));
                }
            };
        }
    }
    let query = serializer.finish();
    let separator = if base_url.contains('?') { '&' } else { '?' };
    Ok(json!({
        "success": true,
        "url": format!("{base_url}{separator}{query}"),
    }))
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Null => String::new(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number.to_string(),
        other => other.to_string(),
    }
}

pub fn parse_json_string(json_text: &str) -> Result<Value, String> {
    let text = json_text.trim();
    if text.is_empty() {
        return Err("JSON字符串不能为空".to_string());
    }
    let mut parsed: Value = serde_json::from_str(text).map_err(|e| {
        format!(
            "JSON格式无效：第 {} 行，第 {} 列，{}",
            e.line(),
            e.column(),
            e
        )
    })?;

    for _ in 0..2 {
        let Value::String(nested) = &parsed else {
            break;
        };
        let nested = nested.trim();
        if nested.is_empty()
            || !matches!(
                nested.chars().next(),
                Some('{' | '[' | '"' | 't' | 'f' | 'n' | '-' | '0'..='9')
            )
        {
            break;
        }
        match serde_json::from_str::<Value>(nested) {
            Ok(value) => parsed = value,
            Err(_) => break,
        }
    }

    Ok(parsed)
}

pub fn json_value_type(value: &Value) -> &'static str {
    match value {
        Value::Object(_) => "object",
        Value::Array(_) => "array",
        Value::String(_) => "string",
        Value::Bool(_) => "boolean",
        Value::Null => "null",
        Value::Number(_) => "number",
    }
}

pub fn serialize_json(
    value: &Value,
    indent: usize,
    ensure_ascii: bool,
    sort_keys: bool,
) -> Result<(String, String), String> {
    let mut value = value.clone();
    if sort_keys {
        sort_value(&mut value);
    }

    let compact = serde_json::to_string(&value).map_err(|e| format!("序列化失败: {e}"))?;
    let pretty = if indent == 0 {
        compact.clone()
    } else {
        let padding = " ".repeat(indent);
        let formatter = serde_json::ser::PrettyFormatter::with_indent(padding.as_bytes());
        let mut buffer = Vec::new();
        let mut serializer = serde_json::Serializer::with_formatter(&mut buffer, formatter);
        value
            .serialize(&mut serializer)
            .map_err(|e| format!("序列化失败: {e}"))?;
        String::from_utf8(buffer).map_err(|e| format!("序列化失败: {e}"))?
    };

    if ensure_ascii {
        Ok((escape_non_ascii(&pretty), escape_non_ascii(&compact)))
    } else {
        Ok((pretty, compact))
    }
}

fn sort_value(value: &mut Value) {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(String, Value)> = std::mem::take(map).into_iter().collect();
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            for (_, item) in entries.iter_mut() {
                sort_value(item);
            }
            *map = entries.into_iter().collect();
        }
        Value::Array(items) => {
            for item in items {
                sort_value(item);
            }
        }
        _ => {}
    }
}

fn escape_non_ascii(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    for ch in text.chars() {
        if ch.is_ascii() {
            output.push(ch);
        } else {
            let code = ch as u32;
            if code <= 0xFFFF {
                output.push_str(&format!("\\u{code:04x}"));
            } else {
                let adjusted = code - 0x1_0000;
                let high = 0xD800 + (adjusted >> 10);
                let low = 0xDC00 + (adjusted & 0x3FF);
                output.push_str(&format!("\\u{high:04x}\\u{low:04x}"));
            }
        }
    }
    output
}
